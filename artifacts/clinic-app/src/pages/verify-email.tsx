import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { MailCheck, Loader2, RefreshCw, ShieldCheck, Stethoscope } from "lucide-react";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 px-4">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mx-auto">
            <Stethoscope className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">HealthNexus</h1>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * 6-digit OTP form. Calls /auth/verify-email with { email, otpCode }.
 * `onVerified` is invoked after a successful verification.
 */
export function OtpVerifyForm({
  email,
  onVerified,
}: {
  email: string;
  onVerified: () => void;
}) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [otp, setOtp] = useState("");
  const [pending, setPending] = useState(false);
  const [resending, setResending] = useState(false);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (otp.length !== 6) return;
    setPending(true);
    try {
      await apiFetch<{ ok: boolean }>("/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ email, otpCode: otp }),
      });
      onVerified();
    } catch (err: any) {
      toast({
        title: err?.message ?? "Invalid code",
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  }

  async function resend() {
    if (resending) return;
    setResending(true);
    try {
      await apiFetch<{ ok: boolean }>("/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      toast({ title: t("verificationResent") });
      setOtp("");
    } catch (err: any) {
      toast({
        title: err?.message ?? "Failed",
        variant: "destructive",
      });
    } finally {
      setResending(false);
    }
  }

  return (
    <form onSubmit={verify} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="otp">{t("otpCode")}</Label>
        <Input
          id="otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={otp}
          onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="123456"
          required
          className="text-center text-lg tracking-[0.5em]"
          dir="ltr"
        />
        <p className="text-xs text-muted-foreground">{t("enterOtpCode")}</p>
      </div>
      <Button type="submit" className="w-full" disabled={otp.length !== 6 || pending}>
        {pending ? (
          <><Loader2 className="w-4 h-4 animate-spin mr-2" />{t("verifying")}</>
        ) : (
          <><ShieldCheck className="w-4 h-4 mr-2" />{t("verifyEmail")}</>
        )}
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={resend} disabled={resending}>
        {resending ? (
          <><Loader2 className="w-4 h-4 animate-spin mr-2" />{t("resending")}</>
        ) : (
          <><RefreshCw className="w-4 h-4 mr-2" />{t("resendVerificationEmail")}</>
        )}
      </Button>
    </form>
  );
}

/** Signed-in gate shown when the user's email is not verified yet. */
export function VerifyPendingGate() {
  const { user } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <Shell>
        <Card className="shadow-lg">
          <CardContent className="pt-6 text-center space-y-2">
            <div className="text-5xl">🎉</div>
            <h2 className="text-xl font-bold text-foreground">{t("emailVerifiedTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("emailVerifiedMsg")}</p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card className="shadow-lg">
        <CardContent className="pt-6 space-y-4">
          <div className="text-center space-y-1">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-2">
              <MailCheck className="w-6 h-6 text-amber-600" />
            </div>
            <h2 className="text-lg font-bold text-foreground">{t("accountNotActivated")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("accountNotActivatedMsg")}{" "}
              {user ? <span className="font-medium text-foreground">{user.email}</span> : null}
            </p>
          </div>
          {user ? (
            <OtpVerifyForm
              email={user.email}
              onVerified={() => {
                qc.invalidateQueries({ queryKey: ["auth-me"] });
                setDone(true);
              }}
            />
          ) : null}
        </CardContent>
      </Card>
    </Shell>
  );
}

/** Standalone /verify-email page — auto-verifies when a ?token= is present. */
export default function VerifyEmailPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const token = new URLSearchParams(window.location.search).get("token");

  const [autoState, setAutoState] = useState<"idle" | "working" | "ok" | "failed">("idle");
  const [autoError, setAutoError] = useState("");

  useEffect(() => {
    if (!token) return;
    setAutoState("working");
    apiFetch<{ ok: boolean }>("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    })
      .then(async () => {
        setAutoState("ok");
        qc.invalidateQueries({ queryKey: ["auth-me"] });
      })
      .catch((err: any) => {
        setAutoState("failed");
        setAutoError(err?.message ?? "");
      });
  }, [token, qc]);

  if (token) {
    return (
      <Shell>
        <Card className="shadow-lg">
          <CardContent className="pt-6 text-center space-y-3">
            {autoState === "working" && (
              <>
                <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
                <p className="text-sm text-muted-foreground">{t("verifying")}</p>
              </>
            )}
            {autoState === "ok" && (
              <>
                <div className="text-5xl">🎉</div>
                <h2 className="text-xl font-bold text-foreground">{t("emailVerifiedTitle")}</h2>
                <p className="text-sm text-muted-foreground">{t("emailVerifiedMsg")}</p>
                <Button asChild className="w-full">
                  <a href="/sign-in">{t("goToSignIn")}</a>
                </Button>
              </>
            )}
            {autoState === "failed" && (
              <>
                <div className="text-5xl">😕</div>
                <h2 className="text-xl font-bold text-foreground">{t("invalidOrExpiredToken")}</h2>
                {user?.email ? (
                  <OtpVerifyForm
                    email={user.email}
                    onVerified={() => {
                      qc.invalidateQueries({ queryKey: ["auth-me"] });
                      setAutoState("ok");
                    }}
                  />
                ) : (
                  <a href="/sign-in" className="text-sm font-medium text-emerald-600 hover:text-emerald-700">
                    {t("goToSignIn")}
                  </a>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </Shell>
    );
  }

  // No token — treat like the pending gate (needs a session to know the email)
  return <VerifyPendingGate />;
}
