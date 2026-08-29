import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { apiFetch, friendlyError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, MessageSquare, CheckCircle2 } from "lucide-react";

const FEEDBACK_SUBJECTS: { value: string; en: string; ar: string }[] = [
  { value: "bug",         en: "Report a Bug / Technical Issue",           ar: "الإبلاغ عن خطأ / مشكلة تقنية" },
  { value: "improvement", en: "Suggest an Improvement / Feature Request", ar: "اقتراح تحسين / طلب ميزة جديدة" },
  { value: "question",    en: "General Question / Inquiry",               ar: "سؤال عام / استفسار" },
  { value: "compliment",  en: "Compliment / Praise",                      ar: "إطراء / مجاملة" },
];

export default function FeedbackPage() {
  const { user } = useAuth();
  const { t, lang, isRTL } = useI18n();

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim() || !email.trim() || !subject || !message.trim()) {
      setError(t("feedbackFillAll"));
      return;
    }
    setSending(true);
    try {
      const subjectLabel =
        FEEDBACK_SUBJECTS.find(s => s.value === subject)?.[lang === "ar" ? "ar" : "en"] ?? subject;
      await apiFetch("/feedback", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          subject: subjectLabel,
          message: message.trim(),
        }),
      });
      setSent(true);
      setMessage("");
      setSubject("");
    } catch (err: unknown) {
      setError(friendlyError(err, t));
      if ((err as { message?: string })?.message && !error) {
        setError(t("feedbackFailed"));
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            {t("feedback")}
          </CardTitle>
          <CardDescription>{t("feedbackSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-500" />
              <p className="font-semibold">{t("feedbackSentTitle")}</p>
              <p className="text-sm text-muted-foreground max-w-sm">{t("feedbackSentMsg")}</p>
              <Button variant="outline" className="mt-3" onClick={() => setSent(false)}>
                {t("feedbackAnother")}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="fb-name">{t("feedbackName")}</Label>
                  <Input
                    id="fb-name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder={t("feedbackName")}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fb-email">{t("feedbackEmail")}</Label>
                  <Input
                    id="fb-email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="email@example.com"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fb-subject">{t("feedbackTopic")}</Label>
                <select
                  id="fb-subject"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  required
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  dir={isRTL ? "rtl" : "ltr"}
                >
                  <option value="" disabled>{t("feedbackPickTopic")}</option>
                  {FEEDBACK_SUBJECTS.map(s => (
                    <option key={s.value} value={s.value}>
                      {lang === "ar" ? s.ar : s.en}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fb-message">{t("feedbackMessage")}</Label>
                <textarea
                  id="fb-message"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder={t("feedbackMessagePlaceholder")}
                  required
                  rows={5}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                  dir={isRTL ? "rtl" : "ltr"}
                />
              </div>

              {error && (
                <p className="text-sm text-destructive bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full sm:w-auto" disabled={sending}>
                {sending ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" />{t("feedbackSending")}</>
                ) : (
                  t("feedbackSend")
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
