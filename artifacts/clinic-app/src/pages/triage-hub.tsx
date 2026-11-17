import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Send, Bot, User, Stethoscope, CheckCircle2, Loader2, AlertCircle } from "lucide-react";

type RequestorRole = "Patient" | "Nurse" | "Doctor" | "Manager" | "Vendor";
type Department = "Reception" | "Doctor" | "Pharmacy" | "Billing" | "IT";
type Priority = "Low" | "Medium" | "High" | "Critical";
type TaskStatus = "Open" | "In Progress" | "Pending Registration" | "Resolved";

interface ClinicTask {
  id: number;
  externalEventId: string;
  taskTitle: string;
  requestorRole: RequestorRole;
  department: Department;
  priority: Priority;
  status: TaskStatus;
  patientIdentifier: string | null;
  assignedPerson: string | null;
  originalMessage: string;
  createdAt: string;
}

interface DispatchedMessage {
  id: string;
  eventId: string;
  sender: string;
  requestorRole: RequestorRole;
  message: string;
  timestamp: string;
  status: "dispatching" | "sent" | "error";
  error?: string;
}

const NURSE_SENDER = "nurse.amira@camsclinic.org";
const PATIENT_SENDER = "patient@example.com";

const SAMPLE_PROMPTS = [
  "Dr. Khaled, urgent MRI pre-approval needed for patient file #9921 before noon.",
  "Hi, I need to book a pediatric follow-up with Dr. Khaled tomorrow at 5 PM for file #9921.",
];

const DEPARTMENTS: Array<"All" | Department> = ["All", "Doctor", "Reception", "Billing", "Pharmacy", "IT"];

function priorityBadgeClass(priority: Priority) {
  switch (priority) {
    case "Critical": return "bg-red-100 text-red-700 border-red-200";
    case "High": return "bg-orange-100 text-orange-700 border-orange-200";
    case "Medium": return "bg-blue-100 text-blue-700 border-blue-200";
    case "Low": return "bg-gray-100 text-gray-700 border-gray-200";
    default: return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

function deptBadgeClass(dept: Department) {
  switch (dept) {
    case "Doctor": return "bg-emerald-100 text-emerald-700";
    case "Reception": return "bg-violet-100 text-violet-700";
    case "Billing": return "bg-amber-100 text-amber-700";
    case "Pharmacy": return "bg-cyan-100 text-cyan-700";
    case "IT": return "bg-slate-100 text-slate-700";
    default: return "bg-slate-100 text-slate-700";
  }
}

function statusBadgeClass(status: TaskStatus) {
  switch (status) {
    case "Open": return "bg-rose-50 text-rose-700 border-rose-200";
    case "In Progress": return "bg-blue-50 text-blue-700 border-blue-200";
    case "Pending Registration": return "bg-amber-50 text-amber-700 border-amber-200";
    case "Resolved": return "bg-emerald-50 text-emerald-700 border-emerald-200";
    default: return "bg-slate-50 text-slate-700 border-slate-200";
  }
}

export default function TriageHubPage() {
  const { lang, isRTL } = useI18n();
  const qc = useQueryClient();

  // Left panel state
  const [roleTab, setRoleTab] = useState<"Nurse" | "Patient">("Nurse");
  const [message, setMessage] = useState("");
  const [feed, setFeed] = useState<DispatchedMessage[]>([]);
  const feedEndRef = useRef<HTMLDivElement>(null);

  // Right panel state
  const [deptFilter, setDeptFilter] = useState<"All" | Department>("All");
  const [drKhaledOnly, setDrKhaledOnly] = useState(false);
  const [seenIds, setSeenIds] = useState<Set<number>>(new Set());
  const [highlightIds, setHighlightIds] = useState<Set<number>>(new Set());
  const initializedRef = useRef(false);

  const sender = roleTab === "Nurse" ? NURSE_SENDER : PATIENT_SENDER;

  const tasksQuery = useQuery<ClinicTask[]>({
    queryKey: ["triage-tasks"],
    queryFn: () => apiFetch("/triage/tasks"),
    refetchInterval: 2000,
  });

  const dispatchMutation = useMutation({
    mutationFn: async (payload: { localId: string; sender: string; requestor_role: RequestorRole; message: string }) => {
      const res = await apiFetch<{ success: boolean; event_id: string }>("/triage/dispatch", {
        method: "POST",
        body: JSON.stringify({
          sender: payload.sender,
          requestor_role: payload.requestor_role,
          message: payload.message,
        }),
      });
      return { ...res, localId: payload.localId };
    },
    onSuccess: (data) => {
      setFeed((prev) => prev.map((m) => m.id === data.localId ? { ...m, eventId: data.event_id, status: "sent" } : m));
    },
    onError: (err: any, vars) => {
      setFeed((prev) => prev.map((m) => m.id === vars.localId ? { ...m, status: "error", error: err?.message || "Webhook unreachable" } : m));
    },
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: "In Progress" | "Resolved" }) =>
      apiFetch(`/triage/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["triage-tasks"] }),
  });

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [feed]);

  // Track new tasks for highlight animation
  useEffect(() => {
    const tasks = tasksQuery.data;
    if (!tasks) return;
    if (!initializedRef.current) {
      setSeenIds(new Set(tasks.map((t) => t.id)));
      initializedRef.current = true;
      return;
    }
    const newOnes = tasks.filter((t) => !seenIds.has(t.id)).map((t) => t.id);
    if (newOnes.length > 0) {
      setSeenIds((prev) => {
        const next = new Set(prev);
        newOnes.forEach((id) => next.add(id));
        return next;
      });
      setHighlightIds((prev) => {
        const next = new Set(prev);
        newOnes.forEach((id) => next.add(id));
        return next;
      });
      const timer = setTimeout(() => {
        setHighlightIds((prev) => {
          const next = new Set(prev);
          newOnes.forEach((id) => next.delete(id));
          return next;
        });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [tasksQuery.data, seenIds]);

  const filteredTasks = useMemo(() => {
    const all = tasksQuery.data ?? [];
    return all.filter((t) => {
      if (deptFilter !== "All" && t.department !== deptFilter) return false;
      if (drKhaledOnly && t.assignedPerson !== "Dr. Khaled") return false;
      return true;
    });
  }, [tasksQuery.data, deptFilter, drKhaledOnly]);

  function send(msg: string) {
    const text = msg.trim();
    if (!text) return;
    const localId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const item: DispatchedMessage = {
      id: localId,
      eventId: "",
      sender,
      requestorRole: roleTab,
      message: text,
      timestamp: new Date().toISOString(),
      status: "dispatching",
    };
    setFeed((prev) => [...prev, item]);
    setMessage("");
    dispatchMutation.mutate({ localId, sender, requestor_role: roleTab, message: text });
  }

  return (
    <div className="space-y-4" dir={isRTL ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2">
            <Bot className="w-6 h-6 text-primary" />
            {lang === "ar" ? "الفرز والتوزيع بالذكاء الاصطناعي" : "AI Triage & Dispatch"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {lang === "ar"
              ? "مركز عمليات حي لفرز الطلبات وتوزيع المهام عبر Make.com"
              : "Live clinical intake and operations hub powered by Make.com automation"}
          </p>
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            {lang === "ar" ? "تحديث كل 2 ثانية" : "Polling every 2s"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[70vh]">
        {/* Left: Quick Send */}
        <Card className="flex flex-col overflow-hidden">
          <CardHeader className="pb-3 border-b bg-muted/20">
            <CardTitle className="text-base flex items-center gap-2">
              <Send className="w-4 h-4 text-primary" />
              {lang === "ar" ? "إرسال سريع (ممرضة / مريض)" : "Nurse / Patient Quick Send"}
            </CardTitle>
            <Tabs value={roleTab} onValueChange={(v) => setRoleTab(v as "Nurse" | "Patient")} className="mt-2">
              <TabsList className="grid grid-cols-2 w-full max-w-sm">
                <TabsTrigger value="Nurse" className="gap-1.5">
                  <Stethoscope className="w-3.5 h-3.5" />
                  Nurse
                </TabsTrigger>
                <TabsTrigger value="Patient" className="gap-1.5">
                  <User className="w-3.5 h-3.5" />
                  Patient
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="text-xs text-muted-foreground mt-1">
              {lang === "ar" ? "المرسل" : "Sender"}: <span className="font-medium text-foreground">{sender}</span>
            </div>
          </CardHeader>

          <CardContent className="flex-1 flex flex-col p-0 min-h-0">
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-background to-muted/10">
              {feed.length === 0 && (
                <div className="h-full min-h-[220px] flex items-center justify-center text-center text-sm text-muted-foreground">
                  <div>
                    <Bot className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    {lang === "ar" ? "أرسل رسالة لبدء الفرز" : "Send a message to dispatch it to AI triage"}
                  </div>
                </div>
              )}
              {feed.map((m) => (
                <div key={m.id} className={cn("flex", isRTL ? "justify-start" : "justify-end")}>
                  <div className="max-w-[92%] rounded-2xl rounded-br-md bg-primary text-primary-foreground px-4 py-2.5 shadow-sm space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap text-[11px] opacity-90">
                      <span className="font-semibold inline-flex items-center gap-1">
                        {m.requestorRole === "Nurse" ? <Stethoscope className="w-3 h-3" /> : <User className="w-3 h-3" />}
                        {m.requestorRole}
                      </span>
                      <span>•</span>
                      <span>{new Date(m.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{m.message}</p>
                    <div className="flex items-center gap-2 flex-wrap pt-0.5">
                      {m.eventId && (
                        <span className="text-[10px] font-mono bg-primary-foreground/15 rounded px-1.5 py-0.5">
                          {m.eventId}
                        </span>
                      )}
                      {m.status === "dispatching" && (
                        <span className="text-[11px] inline-flex items-center gap-1 opacity-90">
                          <Loader2 className="w-3 h-3 animate-spin" /> Dispatched to AI Triage...
                        </span>
                      )}
                      {m.status === "sent" && (
                        <span className="text-[11px] inline-flex items-center gap-1 opacity-90">
                          <CheckCircle2 className="w-3 h-3" /> Dispatched to AI Triage
                        </span>
                      )}
                      {m.status === "error" && (
                        <span className="text-[11px] inline-flex items-center gap-1 text-red-100 bg-red-900/30 rounded px-1.5 py-0.5">
                          <AlertCircle className="w-3 h-3" /> {m.error || "Webhook unreachable"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={feedEndRef} />
            </div>

            <div className="border-t p-3 space-y-2 bg-background">
              <div className="flex flex-wrap gap-2">
                {SAMPLE_PROMPTS.map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setMessage(p)}
                    className="text-xs text-left px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 hover:bg-primary/10 text-foreground transition-colors max-w-full"
                  >
                    {p.length > 60 ? `${p.slice(0, 60)}…` : p}
                  </button>
                ))}
              </div>
              <form
                className="flex gap-2"
                onSubmit={(e) => { e.preventDefault(); send(message); }}
              >
                <Input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={lang === "ar" ? "اكتب رسالة الفرز..." : "Type a triage message..."}
                  className="flex-1"
                />
                <Button type="submit" disabled={!message.trim() || dispatchMutation.isPending}>
                  {dispatchMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </form>
              {dispatchMutation.isError && (
                <p className="text-xs text-destructive">
                  {lang === "ar" ? "تعذر الوصول إلى Webhook. حاول مرة أخرى." : "Unable to reach the Make.com webhook. Please try again."}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Right: Live Dashboard */}
        <Card className="flex flex-col overflow-hidden">
          <CardHeader className="pb-3 border-b bg-muted/20 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <Stethoscope className="w-4 h-4 text-primary" />
                {lang === "ar" ? "لوحة المهام الحية" : "Live Doctor & Department Task Dashboard"}
              </CardTitle>
              <button
                type="button"
                onClick={() => setDrKhaledOnly((v) => !v)}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-full border font-medium transition-colors",
                  drKhaledOnly
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-background hover:bg-muted border-border text-foreground"
                )}
              >
                Dr. Khaled&apos;s Queue
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DEPARTMENTS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDeptFilter(d)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-xs font-medium border transition-colors",
                    deptFilter === d
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted border-border text-muted-foreground"
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </CardHeader>

          <CardContent className="flex-1 overflow-y-auto p-3 space-y-3">
            {tasksQuery.isLoading && (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading tasks...
              </div>
            )}
            {tasksQuery.isError && (
              <div className="text-sm text-destructive bg-red-50 border border-red-200 rounded-md p-3">
                Failed to load triage tasks.
              </div>
            )}
            {!tasksQuery.isLoading && filteredTasks.length === 0 && (
              <div className="text-center py-12 text-muted-foreground text-sm">
                {lang === "ar" ? "لا توجد مهام بعد" : "No triage tasks yet. Dispatch a message to create one."}
              </div>
            )}

            {filteredTasks.map((task) => {
              const isNew = highlightIds.has(task.id);
              return (
                <div
                  key={task.id}
                  className={cn(
                    "rounded-xl border p-3.5 space-y-2.5 bg-card transition-all duration-500",
                    isNew && "ring-2 ring-emerald-400/70 bg-emerald-50/50 shadow-md"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={cn("text-[10px] font-bold uppercase", priorityBadgeClass(task.priority))}>
                          {task.priority}
                        </Badge>
                        <Badge variant="outline" className={cn("text-[10px]", statusBadgeClass(task.status))}>
                          {task.status}
                        </Badge>
                        {task.patientIdentifier && (
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                            #{task.patientIdentifier.replace(/^#/, "")}
                          </span>
                        )}
                      </div>
                      <h3 className="font-semibold text-sm leading-snug">{task.taskTitle}</h3>
                    </div>
                    <span className={cn("text-[10px] px-2 py-1 rounded-full font-medium shrink-0", deptBadgeClass(task.department))}>
                      {task.department}
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground line-clamp-2 bg-muted/30 rounded-md px-2.5 py-2">
                    {task.originalMessage}
                  </p>

                  <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                    <div className="flex items-center gap-2 flex-wrap text-muted-foreground">
                      <span className="font-medium text-foreground">{task.assignedPerson || "Unassigned"}</span>
                      <span>•</span>
                      <span>{task.requestorRole}</span>
                      <span>•</span>
                      <span>{new Date(task.createdAt).toLocaleTimeString()}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {task.status !== "In Progress" && task.status !== "Resolved" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs px-2.5"
                          disabled={patchMutation.isPending}
                          onClick={() => patchMutation.mutate({ id: task.id, status: "In Progress" })}
                        >
                          In Progress
                        </Button>
                      )}
                      {task.status !== "Resolved" && (
                        <Button
                          size="sm"
                          className="h-7 text-xs px-2.5"
                          disabled={patchMutation.isPending}
                          onClick={() => patchMutation.mutate({ id: task.id, status: "Resolved" })}
                        >
                          Resolve
                        </Button>
                      )}
                      {task.status === "Resolved" && (
                        <span className="text-emerald-600 inline-flex items-center gap-1 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Resolved
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono truncate">
                    event: {task.externalEventId}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
