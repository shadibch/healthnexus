import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { KeyRound, Loader2, Stethoscope, Eye, EyeOff, ShieldCheck, TimerReset } from "lucide-react";

function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className={`pr-10 ${props.className ?? ""}`} />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow(v => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

export default function ResetPasswordPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const token = new URLSearchParams(window.location.search).get("token");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenIssue, setTokenIssue] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError(t("passwordMin"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("passwordsDontMatch"));
      return;
    }
    setPending(true);
    try {
      await apiFetch<{ ok: boolean }>("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, newPassword }),
      });
      setDone(true);
    } catch (err: any) {
      const msg = err?.message ?? "";
      if (msg === "RESET_TOKEN_EXPIRED") {
        setTokenIssue(t("resetTokenExpired"));
      } else if (msg === "INVALID_RESET_TOKEN") {
        setTokenIssue(t("resetTokenInvalid"));
      } else {
        setError(msg || t("resetPassword"));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 px-4">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mx-auto">
            <Stethoscope className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{t("resetPassword")}</h1>
          <p className="text-sm text-slate-500">{t("resetPasswordMsg")}</p>
        </div>

        <Card className="shadow-lg">
          <CardContent className="pt-6">
            {done ? (
              <div className="text-center space-y-3 py-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto">
                  <ShieldCheck className="w-6 h-6 text-emerald-600" />
                </div>
                <p className="text-sm text-muted-foreground">{t("passwordUpdated")}</p>
                <Button asChild className="w-full">
                  <a href="/sign-in">{t("goToSignIn")}</a>
                </Button>
              </div>
            ) : tokenIssue ? (
              <div className="text-center space-y-3 py-4">
                <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center mx-auto">
                  <TimerReset className="w-6 h-6 text-red-600" />
                </div>
                <p className="text-sm text-destructive">{tokenIssue}</p>
                <Button asChild variant="outline" className="w-full">
                  <a href="/forgot-password">{t("sendResetLink")}</a>
                </Button>
              </div>
            ) : !token ? (
              <div className="text-center space-y-3 py-4">
                <p className="text-sm text-destructive">{t("resetTokenInvalid")}</p>
                <Button asChild variant="outline" className="w-full">
                  <a href="/forgot-password">{t("forgotPassword")}</a>
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="rp-new">{t("newPassword")}</Label>
                  <PasswordInput
                    id="rp-new"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    required
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rp-confirm">{t("confirmPassword")}</Label>
                  <PasswordInput
                    id="rp-confirm"
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
                {error && (
                  <p className="text-sm text-destructive bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
                )}
                <Button type="submit" className="w-full" disabled={pending || newPassword.length < 8}>
                  {pending ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" />{t("sending")}</>
                  ) : (
                    <><KeyRound className="w-4 h-4 mr-2" />{t("resetPassword")}</>
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-sm text-slate-500">
          <a href="/sign-in" className="font-medium text-emerald-600 hover:text-emerald-700">{t("backToSignIn")}</a>
        </p>
      </div>
    </div>
  );
}