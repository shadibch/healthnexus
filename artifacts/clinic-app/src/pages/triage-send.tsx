import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, CheckCircle2, Loader2, Send } from "lucide-react";

interface DispatchResult {
  success: boolean;
  event_id: string;
}

export default function TriageSendPage() {
  const { lang, isRTL } = useI18n();
  const { user } = useAuth();
  const [message, setMessage] = useState("");
  const [sentEventId, setSentEventId] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const ar = lang === "ar";

  const dispatchMutation = useMutation({
    mutationFn: (body: string) => apiFetch<DispatchResult>("/triage/dispatch", {
      method: "POST",
      body: JSON.stringify({ message: body }),
    }),
    onSuccess: (result) => {
      setSentEventId(result.event_id);
      setSendError(null);
      setMessage("");
    },
    onError: (error: Error) => {
      setSendError(error.message || (ar ? "تعذر إرسال الرسالة" : "Message could not be sent"));
      setSentEventId(null);
    },
  });

  function send() {
    const text = message.trim();
    if (!text || dispatchMutation.isPending) return;
    setSentEventId(null);
    setSendError(null);
    dispatchMutation.mutate(text);
  }

  const role = user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : "";

  return (
    <div className={cn("space-y-5 max-w-3xl", isRTL && "font-arabic")} dir={isRTL ? "rtl" : "ltr"}>
      <div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2">
          <Send className="w-6 h-6 text-primary" />
          {ar ? "إرسال رسالة" : "Send a Message"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {ar ? "اكتب طلباً وسيتم إرساله إلى نظام الفرز عبر الخادم." : "Write a request to send it to the triage workflow through the server."}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{ar ? "رسالة جديدة" : "New Message"}</CardTitle>
          <CardDescription>
            {ar ? "سيتم إرفاق بريد حسابك ودورك تلقائياً." : "Your signed-in email and role are attached automatically."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg bg-muted/30 p-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">{ar ? "المرسل" : "Sender"}</p>
              <p className="font-medium break-all">{user?.email}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{ar ? "الدور" : "Role"}</p>
              <p className="font-medium">{role}</p>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="triage-message" className="text-sm font-medium">
              {ar ? "الرسالة" : "Message"}
            </label>
            <Textarea
              id="triage-message"
              value={message}
              onChange={event => setMessage(event.target.value)}
              placeholder={ar ? "اكتب الرسالة هنا…" : "e.g. Dr. Khalid needs urgent insurance pre-approval for an MRI..."}
              rows={6}
              maxLength={5000}
              dir="auto"
            />
            <p className="text-xs text-muted-foreground text-right">{message.length}/5000</p>
          </div>

          <Button onClick={send} disabled={!message.trim() || dispatchMutation.isPending}>
            {dispatchMutation.isPending
              ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />{ar ? "جارٍ الإرسال…" : "Sending…"}</>
              : <><Send className="w-4 h-4 mr-2" />{ar ? "إرسال الرسالة" : "Send Message"}</>}
          </Button>

          {sentEventId && (
            <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">{ar ? "تم إرسال الرسالة" : "Message sent"}</p>
                <p className="font-mono text-xs mt-1 break-all">{sentEventId}</p>
              </div>
            </div>
          )}
          {sendError && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <p>{sendError}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
