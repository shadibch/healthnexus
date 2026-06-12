import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, Users, UserPlus, Mail, Loader2, CheckCircle, Clock, Sparkles,
  Database, Download, RotateCcw, Trash2, Plus, ShieldAlert, CalendarClock,
  HardDriveDownload, RefreshCw
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
interface StaffUser {
  id: number;
  name: string | null;
  email: string;
  role: string;
  aiAssistantEnabled: boolean;
}

interface StaffInvite {
  id: number;
  email: string;
  role: string;
  status: string;
}

interface BackupMeta {
  id: string;
  filename: string;
  sizeBytes: number;
  createdAt: string;
  trigger: "scheduled" | "manual";
  status: "ok" | "failed";
  errorMessage?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Backup Panel ──────────────────────────────────────────────────────────────
function BackupPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [restoreTarget, setRestoreTarget] = useState<BackupMeta | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BackupMeta | null>(null);

  const { data: backups, isLoading, refetch } = useQuery<BackupMeta[]>({
    queryKey: ["backups"],
    queryFn: () => apiFetch("/backups"),
    refetchInterval: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: () => apiFetch<BackupMeta>("/backups", { method: "POST" }),
    onSuccess: (meta) => {
      qc.invalidateQueries({ queryKey: ["backups"] });
      if (meta.status === "ok") {
        toast({ title: "Backup created", description: `Size: ${formatBytes(meta.sizeBytes)}` });
      } else {
        toast({ title: "Backup failed", description: meta.errorMessage, variant: "destructive" });
      }
    },
    onError: (e: Error) => toast({ title: "Backup failed", description: e.message, variant: "destructive" }),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => apiFetch<{ ok: boolean; message: string }>(`/backups/${id}/restore`, { method: "POST" }),
    onSuccess: (result) => {
      setRestoreTarget(null);
      if (result.ok) {
        toast({ title: "Restore complete", description: result.message });
        qc.clear();
      } else {
        toast({ title: "Restore failed", description: result.message, variant: "destructive" });
      }
    },
    onError: (e: Error) => toast({ title: "Restore failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/backups/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["backups"] });
      toast({ title: "Backup deleted" });
    },
  });

  const handleDownload = (backup: BackupMeta) => {
    const filename = `clinicflow_${new Date(backup.createdAt).toISOString().slice(0, 10)}.sql`;
    const a = document.createElement("a");
    a.href = `${BASE}/api/backups/${backup.id}/download`;
    a.download = filename;
    a.click();
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="w-5 h-5 text-blue-600" />
                Database Backups
              </CardTitle>
              <CardDescription className="mt-1">
                Full PostgreSQL snapshots. Scheduled daily at 02:00 AM. Up to 30 backups are kept automatically.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh
              </Button>
              <Button
                size="sm"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                className="gap-1.5"
              >
                {createMutation.isPending
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Backing up…</>
                  : <><Plus className="w-3.5 h-3.5" />Create backup</>}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 py-6 text-muted-foreground text-sm justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading backups…
            </div>
          ) : !backups?.length ? (
            <div className="text-center py-10 border border-dashed border-border rounded-xl">
              <HardDriveDownload className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No backups yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Create your first manual backup or wait for the daily schedule.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {backups.map((b) => (
                <div
                  key={b.id}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border transition-colors",
                    b.status === "failed"
                      ? "border-destructive/30 bg-destructive/5"
                      : "border-border hover:bg-muted/30"
                  )}
                >
                  {/* icon */}
                  <div className={cn(
                    "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                    b.status === "failed" ? "bg-destructive/10" : "bg-blue-50"
                  )}>
                    {b.trigger === "scheduled"
                      ? <CalendarClock className={cn("w-4 h-4", b.status === "failed" ? "text-destructive" : "text-blue-600")} />
                      : <Database className={cn("w-4 h-4", b.status === "failed" ? "text-destructive" : "text-blue-600")} />
                    }
                  </div>

                  {/* info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium truncate">
                        {new Date(b.createdAt).toLocaleString("en-AE", {
                          dateStyle: "medium", timeStyle: "short"
                        })}
                      </p>
                      <Badge
                        className={cn(
                          "text-[10px] py-0 shrink-0",
                          b.trigger === "scheduled"
                            ? "bg-slate-100 text-slate-600"
                            : "bg-blue-100 text-blue-700"
                        )}
                      >
                        {b.trigger}
                      </Badge>
                      {b.status === "failed" && (
                        <Badge className="text-[10px] py-0 bg-destructive/10 text-destructive">failed</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {b.status === "ok"
                        ? <>{formatBytes(b.sizeBytes)} · {formatDistanceToNow(new Date(b.createdAt), { addSuffix: true })}</>
                        : b.errorMessage
                      }
                    </p>
                  </div>

                  {/* actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {b.status === "ok" && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-8 h-8 text-muted-foreground hover:text-foreground"
                          title="Download SQL dump"
                          onClick={() => handleDownload(b)}
                        >
                          <Download className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-8 h-8 text-amber-600 hover:bg-amber-50"
                          title="Restore this backup"
                          onClick={() => setRestoreTarget(b)}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-8 h-8 text-destructive/60 hover:text-destructive hover:bg-destructive/10"
                      title="Delete backup"
                      onClick={() => setDeleteTarget(b)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Restore confirmation ── */}
      <AlertDialog open={!!restoreTarget} onOpenChange={(v) => !v && setRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-500" />
              Restore database from backup?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This will <strong>overwrite all current data</strong> with the snapshot
                  taken on <strong>{restoreTarget && new Date(restoreTarget.createdAt).toLocaleString("en-AE", { dateStyle: "long", timeStyle: "short" })}</strong>.
                </p>
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                  <p className="font-semibold mb-1">⚠ This cannot be undone.</p>
                  <p>Consider creating a fresh backup first to preserve the current state before restoring.</p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700 text-white gap-2"
              onClick={() => restoreTarget && restoreMutation.mutate(restoreTarget.id)}
              disabled={restoreMutation.isPending}
            >
              {restoreMutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" />Restoring…</>
                : <><RotateCcw className="w-4 h-4" />Yes, restore</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete confirmation ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this backup?</AlertDialogTitle>
            <AlertDialogDescription>
              The backup from {deleteTarget && new Date(deleteTarget.createdAt).toLocaleString("en-AE", { dateStyle: "medium", timeStyle: "short" })} will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground gap-2"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              <Trash2 className="w-4 h-4" /> Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Main Admin Page ───────────────────────────────────────────────────────────
const ROLE_COLORS: Record<string, string> = {
  doctor:       "bg-emerald-100 text-emerald-800",
  pharmacist:   "bg-purple-100 text-purple-800",
  pharmacy:     "bg-purple-100 text-purple-800",
  receptionist: "bg-orange-100 text-orange-800",
  admin:        "bg-blue-100 text-blue-800",
};

export default function AdminPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"doctor" | "pharmacist" | "receptionist">("doctor");

  const { data, isLoading } = useQuery<{ staff: StaffUser[]; invites: StaffInvite[] }>({
    queryKey: ["staff"],
    queryFn: () => apiFetch("/users/staff"),
  });

  const inviteMutation = useMutation({
    mutationFn: (body: { email: string; role: string }) =>
      apiFetch("/users/invite-staff", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff"] });
      setInviteEmail("");
      toast({ title: "Invitation sent", description: `${inviteEmail} will be assigned the ${inviteRole} role when they sign up.` });
    },
    onError: (e: Error) => toast({ title: "Failed to invite", description: e.message, variant: "destructive" }),
  });

  const toggleAIMutation = useMutation({
    mutationFn: ({ userId, enabled }: { userId: number; enabled: boolean }) =>
      apiFetch("/users/ai-assistant", { method: "PATCH", body: JSON.stringify({ enabled, targetUserId: userId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff"] }),
  });

  const activeStaff = data?.staff.filter(s => s.role !== "admin") ?? [];
  const doctors = activeStaff.filter(s => s.role === "doctor");

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Building2 className="w-6 h-6 text-primary" /> Admin Dashboard
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your medical center staff, AI access, and data backups</p>
      </div>

      {/* ── Invite Staff ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" /> Invite Staff Member
          </CardTitle>
          <CardDescription>
            Enter their email and role. They'll be automatically assigned when they sign up.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-48">
              <Label htmlFor="inviteEmail">Email address</Label>
              <Input
                id="inviteEmail"
                type="email"
                placeholder="doctor@example.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="w-44">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={(v: any) => setInviteRole(v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="doctor">Doctor</SelectItem>
                  <SelectItem value="pharmacist">Pharmacist</SelectItem>
                  <SelectItem value="receptionist">Receptionist</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => inviteMutation.mutate({ email: inviteEmail, role: inviteRole })}
                disabled={!inviteEmail || inviteMutation.isPending}
              >
                {inviteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
                Send Invite
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── AI Access (doctors only) ── */}
      {doctors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" /> AI Assistant Access
            </CardTitle>
            <CardDescription>
              Control which doctors have access to the AI diagnostic and prescription assistant.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {doctors.map(doc => (
                <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20">
                  <div>
                    <p className="font-medium text-sm">{doc.name ?? doc.email}</p>
                    <p className="text-xs text-muted-foreground">{doc.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {doc.aiAssistantEnabled ? "AI enabled" : "AI disabled"}
                    </span>
                    <Switch
                      checked={doc.aiAssistantEnabled}
                      onCheckedChange={(enabled) => toggleAIMutation.mutate({ userId: doc.id, enabled })}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Staff Members ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" /> Staff Members
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : activeStaff.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-6">No staff members yet. Send invitations above.</p>
          ) : (
            <div className="space-y-2">
              {activeStaff.map(s => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                      {(s.name ?? s.email)[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{s.name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{s.email}</p>
                    </div>
                  </div>
                  <Badge className={ROLE_COLORS[s.role] ?? ""}>{s.role}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Pending Invitations ── */}
      {(data?.invites.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-4 h-4" /> Pending Invitations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data!.invites.map(inv => (
                <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg border border-dashed border-border bg-muted/10">
                  <div className="flex items-center gap-3">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{inv.email}</p>
                      <p className="text-xs text-muted-foreground">{inv.role}</p>
                    </div>
                  </div>
                  {inv.status === "accepted" ? (
                    <Badge className="bg-green-100 text-green-700 gap-1">
                      <CheckCircle className="w-3 h-3" /> Accepted
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1 text-muted-foreground">
                      <Clock className="w-3 h-3" /> Pending
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Backups ── */}
      <BackupPanel />
    </div>
  );
}
