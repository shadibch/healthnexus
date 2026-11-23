import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, Bot, CheckCircle2, Loader2, Send, Stethoscope } from "lucide-react";

interface DispatchResult {
  success: boolean;
  event_id: string;
}

interface ChatMessage {
  id: string;
  text: string;
  eventId?: string;
  status: "sending" | "sent" | "error";
  error?: string;
}

export default function TriageMessageChat() {
  const { lang, isRTL } = useI18n();
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const feedEndRef = useRef<HTMLDivElement>(null);
  const ar = lang === "ar";
  const role = user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : "";

  const dispatchMutation = useMutation({
    mutationFn: (payload: { id: string; message: string }) =>
      apiFetch<DispatchResult>("/triage/dispatch", {
        method: "POST",
        body: JSON.stringify({ message: payload.message }),
      }).then(result => ({ ...result, id: payload.id })),
    onSuccess: result => {
      setMessages(previous => previous.map(message => message.id === result.id
        ? { ...message, eventId: result.event_id, status: "sent" }
        : message));
    },
    onError: (error: Error, payload) => {
      setMessages(previous => previous.map(message => message.id === payload.id
        ? { ...message, status: "error", error: error.message || (ar ? "تعذر الإرسال" : "Could not send message") }
        : message));
    },
  });

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function sendMessage() {
    const message = text.trim();
    if (!message || dispatchMutation.isPending) return;
    const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setMessages(previous => [...previous, { id, text: message, status: "sending" }]);
    setText("");
    dispatchMutation.mutate({ id, message });
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-muted/20 py-4">
        <div className={cn("flex items-center justify-between gap-3", isRTL && "flex-row-reverse")}>
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            {ar ? "محادثة الفرز الذكي" : "AI Triage Chat"}
          </CardTitle>
          <div className="text-right text-xs text-muted-foreground">
            <p dir="ltr">{user?.email}</p>
            <p>{role}</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {ar ? "اكتب الطلب لإرساله إلى فريقك عبر Make." : "Send a request to your team through Make."}
        </p>
      </CardHeader>

      <CardContent className="p-0">
        <div className="h-64 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-background to-muted/10" aria-live="polite">
          {messages.length === 0 && (
            <div className="h-full flex min-h-40 items-center justify-center text-center text-sm text-muted-foreground">
              <div>
                <Stethoscope className="w-9 h-9 mx-auto mb-2 opacity-30" />
                {ar ? "اكتب رسالة لبدء الطلب" : "Write a message to start a request"}
              </div>
            </div>
          )}
          {messages.map(message => (
            <div key={message.id} className={cn("flex", isRTL ? "justify-start" : "justify-end")}>
              <div className="max-w-[92%] rounded-2xl rounded-br-md bg-primary text-primary-foreground px-4 py-2.5 shadow-sm space-y-1.5">
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.text}</p>
                {message.status === "sending" && (
                  <span className="text-[11px] inline-flex items-center gap-1 opacity-90">
                    <Loader2 className="w-3 h-3 animate-spin" /> {ar ? "جارٍ الإرسال…" : "Sending to Make…"}
                  </span>
                )}
                {message.status === "sent" && (
                  <div className="text-[11px] flex items-center gap-1 opacity-90">
                    <CheckCircle2 className="w-3 h-3" /> {ar ? "تم الإرسال" : "Sent"}
                    <span className="font-mono ml-1">{message.eventId}</span>
                  </div>
                )}
                {message.status === "error" && (
                  <span className="text-[11px] inline-flex items-center gap-1 text-red-100">
                    <AlertCircle className="w-3 h-3" /> {message.error}
                  </span>
                )}
              </div>
            </div>
          ))}
          <div ref={feedEndRef} />
        </div>

        <form
          className="flex items-end gap-2 border-t p-3 bg-background"
          onSubmit={event => { event.preventDefault(); sendMessage(); }}
        >
          <Textarea
            value={text}
            onChange={event => setText(event.target.value)}
            placeholder={ar ? "اكتب رسالتك…" : "Type your message…"}
            rows={2}
            maxLength={5000}
            className="min-h-10 max-h-28 resize-y"
            dir="auto"
          />
          <Button type="submit" size="icon" aria-label={ar ? "إرسال" : "Send"} disabled={!text.trim() || dispatchMutation.isPending}>
            {dispatchMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
