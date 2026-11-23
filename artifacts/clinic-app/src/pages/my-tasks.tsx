import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ClipboardList, Loader2, RefreshCw } from "lucide-react";

type TaskStatus = "Open" | "In Progress" | "Pending Registration" | "Resolved";

interface ClinicTask {
  id: number;
  externalEventId: string;
  taskTitle: string;
  requestorRole: string;
  department: string;
  priority: string;
  status: TaskStatus;
  patientIdentifier: string | null;
  assignedPerson: string | null;
  originalMessage: string;
  createdAt: string;
}

function priorityClass(priority: string) {
  if (priority === "Critical") return "bg-red-100 text-red-700 border-red-200";
  if (priority === "High") return "bg-orange-100 text-orange-700 border-orange-200";
  if (priority === "Medium") return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function statusClass(status: TaskStatus) {
  if (status === "Resolved") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "In Progress") return "bg-blue-50 text-blue-700 border-blue-200";
  if (status === "Pending Registration") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-rose-50 text-rose-700 border-rose-200";
}

export default function MyTasksPage() {
  const { lang, isRTL } = useI18n();
  const ar = lang === "ar";
  const queryClient = useQueryClient();
  const tasksQuery = useQuery<ClinicTask[]>({
    queryKey: ["my-triage-tasks"],
    queryFn: () => apiFetch("/triage/my-tasks"),
    refetchInterval: 15_000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: "In Progress" | "Resolved" }) =>
      apiFetch(`/triage/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-triage-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["triage-tasks"] });
    },
  });

  const tasks = tasksQuery.data ?? [];

  return (
    <div className={cn("space-y-5 max-w-4xl mx-auto", isRTL && "font-arabic")} dir={isRTL ? "rtl" : "ltr"}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-primary" />
            {ar ? "مهامي" : "My Tasks"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {ar ? "المهام المسندة إلى حسابك في مركزك الطبي." : "Tasks assigned to your account in your medical center."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => tasksQuery.refetch()} disabled={tasksQuery.isFetching}>
          {tasksQuery.isFetching
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <RefreshCw className="w-4 h-4" />}
          <span className="ml-2">{ar ? "تحديث" : "Refresh"}</span>
        </Button>
      </div>

      {tasksQuery.isError && (
        <Card><CardContent className="py-8 text-center text-sm text-destructive">
          {ar ? "تعذر تحميل مهامك." : "Could not load your tasks."}
        </CardContent></Card>
      )}
      {tasksQuery.isLoading && (
        <div className="flex justify-center py-12 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
      )}
      {!tasksQuery.isLoading && !tasksQuery.isError && tasks.length === 0 && (
        <Card><CardContent className="py-14 text-center space-y-2 text-muted-foreground">
          <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500/70" />
          <p className="font-medium">{ar ? "لا توجد مهام مسندة إليك" : "No tasks assigned to you"}</p>
          <p className="text-xs">{ar ? "ستظهر هنا المهام التي يوجهها Make إلى اسمك أو بريدك الإلكتروني." : "Tasks assigned by Make to your name or email will appear here."}</p>
        </CardContent></Card>
      )}

      <div className="space-y-3">
        {tasks.map(task => (
          <Card key={task.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className={cn("text-[10px] font-bold uppercase", priorityClass(task.priority))}>{task.priority}</Badge>
                    <Badge variant="outline" className={cn("text-[10px]", statusClass(task.status))}>{task.status}</Badge>
                    {task.patientIdentifier && <Badge variant="outline">#{task.patientIdentifier.replace(/^#/, "")}</Badge>}
                  </div>
                  <CardTitle className="text-base">{task.taskTitle}</CardTitle>
                </div>
                <Badge variant="secondary">{task.department}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{task.originalMessage}</p>
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>{task.requestorRole} · {new Date(task.createdAt).toLocaleString()}</span>
                <div className="flex gap-2">
                  {task.status !== "In Progress" && task.status !== "Resolved" && (
                    <Button size="sm" variant="outline" disabled={updateMutation.isPending}
                      onClick={() => updateMutation.mutate({ id: task.id, status: "In Progress" })}>
                      {ar ? "قيد التنفيذ" : "Start"}
                    </Button>
                  )}
                  {task.status !== "Resolved" && (
                    <Button size="sm" disabled={updateMutation.isPending}
                      onClick={() => updateMutation.mutate({ id: task.id, status: "Resolved" })}>
                      {ar ? "إغلاق المهمة" : "Resolve"}
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-[10px] font-mono text-muted-foreground break-all">{task.externalEventId}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
