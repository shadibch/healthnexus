import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useRole } from "@/lib/role";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Mail,
  MessageSquare,
  Plus,
  Pencil,
  Trash2,
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  SkipForward,
  Eye,
  RotateCcw,
  Bell,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReminderConfig {
  id: number;
  medicalCenterId: number;
  channel: "email" | "whatsapp";
  enabled: boolean;
  offsetValue: number;
  offsetUnit: "minutes" | "hours" | "days";
  label: string | null;
  template: string;
  createdAt: string;
}

interface ReminderLog {
  id: number;
  appointmentId: number;
  patientId: number;
  configId: number;
  channel: string;
  sentAt: string;
  status: "sent" | "failed" | "skipped";
  errorMessage: string | null;
  renderedMessage: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TEMPLATE_VARS = [
  { key: "{{patient_name}}",     label: "Patient Name"     },
  { key: "{{doctor_name}}",      label: "Doctor Name"      },
  { key: "{{clinic_name}}",      label: "Clinic Name"      },
  { key: "{{appointment_date}}", label: "Date"             },
  { key: "{{appointment_time}}", label: "Time"             },
  { key: "{{appointment_type}}", label: "Type"             },
];

const PREVIEW_CTX = {
  "{{patient_name}}":     "Ahmed Al-Rashid",
  "{{doctor_name}}":      "Sarah Johnson",
  "{{clinic_name}}":      "Al Noor Medical Center",
  "{{appointment_date}}": "January 15, 2026",
  "{{appointment_time}}": "10:30 AM",
  "{{appointment_type}}": "Routine",
};

function previewTemplate(template: string): string {
  let result = template;
  for (const [key, val] of Object.entries(PREVIEW_CTX)) {
    result = result.replace(new RegExp(key.replace(/[{}]/g, "\\$&"), "g"), val);
  }
  return result;
}

const CHANNEL_ICONS = {
  email: Mail,
  whatsapp: MessageSquare,
};

const CHANNEL_COLORS = {
  email:    "text-blue-600 bg-blue-50 border-blue-200",
  whatsapp: "text-green-600 bg-green-50 border-green-200",
};

const STATUS_ICONS = {
  sent:    <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
  failed:  <XCircle       className="w-4 h-4 text-red-500"     />,
  skipped: <SkipForward   className="w-4 h-4 text-amber-500"   />,
};

const STATUS_BADGE: Record<string, string> = {
  sent:    "bg-emerald-100 text-emerald-800",
  failed:  "bg-red-100 text-red-800",
  skipped: "bg-amber-100 text-amber-800",
};

// ── Config Editor Dialog ──────────────────────────────────────────────────────

interface EditorProps {
  open: boolean;
  onClose: () => void;
  editing: Partial<ReminderConfig> | null;
  onSave: (data: Partial<ReminderConfig>) => void;
  saving: boolean;
}

function ConfigEditor({ open, onClose, editing, onSave, saving }: EditorProps) {
  const [channel, setChannel] = useState<"email" | "whatsapp">(editing?.channel ?? "email");
  const [offsetValue, setOffsetValue] = useState(String(editing?.offsetValue ?? 24));
  const [offsetUnit, setOffsetUnit] = useState<"minutes" | "hours" | "days">(editing?.offsetUnit ?? "hours");
  const [template, setTemplate] = useState(editing?.template ?? "");
  const [showPreview, setShowPreview] = useState(false);

  function insertVar(key: string) {
    setTemplate((prev) => prev + key);
  }

  function handleSave() {
    const label = `${offsetValue} ${offsetUnit} before`;
    onSave({ channel, offsetValue: Number(offsetValue), offsetUnit, label, template });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing?.id ? "Edit Reminder" : "Add Reminder"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Channel */}
          <div>
            <Label>Channel</Label>
            <div className="flex gap-3 mt-2">
              {(["email", "whatsapp"] as const).map((ch) => {
                const Icon = CHANNEL_ICONS[ch];
                return (
                  <button
                    key={ch}
                    onClick={() => setChannel(ch)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all",
                      channel === ch
                        ? CHANNEL_COLORS[ch]
                        : "border-border text-muted-foreground hover:bg-muted/50",
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {ch === "email" ? "Email" : "WhatsApp"}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Timing */}
          <div>
            <Label>Send this reminder…</Label>
            <div className="flex gap-2 mt-2 items-center">
              <Input
                type="number"
                min="1"
                value={offsetValue}
                onChange={(e) => setOffsetValue(e.target.value)}
                className="w-24"
              />
              <Select value={offsetUnit} onValueChange={(v) => setOffsetUnit(v as any)}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minutes">minutes</SelectItem>
                  <SelectItem value="hours">hours</SelectItem>
                  <SelectItem value="days">days</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">before the appointment</span>
            </div>
          </div>

          {/* Template */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Message Template</Label>
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="text-xs text-primary flex items-center gap-1"
              >
                <Eye className="w-3.5 h-3.5" />
                {showPreview ? "Hide preview" : "Preview"}
              </button>
            </div>

            {/* Variable chips */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              {TEMPLATE_VARS.map((v) => (
                <button
                  key={v.key}
                  onClick={() => insertVar(v.key)}
                  className="text-xs px-2 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 font-mono transition-colors"
                  title={`Insert ${v.key}`}
                >
                  {v.key}
                </button>
              ))}
            </div>

            {showPreview ? (
              <div className="rounded-lg border bg-muted/30 p-4 text-sm whitespace-pre-wrap font-mono min-h-[160px] text-foreground">
                {previewTemplate(template) || <span className="text-muted-foreground italic">Template preview will appear here…</span>}
              </div>
            ) : (
              <Textarea
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                rows={8}
                className="font-mono text-sm resize-y"
                placeholder="Hello {{patient_name}}, you have an appointment on {{appointment_date}}…"
              />
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !template.trim() || !offsetValue}>
            {saving ? "Saving…" : "Save Reminder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Test Reminder Dialog ──────────────────────────────────────────────────────

function TestDialog({
  config,
  onClose,
}: {
  config: ReminderConfig | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [result, setResult] = useState<any>(null);

  const testMutation = useMutation({
    mutationFn: (data: object) =>
      apiFetch<any>("/reminders/test", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: (data) => {
      setResult(data);
      if (!data.devMode) {
        toast({ title: "Test reminder sent!", description: data.note });
      }
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (!config) return null;

  return (
    <Dialog open onOpenChange={() => { setResult(null); onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-4 h-4" /> Test Reminder
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className={cn("flex items-center gap-2 px-3 py-2 rounded-lg border text-sm", CHANNEL_COLORS[config.channel])}>
            {config.channel === "email" ? <Mail className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
            <span className="font-medium capitalize">{config.channel}</span>
            <span className="text-muted-foreground">·</span>
            <span>{config.label}</span>
          </div>

          {config.channel === "email" && (
            <div>
              <Label>Recipient email (optional)</Label>
              <Input
                className="mt-1"
                placeholder="test@example.com"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
              />
            </div>
          )}
          {config.channel === "whatsapp" && (
            <div>
              <Label>Recipient phone (optional)</Label>
              <Input
                className="mt-1"
                placeholder="+971 50 000 0000"
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
              />
            </div>
          )}

          {result && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              {result.devMode && (
                <div className="flex items-start gap-2 p-2 rounded-md bg-amber-50 border border-amber-200 text-sm text-amber-800">
                  <span className="font-semibold shrink-0">Dev mode:</span>
                  <span>{result.note}</span>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Rendered Message</p>
                <pre className="text-xs whitespace-pre-wrap font-mono text-foreground">{result.rendered}</pre>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button
            onClick={() =>
              testMutation.mutate({
                configId: config.id,
                recipientEmail: recipientEmail || undefined,
                recipientPhone: recipientPhone || undefined,
              })
            }
            disabled={testMutation.isPending}
            className="gap-2"
          >
            <Send className="w-3.5 h-3.5" />
            {testMutation.isPending ? "Sending…" : "Send Test"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function RemindersPage() {
  const { hasRole } = useRole();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<Partial<ReminderConfig> | null>(null);
  const [testingConfig, setTestingConfig] = useState<ReminderConfig | null>(null);
  const [expandedLog, setExpandedLog] = useState<number | null>(null);
  const [logsFilter, setLogsFilter] = useState<{ channel?: string; status?: string }>({});

  if (!hasRole("admin", "doctor")) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        You don't have access to reminder settings.
      </div>
    );
  }

  const { data: configs = [], isLoading: configsLoading } = useQuery<ReminderConfig[]>({
    queryKey: ["reminders-config"],
    queryFn: () => apiFetch("/reminders/config"),
  });

  const { data: logs = [], isLoading: logsLoading } = useQuery<ReminderLog[]>({
    queryKey: ["reminders-logs", logsFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (logsFilter.channel) params.set("channel", logsFilter.channel);
      if (logsFilter.status)  params.set("status",  logsFilter.status);
      params.set("limit", "100");
      return apiFetch(`/reminders/logs?${params}`);
    },
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: Partial<ReminderConfig>) =>
      apiFetch("/reminders/config", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reminders-config"] }); setEditorOpen(false); toast({ title: "Reminder added" }); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: Partial<ReminderConfig> & { id: number }) =>
      apiFetch(`/reminders/config/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reminders-config"] }); setEditorOpen(false); toast({ title: "Reminder updated" }); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/reminders/config/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reminders-config"] }); toast({ title: "Reminder deleted" }); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      apiFetch(`/reminders/config/${id}`, { method: "PATCH", body: JSON.stringify({ enabled }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reminders-config"] }),
  });

  function openEditor(config?: ReminderConfig) {
    setEditingConfig(config ?? null);
    setEditorOpen(true);
  }

  function handleSave(data: Partial<ReminderConfig>) {
    if (editingConfig?.id) {
      updateMutation.mutate({ id: editingConfig.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  }

  const emailConfigs = configs.filter((c) => c.channel === "email");
  const whatsappConfigs = configs.filter((c) => c.channel === "whatsapp");

  const sortedConfigs = [...configs].sort((a, b) => {
    const toMin = (c: ReminderConfig) =>
      c.offsetUnit === "days" ? c.offsetValue * 1440 :
      c.offsetUnit === "hours" ? c.offsetValue * 60 :
      c.offsetValue;
    return toMin(b) - toMin(a); // descending: 7 days first
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="w-6 h-6 text-primary" /> Appointment Reminders
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Automatically notify patients before their appointments via Email or WhatsApp.
            Runs every 5 minutes.
          </p>
        </div>
        <Button onClick={() => openEditor()} className="gap-2">
          <Plus className="w-4 h-4" /> Add Reminder
        </Button>
      </div>

      <Tabs defaultValue="settings">
        <TabsList>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="history">
            History
            {logs.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-muted text-muted-foreground">
                {logs.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Settings Tab ── */}
        <TabsContent value="settings" className="mt-4 space-y-6">

          {/* Channel summary cards */}
          <div className="grid grid-cols-2 gap-4">
            {(["email", "whatsapp"] as const).map((ch) => {
              const Icon = CHANNEL_ICONS[ch];
              const channelConfigs = ch === "email" ? emailConfigs : whatsappConfigs;
              const activeCount = channelConfigs.filter((c) => c.enabled).length;
              return (
                <Card key={ch} className={cn("border", CHANNEL_COLORS[ch].split(" ").slice(2).join(" "))}>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className={cn("w-5 h-5", ch === "email" ? "text-blue-600" : "text-green-600")} />
                        <span className="font-semibold">{ch === "email" ? "Email" : "WhatsApp"}</span>
                      </div>
                      <span className={cn(
                        "text-xs font-medium px-2 py-0.5 rounded-full",
                        activeCount > 0 ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
                      )}>
                        {activeCount} active
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {ch === "email"
                        ? "Configure SMTP_HOST env var to enable real delivery"
                        : "Configure TWILIO_* env vars to enable real delivery"}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Reminder list */}
          {configsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)}
            </div>
          ) : sortedConfigs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Bell className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No reminders configured</p>
                <p className="text-sm mt-1">Click "Add Reminder" to create your first one.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {sortedConfigs.map((config) => {
                const Icon = CHANNEL_ICONS[config.channel];
                return (
                  <Card key={config.id} className={cn("border transition-opacity", !config.enabled && "opacity-60")}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className={cn("w-8 h-8 rounded-lg border flex items-center justify-center shrink-0", CHANNEL_COLORS[config.channel])}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">
                              {config.label ?? `${config.offsetValue} ${config.offsetUnit} before`}
                            </span>
                            <Badge variant="outline" className="text-xs capitalize">
                              {config.channel}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1 font-mono">
                            {config.template.split("\n")[0]}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Switch
                            checked={config.enabled}
                            onCheckedChange={(enabled) =>
                              toggleMutation.mutate({ id: config.id, enabled })
                            }
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-8 h-8 text-muted-foreground"
                            onClick={() => setTestingConfig(config)}
                            title="Send test"
                          >
                            <Send className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-8 h-8 text-muted-foreground"
                            onClick={() => openEditor(config)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-8 h-8 text-destructive"
                            onClick={() => deleteMutation.mutate(config.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Scheduler status notice */}
          <Card className="border-dashed">
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RotateCcw className="w-4 h-4 text-primary" />
                <span>Scheduler runs every <strong>5 minutes</strong>. Reminders are sent once per appointment per reminder rule.</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── History Tab ── */}
        <TabsContent value="history" className="mt-4">
          <div className="flex gap-3 mb-4">
            <Select
              value={logsFilter.channel ?? "all"}
              onValueChange={(v) => setLogsFilter((f) => ({ ...f, channel: v === "all" ? undefined : v }))}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All channels</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={logsFilter.status ?? "all"}
              onValueChange={(v) => setLogsFilter((f) => ({ ...f, status: v === "all" ? undefined : v }))}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="skipped">Skipped</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {logsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />)}
            </div>
          ) : logs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No reminder history yet</p>
                <p className="text-sm mt-1">Sent reminders will appear here.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">Time</th>
                    <th className="px-4 py-3 text-left">Appt #</th>
                    <th className="px-4 py-3 text-left">Channel</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logs.map((log) => {
                    const Icon = log.channel === "email" ? Mail : MessageSquare;
                    return (
                      <>
                        <tr
                          key={log.id}
                          className="hover:bg-muted/30 cursor-pointer"
                          onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                        >
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                            {format(new Date(log.sentAt), "MMM d, HH:mm")}
                          </td>
                          <td className="px-4 py-3 font-mono">#{log.appointmentId}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="capitalize">{log.channel}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              {STATUS_ICONS[log.status as keyof typeof STATUS_ICONS] ?? null}
                              <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full capitalize", STATUS_BADGE[log.status] ?? "bg-muted text-muted-foreground")}>
                                {log.status}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">
                            {log.errorMessage ?? (log.status === "sent" ? "Delivered" : "—")}
                          </td>
                        </tr>
                        {expandedLog === log.id && log.renderedMessage && (
                          <tr key={`${log.id}-expand`} className="bg-muted/20">
                            <td colSpan={5} className="px-4 pb-3">
                              <pre className="text-xs whitespace-pre-wrap font-mono text-foreground bg-background border rounded p-3">
                                {log.renderedMessage}
                              </pre>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <ConfigEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        editing={editingConfig}
        onSave={handleSave}
        saving={createMutation.isPending || updateMutation.isPending}
      />
      {testingConfig && (
        <TestDialog config={testingConfig} onClose={() => setTestingConfig(null)} />
      )}
    </div>
  );
}
