import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Stethoscope,
  User,
  Activity,
  FlaskConical,
  Scan,
  Radiation,
  Heart,
  Waves,
  CheckCircle2,
  Clock,
  CornerDownRight,
  ArrowUpRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const ORDER_TYPES: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  lab:        { label: "Lab",       icon: FlaskConical, color: "text-blue-600 bg-blue-50" },
  xray:       { label: "X-Ray",     icon: Radiation,    color: "text-amber-600 bg-amber-50" },
  ct:         { label: "CT",        icon: Scan,         color: "text-purple-600 bg-purple-50" },
  mri:        { label: "MRI",       icon: Scan,         color: "text-indigo-600 bg-indigo-50" },
  ultrasound: { label: "US",        icon: Waves,        color: "text-teal-600 bg-teal-50" },
  ecg:        { label: "ECG",       icon: Heart,        color: "text-red-600 bg-red-50" },
  other:      { label: "Other",     icon: Activity,     color: "text-gray-600 bg-gray-50" },
};

interface MedicalOrder {
  id: number;
  type: string;
  name: string;
  priority: string;
  status: string;
  resultData: string | null;
  orderedAt: string;
}

interface Consultation {
  id: number;
  appointmentId: number | null;
  patientId: number;
  doctorId: number;
  parentConsultationId: number | null;
  encounterType: string;
  patientName: string | null;
  doctorName: string | null;
  chiefComplaint: string | null;
  diagnosis: string | null;
  treatmentPlan: string | null;
  notes: string | null;
  vitals: string | null;
  followUpDate: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  orders?: MedicalOrder[];
}

export default function ConsultationsPage() {
  const { t, lang, isRTL } = useI18n();
  const [, navigate] = useLocation();

  const STATUS_COLORS: Record<string, string> = {
    in_progress: "bg-amber-100 text-amber-800 border-amber-300",
    completed:   "bg-emerald-100 text-emerald-800 border-emerald-300",
    pending:     "bg-blue-100 text-blue-800 border-blue-300",
  };
  const STATUS_LABELS: Record<string, string> = {
    in_progress: t("in_progress"),
    completed:   t("completedStatus"),
    pending:     t("pending"),
  };
  const ENCOUNTER_TYPE_CFG: Record<string, { label: string; labelAr: string; color: string }> = {
    initial:    { label: "Initial",    labelAr: "أولي",   color: "text-blue-700 border-blue-300" },
    follow_up:  { label: "Follow-up",  labelAr: "متابعة", color: "text-amber-700 border-amber-300" },
    emergency:  { label: "Emergency",  labelAr: "طارئ",   color: "text-red-700 border-red-300" },
  };

  const { data: consultations, isLoading } = useQuery<Consultation[]>({
    queryKey: ["consultations"],
    queryFn: () => apiFetch("/consultations?limit=30"),
    refetchInterval: 20000,
  });

  return (
    <div className="space-y-4">
      <div className={cn(isRTL && "text-right")}>
        <h1 className="text-2xl font-bold">{t("consultations")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {consultations?.length ?? 0} {t("records")}
        </p>
      </div>

      <div className="space-y-3">
        {isLoading
          ? [1, 2, 3].map((i) => <Skeleton key={i} className="h-40 w-full" />)
          : consultations?.length === 0
          ? (
            <Card className="border-dashed border-border">
              <CardContent className="py-16 text-center">
                <Stethoscope className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">{t("noConsultations")}</p>
              </CardContent>
            </Card>
          )
          : consultations?.map((c) => {
            const encTypeCfg = ENCOUNTER_TYPE_CFG[c.encounterType] ?? ENCOUNTER_TYPE_CFG.initial;
            const isFollowUp = c.encounterType === "follow_up";
            return (
              <Card key={c.id} className={cn("border-border transition-all", isFollowUp && "border-l-4 border-l-amber-400")}>
                <CardContent className="p-4">
                  {/* Header row */}
                  <div className={cn("flex items-start justify-between gap-2 mb-3", isRTL && "flex-row-reverse")}>
                    <div className={cn("flex items-center gap-2 flex-wrap", isRTL && "flex-row-reverse")}>
                      {isFollowUp && (
                        <CornerDownRight className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      )}
                      <p className="font-semibold text-sm text-muted-foreground">#{c.id}</p>
                      <Badge variant="outline" className={cn("text-xs", encTypeCfg.color)}>
                        {lang === "ar" ? encTypeCfg.labelAr : encTypeCfg.label}
                      </Badge>
                      <Badge variant="outline" className={cn("text-xs", STATUS_COLORS[c.status] ?? "")}>
                        {STATUS_LABELS[c.status] ?? c.status}
                      </Badge>
                      {c.parentConsultationId && (
                        <span className="text-xs text-muted-foreground">
                          ↳ #{c.parentConsultationId}
                        </span>
                      )}
                    </div>
                    <div className={cn("flex items-center gap-2 shrink-0", isRTL && "flex-row-reverse")}>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                      </span>
                      {c.status === "in_progress" && c.appointmentId && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/encounter/${c.appointmentId}`)}
                          className="gap-1 text-xs h-7 px-2"
                        >
                          <ArrowUpRight className="w-3 h-3" />
                          {lang === "ar" ? "فتح" : "Open"}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* People */}
                  <div className={cn("flex items-center gap-4 mb-3 flex-wrap", isRTL && "flex-row-reverse")}>
                    {c.patientName && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <User className="w-3 h-3" />{c.patientName}
                      </span>
                    )}
                    {c.doctorName && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Stethoscope className="w-3 h-3" />{c.doctorName}
                      </span>
                    )}
                    {c.vitals && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Activity className="w-3 h-3" />
                        <span className="font-mono">{c.vitals}</span>
                      </span>
                    )}
                  </div>

                  {/* Clinical content */}
                  <div className="space-y-2">
                    {c.chiefComplaint && (
                      <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-100">
                        <p className={cn("text-xs font-semibold text-blue-700 mb-0.5", isRTL && "text-right")}>{t("chiefComplaint")}</p>
                        <p className={cn("text-sm text-blue-800", isRTL && "text-right")}>{c.chiefComplaint}</p>
                      </div>
                    )}
                    {c.diagnosis && (
                      <div className="p-2.5 rounded-lg bg-muted/40">
                        <p className={cn("text-xs font-semibold text-muted-foreground mb-0.5", isRTL && "text-right")}>{t("diagnosis")}</p>
                        <p className={cn("text-sm", isRTL && "text-right")}>{c.diagnosis}</p>
                      </div>
                    )}
                    {c.treatmentPlan && (
                      <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-100">
                        <p className={cn("text-xs font-semibold text-emerald-700 mb-0.5", isRTL && "text-right")}>{t("treatmentPlan")}</p>
                        <p className={cn("text-sm text-emerald-800", isRTL && "text-right")}>{c.treatmentPlan}</p>
                      </div>
                    )}
                    {c.followUpDate && (
                      <p className={cn("text-xs text-muted-foreground flex items-center gap-1", isRTL && "flex-row-reverse")}>
                        <Clock className="w-3 h-3" />
                        {lang === "ar" ? "موعد المتابعة:" : "Follow-up:"} {c.followUpDate}
                      </p>
                    )}
                  </div>

                  {/* Medical orders inline */}
                  {c.orders && c.orders.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <p className={cn("text-xs font-semibold text-muted-foreground mb-1.5", isRTL && "text-right")}>
                        {lang === "ar" ? "الطلبات الطبية" : "Medical Orders"} ({c.orders.length})
                      </p>
                      <div className={cn("flex flex-wrap gap-1.5", isRTL && "flex-row-reverse")}>
                        {c.orders.map((order) => {
                          const info = ORDER_TYPES[order.type] ?? ORDER_TYPES.other;
                          const Icon = info.icon;
                          const isDone = order.status === "completed";
                          return (
                            <span
                              key={order.id}
                              className={cn(
                                "inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border",
                                isDone
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : cn(info.color, "border-transparent")
                              )}
                            >
                              {isDone
                                ? <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                : <Icon className="w-3 h-3" />}
                              {order.name}
                              {order.priority === "stat" && (
                                <span className="text-red-600 font-bold ml-0.5">!</span>
                              )}
                              {order.priority === "urgent" && (
                                <span className="text-amber-600 font-bold ml-0.5">↑</span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
      </div>
    </div>
  );
}
