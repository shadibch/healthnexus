import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, Clock, Users, CheckCircle2, AlertCircle } from "lucide-react";
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
  waitingCount: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  scheduled: { label: "Waiting", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
  confirmed: { label: "Confirmed", color: "text-indigo-700", bg: "bg-indigo-50 border-indigo-200" },
  in_progress: { label: "In Progress", color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
  completed: { label: "Completed", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  cancelled: { label: "Cancelled", color: "text-red-700", bg: "bg-red-50 border-red-200" },
  no_show: { label: "No Show", color: "text-gray-700", bg: "bg-gray-50 border-gray-200" },
};

function QueueCard({ item, onAdvance, advancing }: { item: QueueItem; onAdvance: () => void; advancing: boolean }) {
  const config = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.scheduled;
  const canAdvance = ["scheduled", "confirmed", "in_progress"].includes(item.status);
  const time = new Date(item.scheduledAt).toLocaleTimeString("en-AE", { hour: "2-digit", minute: "2-digit" });

  return (
    <Card className={cn("border transition-all", config.bg)}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center font-bold text-xl shrink-0 border",
            config.bg, config.color
          )}>
            {item.queueNumber}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm truncate">{item.patientName}</p>
              <Badge
                variant="outline"
                className={cn("text-xs shrink-0", config.color)}
              >
                {config.label}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate">{item.doctorName}</p>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />{time}
              </span>
              <Badge variant="secondary" className="text-xs capitalize">{item.type.replace("_", " ")}</Badge>
            </div>
          </div>
          {canAdvance && (
            <Button
              size="sm"
              variant="outline"
              onClick={onAdvance}
              disabled={advancing}
              className="shrink-0 gap-1"
            >
              {advancing ? "..." : (
                <>
                  {item.status === "in_progress" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  {item.status === "scheduled" ? "Confirm" : item.status === "confirmed" ? "Start" : "Complete"}
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function QueuePage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [advancing, setAdvancing] = useState<number | null>(null);

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
      toast({ title: "Queue updated" });
      setAdvancing(null);
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setAdvancing(null);
    },
  });

  const waiting = queue?.filter((q) => ["scheduled", "confirmed"].includes(q.status)).length ?? 0;
  const inProgress = queue?.filter((q) => q.status === "in_progress").length ?? 0;
  const completed = queue?.filter((q) => q.status === "completed").length ?? 0;

  const active = queue?.filter((q) => !["completed", "cancelled", "no_show"].includes(q.status)) ?? [];
  const done = queue?.filter((q) => ["completed", "cancelled", "no_show"].includes(q.status)) ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Today's Queue</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {new Date().toLocaleDateString("en-AE", { weekday: "long", month: "long", day: "numeric" })}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Waiting", value: waiting, icon: Users, color: "text-blue-500" },
          { label: "In Progress", value: inProgress, icon: AlertCircle, color: "text-amber-500" },
          { label: "Completed", value: completed, icon: CheckCircle2, color: "text-emerald-500" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="border-border">
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-bold mt-0.5">{value}</p>
              </div>
              <Icon className={`w-5 h-5 ${color}`} />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">Active Queue ({active.length})</h2>
          {isLoading
            ? [1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)
            : active.length === 0
            ? <Card className="border-dashed border-border"><CardContent className="py-10 text-center text-sm text-muted-foreground">Queue is empty</CardContent></Card>
            : active.map((item) => (
                <QueueCard
                  key={item.appointmentId}
                  item={item}
                  onAdvance={() => {
                    setAdvancing(item.appointmentId);
                    advanceMutation.mutate(item.appointmentId);
                  }}
                  advancing={advancing === item.appointmentId}
                />
              ))}
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Completed ({done.length})</h2>
          {done.map((item) => (
            <QueueCard
              key={item.appointmentId}
              item={item}
              onAdvance={() => {}}
              advancing={false}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
