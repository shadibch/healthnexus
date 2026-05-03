import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useRole } from "@/lib/role";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  UserCheck,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileText,
  AlertTriangle,
  Activity,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface DashboardStats {
  totalPatients: number;
  totalDoctors: number;
  appointmentsToday: number;
  appointmentsCompleted: number;
  appointmentsPending: number;
  prescriptionsPending: number;
  lowStockAlerts: number;
  totalConsultationsThisMonth: number;
  appointmentsByStatus: { status: string; count: number }[];
  topSpecializations: { specialization: string; count: number; doctorCount: number }[];
}

interface ActivityItem {
  id: string;
  type: string;
  description: string;
  patientName: string | null;
  doctorName: string | null;
  timestamp: string;
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: "#6366f1",
  confirmed: "#0ea5e9",
  in_progress: "#f59e0b",
  completed: "#10b981",
  cancelled: "#ef4444",
  no_show: "#94a3b8",
};

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  patient_registered: <Users className="w-4 h-4 text-blue-500" />,
  appointment_completed: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
  prescription_issued: <FileText className="w-4 h-4 text-violet-500" />,
  prescription_dispensed: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
  consultation_created: <Activity className="w-4 h-4 text-amber-500" />,
};

export default function DashboardPage() {
  const { role } = useRole();
  const { t, isRTL } = useI18n();

  const { data: stats, isLoading: loadingStats } = useQuery<DashboardStats>({
    queryKey: ["dashboard-stats"],
    queryFn: () => apiFetch("/dashboard/stats"),
    refetchInterval: 30000,
  });
  const { data: activity, isLoading: loadingActivity } = useQuery<ActivityItem[]>({
    queryKey: ["dashboard-activity"],
    queryFn: () => apiFetch("/dashboard/activity?limit=8"),
    refetchInterval: 30000,
  });

  const statCards = role === "pharmacy"
    ? [
        { label: t("pendingRxCount"), value: stats?.prescriptionsPending, icon: FileText, color: "text-violet-500" },
        { label: t("lowStockAlerts"), value: stats?.lowStockAlerts, icon: AlertTriangle, color: "text-amber-500" },
        { label: t("totalPatients"), value: stats?.totalPatients, icon: Users, color: "text-blue-500" },
      ]
    : role === "patient"
    ? [
        { label: t("appointmentsToday"), value: stats?.appointmentsToday, icon: CalendarClock, color: "text-blue-500" },
        { label: t("pendingRxCount"), value: stats?.prescriptionsPending, icon: FileText, color: "text-violet-500" },
      ]
    : [
        { label: t("totalPatients"), value: stats?.totalPatients, icon: Users, color: "text-blue-500" },
        { label: t("doctors"), value: stats?.totalDoctors, icon: UserCheck, color: "text-emerald-500" },
        { label: t("appointmentsToday"), value: stats?.appointmentsToday, icon: CalendarClock, color: "text-indigo-500" },
        { label: t("completedToday"), value: stats?.appointmentsCompleted, icon: CheckCircle2, color: "text-emerald-500" },
        { label: t("pending"), value: stats?.appointmentsPending, icon: Clock, color: "text-amber-500" },
        { label: t("pendingRxCount"), value: stats?.prescriptionsPending, icon: FileText, color: "text-violet-500" },
        { label: t("lowStockAlerts"), value: stats?.lowStockAlerts, icon: AlertTriangle, color: "text-red-500" },
        { label: t("consultationsMonth"), value: stats?.totalConsultationsThisMonth, icon: Activity, color: "text-teal-500" },
      ];

  return (
    <div className="space-y-6">
      <div className={cn(isRTL && "text-right")}>
        <h1 className="text-2xl font-bold text-foreground">{t("dashboard")}</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {new Date().toLocaleDateString(isRTL ? "ar-AE" : "en-AE", {
            weekday: "long", year: "numeric", month: "long", day: "numeric",
          })}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="border-border">
            <CardContent className="p-4">
              <div className={cn("flex items-start justify-between", isRTL && "flex-row-reverse")}>
                <div className={cn(isRTL && "text-right")}>
                  <p className="text-xs text-muted-foreground font-medium">{label}</p>
                  {loadingStats ? (
                    <Skeleton className="h-8 w-12 mt-1" />
                  ) : (
                    <p className="text-3xl font-bold mt-0.5">{value ?? 0}</p>
                  )}
                </div>
                <Icon className={`w-5 h-5 mt-0.5 ${color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {role === "doctor" && (
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className={cn("text-sm font-semibold", isRTL && "text-right")}>{t("appointmentsByStatus")}</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingStats ? (
                <Skeleton className="h-36 w-full" />
              ) : (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={stats?.appointmentsByStatus} barSize={24}>
                    <XAxis dataKey="status" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {stats?.appointmentsByStatus.map((entry) => (
                        <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? "#94a3b8"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        )}

        {role === "doctor" && (
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className={cn("text-sm font-semibold", isRTL && "text-right")}>{t("topSpecializations")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {loadingStats
                ? [1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)
                : stats?.topSpecializations.map((s) => (
                    <div key={s.specialization} className={cn("flex items-center justify-between", isRTL && "flex-row-reverse")}>
                      <div className={cn("flex items-center gap-2", isRTL && "flex-row-reverse")}>
                        <span className="text-sm font-medium">{s.specialization}</span>
                        <Badge variant="secondary" className="text-xs">{s.doctorCount} {t("doctorsCount")}</Badge>
                      </div>
                      <span className="text-sm text-muted-foreground font-mono">{s.count} {t("appts")}</span>
                    </div>
                  ))}
            </CardContent>
          </Card>
        )}

        <Card className={`border-border ${role !== "doctor" ? "md:col-span-2" : ""}`}>
          <CardHeader className="pb-2">
            <CardTitle className={cn("text-sm font-semibold", isRTL && "text-right")}>{t("recentActivity")}</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingActivity ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : !activity?.length ? (
              <p className="text-sm text-muted-foreground text-center py-6">{t("noRecentActivity")}</p>
            ) : (
              <div className="space-y-3">
                {activity.map((item) => (
                  <div key={item.id} className={cn("flex items-start gap-3", isRTL && "flex-row-reverse")}>
                    <div className="mt-0.5 shrink-0">
                      {ACTIVITY_ICONS[item.type] ?? <Activity className="w-4 h-4 text-muted-foreground" />}
                    </div>
                    <div className={cn("flex-1 min-w-0", isRTL && "text-right")}>
                      <p className="text-sm font-medium truncate">{item.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.patientName && <span>{item.patientName}</span>}
                        {item.doctorName && <span className="ml-1">· {item.doctorName}</span>}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                      {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
