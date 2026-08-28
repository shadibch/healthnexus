import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { KeyRound, Loader2, Eye, EyeOff, ShieldCheck } from "lucide-react";

export default function ChangePasswordPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useI18n();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: t("passwordsDontMatch"), variant: "destructive" });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: t("passwordMin"), variant: "destructive" });
      return;
    }
    if (newPassword === currentPassword) {
      toast({ title: "Same password", description: "Your new password must be different from the temporary one.", variant: "destructive" });
      return;
    }

    setIsPending(true);
    try {
      await apiFetch("/users/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      await apiFetch("/users/mark-password-changed", { method: "POST" });
      qc.invalidateQueries({ queryKey: ["auth-me"] });
      toast({ title: t("passwordUpdated") });
    } catch (err: any) {
      const msg =
        err?.message ||
        "Please check your temporary password and try again.";
      toast({ title: "Failed to update password", description: msg, variant: "destructive" });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 px-4">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center space-y-1">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Set Your Password</h1>
          <p className="text-muted-foreground text-sm">
            Your account was created with a temporary password. Please choose a new one to continue.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="currentPw">Temporary Password</Label>
                <div className="relative">
                  <Input
                    id="currentPw"
                    type={showCurrent ? "text" : "password"}
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    placeholder="Enter the password provided by your admin"
                    required
                    className="pr-10"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowCurrent(v => !v)}
                    tabIndex={-1}
                  >
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="newPw">{t("newPassword")}</Label>
                <div className="relative">
                  <Input
                    id="newPw"
                    type={showNew ? "text" : "password"}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    required
                    className="pr-10"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowNew(v => !v)}
                    tabIndex={-1}
                  >
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPw">{t("confirmPassword")}</Label>
                <Input
                  id="confirmPw"
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your new password"
                  required
                  autoComplete="new-password"
                />
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-xs text-destructive">{t("passwordsDontMatch")}</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={!currentPassword || !newPassword || !confirmPassword || isPending}
              >
                {isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" />Updating…</>
                ) : (
                  <><KeyRound className="w-4 h-4 mr-2" />Update Password & Continue</>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Logged in as <span className="font-medium">{user?.email}</span>
        </p>
      </div>
    </div>
  );
}