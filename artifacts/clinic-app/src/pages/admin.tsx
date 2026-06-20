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
  Building2, Users, UserPlus, Loader2, CheckCircle, Clock, Sparkles,
  Database, Download, RotateCcw, Trash2, ShieldAlert, CalendarClock,
  HardDriveDownload, RefreshCw, Eye, EyeOff, Copy, Check, Plus, Mail, X,
  UserX, UserCheck,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
interface StaffUser {
  id: number;
  name: string | null;
  email: string;
  role: string;
  roles: string[];
  deactivated: boolean;
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

  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createRole, setCreateRole] = useState<"doctor" | "pharmacist" | "receptionist">("doctor");
  const [createSpec, setCreateSpec] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery<{ staff: StaffUser[]; invites: StaffInvite[] }>({
    queryKey: ["staff"],
    queryFn: () => apiFetch("/users/staff"),
  });

  const createStaffMutation = useMutation({
    mutationFn: (body: { name: string; email: string; role: string; tempPassword: string; specialization?: string }) =>
      apiFetch("/users/create-staff", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["staff"] });
      setCreateName("");
      setCreateEmail("");
      setCreateRole("doctor");
      setCreateSpec("");
      setCreatePassword("");
      toast({
        title: "Account created",
        description: `${vars.email} can now sign in with the temporary password you set. They'll be asked to change it on first login.`,
      });
    },
    onError: (e: Error) => toast({ title: "Failed to create account", description: e.message, variant: "destructive" }),
  });

  const [addingRoleFor, setAddingRoleFor] = useState<number | null>(null);

  const rolesMutation = useMutation({
    mutationFn: ({ userId, roles }: { userId: number; roles: string[] }) =>
      apiFetch(`/users/${userId}/roles`, { method: "PATCH", body: JSON.stringify({ roles }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff"] }),
    onError: (e: Error) => toast({ title: "Failed to update roles", description: e.message, variant: "destructive" }),
  });

  const deactivateMutation = useMutation({
    mutationFn: ({ userId, deactivated }: { userId: number; deactivated: boolean }) =>
      apiFetch(`/users/${userId}/deactivate`, { method: "PATCH", body: JSON.stringify({ deactivated }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff"] }),
    onError: (e: Error) => toast({ title: "Failed to update account status", description: e.message, variant: "destructive" }),
  });

  const toggleAIMutation = useMutation({
    mutationFn: ({ userId, enabled }: { userId: number; enabled: boolean }) =>
      apiFetch("/users/ai-assistant", { method: "PATCH", body: JSON.stringify({ enabled, targetUserId: userId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff"] }),
  });

  const allStaff = data?.staff ?? [];
  const doctors = allStaff.filter(s => (s.roles ?? []).includes("doctor"));

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Building2 className="w-6 h-6 text-primary" /> Admin Dashboard
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your medical center staff, AI access, and data backups</p>
      </div>

      {/* ── Create Staff Account ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" /> Create Staff Account
          </CardTitle>
          <CardDescription>
            Create a login for a staff member. They'll sign in with the temporary password you set and will be prompted to change it on first login.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="createName">Full Name</Label>
              <Input
                id="createName"
                placeholder="e.g. Dr. Sarah Al-Mansoori"
                value={createName}
                onChange={e => setCreateName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="createEmail">Email Address</Label>
              <Input
                id="createEmail"
                type="email"
                placeholder="staff@clinic.ae"
                value={createEmail}
                onChange={e => setCreateEmail(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Role</Label>
              <Select value={createRole} onValueChange={(v: any) => setCreateRole(v)}>
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
            {createRole === "doctor" && (
              <div>
                <Label htmlFor="createSpec">Specialization</Label>
                <Input
                  id="createSpec"
                  placeholder="e.g. Cardiology"
                  value={createSpec}
                  onChange={e => setCreateSpec(e.target.value)}
                  className="mt-1"
                />
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="createPassword">Temporary Password</Label>
            <div className="relative mt-1 flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="createPassword"
                  type={showPassword ? "text" : "password"}
                  placeholder="Min. 8 characters"
                  value={createPassword}
                  onChange={e => setCreatePassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowPassword(v => !v)}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {createPassword && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="Copy password"
                  onClick={() => {
                    navigator.clipboard.writeText(createPassword);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Share this with the staff member — they'll be required to change it on first login.</p>
          </div>

          <Button
            onClick={() => createStaffMutation.mutate({
              name: createName,
              email: createEmail,
              role: createRole,
              tempPassword: createPassword,
              specialization: createSpec || undefined,
            })}
            disabled={!createName || !createEmail || createPassword.length < 8 || createStaffMutation.isPending}
          >
            {createStaffMutation.isPending
              ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Creating…</>
              : <><UserPlus className="w-4 h-4 mr-2" />Create Account</>}
          </Button>
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

      {/* ── Staff Management ── */}
      {(() => {
        const ALL_MANAGEABLE = ["admin", "doctor", "receptionist", "pharmacist"] as const;
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" /> Staff Management
              </CardTitle>
              <CardDescription>
                Add or remove roles for any team member, including yourself. You cannot deactivate your own account.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                </div>
              ) : allStaff.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-6">No team members yet. Create accounts above.</p>
              ) : (
                <div className="space-y-3">
                  {allStaff.map(s => {
                    const isSelf = s.id === user?.userId;
                    const userRoles: string[] = s.roles?.length > 0 ? s.roles : s.role ? [s.role] : [];
                    const available = ALL_MANAGEABLE.filter(r => !userRoles.includes(r));
                    return (
                      <div
                        key={s.id}
                        className={cn(
                          "p-4 rounded-lg border transition-colors",
                          s.deactivated ? "border-dashed border-red-200 bg-red-50/30" : "border-border"
                        )}
                      >
                        {/* Header row */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={cn(
                              "w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0",
                              s.deactivated ? "bg-red-100 text-red-500" : "bg-primary/10 text-primary"
                            )}>
                              {(s.name ?? s.email)[0].toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="font-medium text-sm">{s.name ?? "—"}</p>
                                {isSelf && (
                                  <Badge variant="outline" className="text-xs px-1.5 py-0">You</Badge>
                                )}
                                {s.deactivated && (
                                  <Badge className="text-xs bg-red-100 text-red-600 px-1.5 py-0">Deactivated</Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                            </div>
                          </div>

                          {/* Deactivate / Reactivate */}
                          {!isSelf && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className={cn(
                                "shrink-0 gap-1.5 text-xs h-8",
                                s.deactivated
                                  ? "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                  : "text-red-500 hover:text-red-600 hover:bg-red-50"
                              )}
                              onClick={() => deactivateMutation.mutate({ userId: s.id, deactivated: !s.deactivated })}
                              disabled={deactivateMutation.isPending}
                            >
                              {s.deactivated
                                ? <><UserCheck className="w-3.5 h-3.5" />Reactivate</>
                                : <><UserX className="w-3.5 h-3.5" />Deactivate</>}
                            </Button>
                          )}
                        </div>

                        {/* Roles row */}
                        <div className="mt-3 flex flex-wrap gap-2 items-center">
                          {userRoles.map(role => (
                            <Badge
                              key={role}
                              className={cn(ROLE_COLORS[role] ?? "bg-gray-100 text-gray-700", "gap-1 pr-1 text-xs")}
                            >
                              {role}
                              <button
                                className="rounded-sm p-0.5 hover:bg-black/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                title={userRoles.length === 1 ? "Cannot remove the last role" : `Remove ${role}`}
                                disabled={userRoles.length === 1 || rolesMutation.isPending}
                                onClick={() => rolesMutation.mutate({
                                  userId: s.id,
                                  roles: userRoles.filter(r => r !== role),
                                })}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </Badge>
                          ))}

                          {/* Add role inline */}
                          {addingRoleFor === s.id ? (
                            <Select
                              open
                              onValueChange={(role) => {
                                rolesMutation.mutate({ userId: s.id, roles: [...userRoles, role] });
                                setAddingRoleFor(null);
                              }}
                              onOpenChange={(open) => { if (!open) setAddingRoleFor(null); }}
                            >
                              <SelectTrigger className="h-7 w-36 text-xs">
                                <SelectValue placeholder="Add role…" />
                              </SelectTrigger>
                              <SelectContent>
                                {available.map(r => (
                                  <SelectItem key={r} value={r} className="text-xs capitalize">{r}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            available.length > 0 && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs gap-1 border-dashed"
                                onClick={() => setAddingRoleFor(s.id)}
                                disabled={rolesMutation.isPending}
                              >
                                <Plus className="w-3 h-3" /> Add Role
                              </Button>
                            )
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

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
