import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useRole } from "@/lib/role";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, Clock, Users, CheckCircle2, AlertCircle, Stethoscope } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface QueueItem {
  appointmentId: number;
  queueNumber: number;
  patientId: number;
  patientName: string;
  doctorId: number;
  doctorName: string;
  status: string;
  scheduledAt: string;
  type: string;
  notes: string | null;
  waitingCount: number;
}

export default function QueuePage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t, isRTL } = useI18n();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [advancing, setAdvancing] = useState<number | null>(null);

  const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    scheduled:   { label: t("scheduled"),      color: "text-blue-700",   bg: "bg-blue-50 border-blue-200" },
    confirmed:   { label: t("confirmed"),       color: "text-indigo-700", bg: "bg-indigo-50 border-indigo-200" },
    in_progress: { label: t("in_progress"),     color: "text-amber-700",  bg: "bg-amber-50 border-amber-200" },
    completed:   { label: t("completedStatus"), color: "text-emerald-700",bg: "bg-emerald-50 border-emerald-200" },
    cancelled:   { label: t("cancelled"),       color: "text-red-700",    bg: "bg-red-50 border-red-200" },
    no_show:     { label: t("no_show"),         color: "text-gray-700",   bg: "bg-gray-50 border-gray-200" },
  };

  const { data: queue, isLoading } = useQuery<QueueItem[]>({
    queryKey: ["queue"],
    queryFn: () => apiFetch("/queue"),
    refetchInterval: 15000,
  });

  const advanceMutation = useMutation({
    mutationFn: (appointmentId: number) =>
      apiFetch(`/queue/${appointmentId}/advance`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["queue"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast({ title: t("queueUpdated") });
      setAdvancing(null);
    },
    onError: (e: Error) => {
      toast({ title: t("error"), description: e.message, variant: "destructive" });
      setAdvancing(null);
    },
  });

  const waiting    = queue?.filter((q) => ["scheduled", "confirmed"].includes(q.status)).length ?? 0;
  const inProgress = queue?.filter((q) => q.status === "in_progress").length ?? 0;
  const completed  = queue?.filter((q) => q.status === "completed").length ?? 0;

  const active = queue?.filter((q) => !["completed", "cancelled", "no_show"].includes(q.status)) ?? [];
  const done   = queue?.filter((q) => ["completed", "cancelled", "no_show"].includes(q.status)) ?? [];

  const { hasRole } = useRole();
  const isDoctor = hasRole("doctor");

  const QueueCard = ({ item }: { item: QueueItem }) => {
    const config = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.scheduled;
    const canAdvance = isDoctor && ["scheduled", "confirmed", "in_progress"].includes(item.status);
    // Allow opening encounter for ANY active appointment (scheduled/confirmed/in_progress)
    const canOpenEncounter = isDoctor && ["scheduled", "confirmed", "in_progress"].includes(item.status);
    const time = new Date(item.scheduledAt).toLocaleTimeString(isRTL ? "ar-AE" : "en-AE", {
      hour: "2-digit", minute: "2-digit",
    });
    const advanceLabel =
      item.status === "scheduled" ? t("confirm") :
      item.status === "confirmed"  ? t("start") : t("complete");

    return (
      <Card className={cn("border transition-all", config.bg)}>
        <CardContent className="p-4">
          <div className={cn("flex items-center gap-3", isRTL && "flex-row-reverse")}>
            {/* Queue number */}
            <div className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center font-bold text-xl shrink-0 border",
              config.bg, config.color
            )}>
              {item.queueNumber}
            </div>

            {/* Patient info */}
            <div className="flex-1 min-w-0">
              <div className={cn("flex items-center gap-2", isRTL && "flex-row-reverse")}>
                <p className={cn("font-semibold text-sm truncate", isRTL && "text-right")}>{item.patientName}</p>
                <Badge variant="outline" className={cn("text-xs shrink-0", config.color)}>
                  {config.label}
                </Badge>
              </div>
              <p className={cn("text-xs text-muted-foreground truncate", isRTL && "text-right")}>{item.doctorName}</p>
              <div className={cn("flex items-center gap-3 mt-1 flex-wrap", isRTL && "flex-row-reverse")}>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />{time}
                </span>
                <Badge variant="secondary" className="text-xs capitalize">
                  {item.type.replace("_", " ")}
                </Badge>
                {item.notes && (
                  <span className="text-xs text-muted-foreground italic truncate max-w-[120px]">{item.notes}</span>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className={cn("flex items-center gap-2 shrink-0", isRTL && "flex-row-reverse")}>
              {/* Open Encounter button — available for any active appointment */}
              {canOpenEncounter && (
                <Button
                  size="sm"
                  onClick={() => navigate(`/encounter/${item.appointmentId}`)}
                  className="gap-1 text-xs bg-primary hover:bg-primary/90"
                >
                  <Stethoscope className="w-3.5 h-3.5" />
                  {isRTL ? "فتح السجل" : "Open Encounter"}
                </Button>
              )}

              {/* Advance queue status */}
              {canAdvance && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setAdvancing(item.appointmentId);
                    advanceMutation.mutate(item.appointmentId);
                  }}
                  disabled={advancing === item.appointmentId}
                  className="gap-1 text-xs"
                >
                  {advancing === item.appointmentId ? "..." : (
                    <>
                      {item.status === "in_progress"
                        ? <CheckCircle2 className="w-3.5 h-3.5" />
                        : <ChevronRight className={cn("w-3.5 h-3.5", isRTL && "rotate-180")} />}
                      {advanceLabel}
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <div className={cn(isRTL && "text-right")}>
        <h1 className="text-2xl font-bold">{t("todaysQueue")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {new Date().toLocaleDateString(isRTL ? "ar-AE" : "en-AE", {
            weekday: "long", month: "long", day: "numeric",
          })}
          {isDoctor && user?.name && (
            <span className="ml-2 text-primary font-medium">· {user.name}</span>
          )}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: t("waiting"),    value: waiting,    icon: Users,        color: "text-blue-500" },
          { label: t("inProgress"), value: inProgress, icon: AlertCircle,  color: "text-amber-500" },
          { label: t("completed"),  value: completed,  icon: CheckCircle2, color: "text-emerald-500" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="border-border">
            <CardContent className={cn("p-3 flex items-center justify-between", isRTL && "flex-row-reverse")}>
              <div className={cn(isRTL && "text-right")}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-bold mt-0.5">{value}</p>
              </div>
              <Icon className={`w-5 h-5 ${color}`} />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Queue columns */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <h2 className={cn("text-sm font-semibold text-foreground", isRTL && "text-right")}>
            {t("activeQueue")} ({active.length})
          </h2>
          {isLoading
            ? [1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)
            : active.length === 0
            ? (
              <Card className="border-dashed border-border">
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  {t("queueEmpty")}
                </CardContent>
              </Card>
            )
            : active.map((item) => <QueueCard key={item.appointmentId} item={item} />)}
        </div>

        <div className="space-y-2">
          <h2 className={cn("text-sm font-semibold text-muted-foreground", isRTL && "text-right")}>
            {t("completed")} ({done.length})
          </h2>
          {done.map((item) => <QueueCard key={item.appointmentId} item={item} />)}
        </div>
      </div>
    </div>
  );
}
