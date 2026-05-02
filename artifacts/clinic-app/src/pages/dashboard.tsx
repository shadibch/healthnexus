import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useRole } from "@/lib/role";
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
        { label: "Pending Rx", value: stats?.prescriptionsPending, icon: FileText, color: "text-violet-500" },
        { label: "Low Stock Alerts", value: stats?.lowStockAlerts, icon: AlertTriangle, color: "text-amber-500" },
        { label: "Total Patients", value: stats?.totalPatients, icon: Users, color: "text-blue-500" },
      ]
    : role === "patient"
    ? [
        { label: "Appointments Today", value: stats?.appointmentsToday, icon: CalendarClock, color: "text-blue-500" },
        { label: "Pending Prescriptions", value: stats?.prescriptionsPending, icon: FileText, color: "text-violet-500" },
      ]
    : [
        { label: "Total Patients", value: stats?.totalPatients, icon: Users, color: "text-blue-500" },
        { label: "Doctors", value: stats?.totalDoctors, icon: UserCheck, color: "text-emerald-500" },
        { label: "Today's Appointments", value: stats?.appointmentsToday, icon: CalendarClock, color: "text-indigo-500" },
        { label: "Completed Today", value: stats?.appointmentsCompleted, icon: CheckCircle2, color: "text-emerald-500" },
        { label: "Pending", value: stats?.appointmentsPending, icon: Clock, color: "text-amber-500" },
        { label: "Pending Rx", value: stats?.prescriptionsPending, icon: FileText, color: "text-violet-500" },
        { label: "Low Stock Alerts", value: stats?.lowStockAlerts, icon: AlertTriangle, color: "text-red-500" },
        { label: "Consultations/Month", value: stats?.totalConsultationsThisMonth, icon: Activity, color: "text-teal-500" },
      ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {new Date().toLocaleDateString("en-AE", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="border-border">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
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
              <CardTitle className="text-sm font-semibold">Today's Appointments by Status</CardTitle>
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
              <CardTitle className="text-sm font-semibold">Top Specializations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {loadingStats
                ? [1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)
                : stats?.topSpecializations.map((s) => (
                    <div key={s.specialization} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{s.specialization}</span>
                        <Badge variant="secondary" className="text-xs">{s.doctorCount} doctors</Badge>
                      </div>
                      <span className="text-sm text-muted-foreground font-mono">{s.count} appts</span>
                    </div>
                  ))}
            </CardContent>
          </Card>
        )}

        <Card className={`border-border ${role !== "doctor" ? "md:col-span-2" : ""}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingActivity ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : !activity?.length ? (
              <p className="text-sm text-muted-foreground text-center py-6">No recent activity</p>
            ) : (
              <div className="space-y-3">
                {activity.map((item) => (
                  <div key={item.id} className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      {ACTIVITY_ICONS[item.type] ?? <Activity className="w-4 h-4 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
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
