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
import { useToast } from "@/hooks/use-toast";
import { Building2, Users, UserPlus, Mail, Loader2, CheckCircle, Clock, Sparkles } from "lucide-react";

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

  const ROLE_COLORS: Record<string, string> = {
    doctor: "bg-emerald-100 text-emerald-800",
    pharmacist: "bg-purple-100 text-purple-800",
    pharmacy: "bg-purple-100 text-purple-800",
    receptionist: "bg-orange-100 text-orange-800",
    admin: "bg-blue-100 text-blue-800",
  };

  const activeStaff = data?.staff.filter(s => s.role !== "admin") ?? [];
  const doctors = activeStaff.filter(s => s.role === "doctor");

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Building2 className="w-6 h-6 text-primary" /> Admin Dashboard
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your medical center staff and settings</p>
      </div>

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

      {doctors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" /> AI Assistant Access
            </CardTitle>
            <CardDescription>
              Control which doctors have access to the AI diagnostic and prescription assistant.
              This is a subscription-based feature.
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" /> Staff Members
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading...
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
                  <div className="flex items-center gap-2">
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
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
