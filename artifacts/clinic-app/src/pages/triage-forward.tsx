import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Forward, Loader2, Inbox, CheckCircle2, Bot } from "lucide-react";

type Department = "Reception" | "Doctor" | "Pharmacy" | "Billing" | "IT";
type Priority = "Low" | "Medium" | "High" | "Critical";

interface ClinicTask {
  id: number;
  externalEventId: string;
  taskTitle: string;
  requestorRole: string;
  department: Department;
  priority: Priority;
  status: string;
  patientIdentifier: string | null;
  assignedPerson: string | null;
  originalMessage: string;
  createdAt: string;
}

const DEPARTMENTS: Department[] = ["Reception", "Doctor", "Pharmacy", "Billing", "IT"];

function priorityBadgeClass(priority: Priority) {
  switch (priority) {
    case "Critical": return "bg-red-100 text-red-700 border-red-200";
    case "High": return "bg-orange-100 text-orange-700 border-orange-200";
    case "Medium": return "bg-blue-100 text-blue-700 border-blue-200";
    default: return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

export default function TriageForwardPage() {
  const { lang, isRTL } = useI18n();
  const qc = useQueryClient();

  const unassignedQuery = useQuery<ClinicTask[]>({
    queryKey: ["triage-unassigned"],
    queryFn: () => apiFetch("/triage/tasks?unassigned=true"),
    refetchInterval: 3000,
  });

  const forwardMutation = useMutation({
    mutationFn: ({ id, department, assigned_person }: { id: number; department: Department; assigned_person: string }) =>
      apiFetch(`/triage/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ department, assigned_person, status: "In Progress" }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["triage-unassigned"] });
      qc.invalidateQueries({ queryKey: ["triage-tasks"] });
    },
  });

  const tasks = unassignedQuery.data ?? [];

  return (
    <div className="space-y-4 max-w-3xl mx-auto" dir={isRTL ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2">
            <Forward className="w-6 h-6 text-primary" />
            {lang === "ar" ? "توجيه التذاكر" : "Ticket Forwarding"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {lang === "ar"
              ? "تذاكر لم يتمكن النظام من توجيهها — وجّهها إلى القسم أو الشخص المناسب"
              : "Tickets the automation could not route. Forward each one to the right department and person."}
          </p>
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            {lang === "ar" ? "تحديث كل 3 ثوانٍ" : "Polling every 3s"}
          </span>
        </div>
      </div>

      <Card className="flex flex-col overflow-hidden">
        <CardHeader className="pb-3 border-b bg-muted/20">
          <CardTitle className="text-base flex items-center gap-2">
            <Inbox className="w-4 h-4 text-primary" />
            {lang === "ar" ? "قائمة التذاكر غير الموجّهة" : "Unrouted Tickets"}
            <Badge variant="outline" className="ml-1 text-[11px] bg-rose-50 text-rose-700 border-rose-200">
              {tasks.length}
            </Badge>
          </CardTitle>
        </CardHeader>

        <CardContent className="p-3 space-y-3">
          {unassignedQuery.isLoading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> {lang === "ar" ? "جارٍ التحميل..." : "Loading..."}
            </div>
          )}
          {unassignedQuery.isError && (
            <div className="text-sm text-destructive bg-red-50 border border-red-200 rounded-md p-3">
              {lang === "ar" ? "فشل تحميل التذاكر." : "Failed to load tickets."}
            </div>
          )}
          {!unassignedQuery.isLoading && tasks.length === 0 && (
            <div className="text-center py-14 text-muted-foreground text-sm space-y-2">
              <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500/60" />
              <p>{lang === "ar" ? "لا توجد تذاكر غير موجّهة. أحسنت!" : "No unrouted tickets. All clear!"}</p>
            </div>
          )}

          {tasks.map((task) => (
            <ForwardRow
              key={task.id}
              task={task}
              lang={lang}
              isPending={forwardMutation.isPending}
              onForward={(department, assigned_person) =>
                forwardMutation.mutate({ id: task.id, department, assigned_person })
              }
            />
          ))}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Bot className="w-3.5 h-3.5" />
        {lang === "ar"
          ? "تُعرض هنا فقط التذاكر التي أنشأها التوجيه الآلي دون تعيين مسؤول."
          : "Only tickets created by the automation without an assignee appear here."}
      </p>
    </div>
  );
}

function ForwardRow({
  task,
  lang,
  isPending,
  onForward,
}: {
  task: ClinicTask;
  lang: string;
  isPending: boolean;
  onForward: (department: Department, assignedPerson: string) => void;
}) {
  const [department, setDepartment] = useState<Department>(task.department);
  const [assignedPerson, setAssignedPerson] = useState("");

  const canForward = !!department && assignedPerson.trim().length > 0 && !isPending;

  return (
    <div className="rounded-xl border p-3.5 space-y-3 bg-card">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={cn("text-[10px] font-bold uppercase", priorityBadgeClass(task.priority))}>
              {task.priority}
            </Badge>
            {task.patientIdentifier && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                #{task.patientIdentifier.replace(/^#/, "")}
              </span>
            )}
            <span className="text-[11px] text-muted-foreground">{task.requestorRole}</span>
          </div>
          <h3 className="font-semibold text-sm leading-snug">{task.taskTitle}</h3>
        </div>
        <span className="text-[10px] px-2 py-1 rounded-full font-medium shrink-0 bg-slate-100 text-slate-700">
          {lang === "ar" ? "غير موجّهة" : "Unrouted"}
        </span>
      </div>

      <p className="text-xs text-muted-foreground line-clamp-2 bg-muted/30 rounded-md px-2.5 py-2">
        {task.originalMessage}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] font-medium text-muted-foreground">
            {lang === "ar" ? "القسم" : "Department"}
          </label>
          <Select value={department} onValueChange={(v) => setDepartment(v as Department)}>
            <SelectTrigger className="mt-1 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEPARTMENTS.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground">
            {lang === "ar" ? "الشخص المسؤول" : "Assign to"}
          </label>
          <Input
            className="mt-1 h-9"
            value={assignedPerson}
            onChange={(e) => setAssignedPerson(e.target.value)}
            placeholder={lang === "ar" ? "مثال: د. خالد" : "e.g. Dr. Khaled"}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[10px] text-muted-foreground font-mono truncate">
          event: {task.externalEventId}
        </span>
        <Button
          size="sm"
          className="h-8 text-xs gap-1.5"
          disabled={!canForward}
          onClick={() => onForward(department, assignedPerson.trim())}
        >
          {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Forward className="w-3.5 h-3.5" />}
          {lang === "ar" ? "توجيه" : "Forward"}
        </Button>
      </div>
    </div>
  );
}
