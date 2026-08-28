import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, MailCheck, KeyRound, Stethoscope } from "lucide-react";

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setError(null);
    setPending(true);
    try {
      await apiFetch<{ ok: boolean }>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch (err: any) {
      setError(err?.message ?? "Failed to send reset link");
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
          <h1 className="text-2xl font-bold text-slate-900">{t("forgotPassword")}</h1>
          <p className="text-sm text-slate-500">{t("forgotPasswordMsg")}</p>
        </div>

        <Card className="shadow-lg">
          <CardContent className="pt-6">
            {sent ? (
              <div className="text-center space-y-3 py-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto">
                  <MailCheck className="w-6 h-6 text-emerald-600" />
                </div>
                <p className="text-sm text-muted-foreground">{t("resetLinkSent")}</p>
                <Button variant="link" className="w-full" onClick={() => setSent(false)}>
                  {t("backToSignIn")}
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="fp-email">{t("emailAddress")}</Label>
                  <Input
                    id="fp-email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@clinic.com"
                    required
                    autoComplete="email"
                  />
                </div>
                {error && (
                  <p className="text-sm text-destructive bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
                )}
                <Button type="submit" className="w-full" disabled={!email || pending}>
                  {pending ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" />{t("sending")}</>
                  ) : (
                    <><KeyRound className="w-4 h-4 mr-2" />{t("sendResetLink")}</>
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