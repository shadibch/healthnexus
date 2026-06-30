import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useRole } from "@/lib/role";
import { useI18n } from "@/lib/i18n";
import { useClinicSettings } from "@/lib/clinic-settings";
import { printPrescription } from "@/lib/print-prescription";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, Pill, Clock, CheckCircle2, User, Stethoscope, MapPin, Printer, Search, CheckCheck, MessageSquare, Send, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface PrescriptionItem {
  id: number;
  medicationId: number;
  medicationName: string | null;
  dosage: string;
  frequency: string;
  duration: string | null;
  quantity: number;
  instructions: string | null;
}

interface Prescription {
  id: number;
  patientId: number;
  doctorId: number;
  patientName: string | null;
  doctorName: string | null;
  status: string;
  notes: string | null;
  issuedAt: string;
  dispensedAt: string | null;
  items: PrescriptionItem[];
}

const FEEDBACK_SUBJECTS = [
  { value: "bug",         en: "Report a Bug / Technical Issue",          ar: "الإبلاغ عن خطأ / مشكلة تقنية" },
  { value: "improvement", en: "Suggest an Improvement / Feature Request", ar: "اقتراح تحسين / طلب ميزة جديدة" },
  { value: "question",    en: "General Question / Inquiry",               ar: "سؤال عام / استفسار" },
  { value: "compliment",  en: "Compliment / Praise",                      ar: "إطراء / مجاملة" },
];

export default function PrescriptionsPage() {
  const { role } = useRole();
  const { t, isRTL, lang } = useI18n();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [patientSearch, setPatientSearch] = useState("");
  const [dispensing, setDispensing] = useState<number | null>(null);
  const [markingTaken, setMarkingTaken] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const clinic = useClinicSettings();

  // ── Feedback dialog state ─────────────────────────────────────────────────
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [fbName,    setFbName]    = useState(user?.name  ?? "");
  const [fbEmail,   setFbEmail]   = useState(user?.email ?? "");
  const [fbSubject, setFbSubject] = useState("");
  const [fbMessage, setFbMessage] = useState("");
  const [fbSending, setFbSending] = useState(false);
  const [fbSent,    setFbSent]    = useState(false);
  const [fbError,   setFbError]   = useState("");

  const ar = lang === "ar";

  const handleFeedbackSubmit = async () => {
    if (!fbName.trim() || !fbEmail.trim() || !fbSubject || !fbMessage.trim()) {
      setFbError(ar ? "يرجى تعبئة جميع الحقول" : "Please fill in all fields.");
      return;
    }
    setFbSending(true);
    setFbError("");
    try {
      const subjectLabel = FEEDBACK_SUBJECTS.find(s => s.value === fbSubject)?.[ar ? "ar" : "en"] ?? fbSubject;
      await apiFetch("/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: fbName.trim(), email: fbEmail.trim(), subject: subjectLabel, message: fbMessage.trim() }),
      });
      setFbSent(true);
      setFbMessage("");
      setFbSubject("");
    } catch (err: unknown) {
      setFbError(err instanceof Error ? err.message : ar ? "فشل الإرسال. حاول مجدداً." : "Failed to send. Please try again.");
    } finally {
      setFbSending(false);
    }
  };

  const { data: prescriptions, isLoading } = useQuery<Prescription[]>({
    queryKey: ["prescriptions", statusFilter],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "100" });
      if (statusFilter !== "all") params.set("status", statusFilter);
      return apiFetch(`/prescriptions?${params}`);
    },
    refetchInterval: 20000,
  });

  const markTakenMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/prescriptions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "dispensed", dispensedAt: new Date().toISOString() }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prescriptions"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast({ title: isRTL ? "تم تحديد الوصفة كمُستلمة" : "Prescription marked as taken" });
      setMarkingTaken(null);
    },
    onError: (e: Error) => {
      toast({ title: t("error"), description: e.message, variant: "destructive" });
      setMarkingTaken(null);
    },
  });

  const dispenseMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/prescriptions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "dispensed", dispensedAt: new Date().toISOString() }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prescriptions"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast({ title: t("dispensedSuccessfully") });
      setDispensing(null);
    },
    onError: (e: Error) => {
      toast({ title: t("error"), description: e.message, variant: "destructive" });
      setDispensing(null);
    },
  });

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handlePrint = (rx: Prescription) => {
    printPrescription(
      {
        id: rx.id,
        patientName: rx.patientName,
        doctorName: rx.doctorName,
        issuedAt: rx.issuedAt,
        notes: rx.notes,
        items: rx.items,
      },
      { clinicName: clinic.clinicName, logoBase64: clinic.logoBase64 }
    );
  };

  const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
    pending:   { label: t("pending"),   variant: "secondary",    icon: <Clock className="w-3 h-3" /> },
    dispensed: { label: t("dispensed"), variant: "default",      icon: <CheckCircle2 className="w-3 h-3" /> },
    cancelled: { label: t("cancelled"), variant: "destructive",  icon: null },
  };

  const pending = prescriptions?.filter((r) => r.status === "pending").length ?? 0;

  const filteredPrescriptions = prescriptions?.filter((rx) => {
    if (!patientSearch.trim()) return true;
    return (rx.patientName ?? "").toLowerCase().includes(patientSearch.toLowerCase());
  });

  return (
    <div className="space-y-4">
      <div className={cn("flex items-center justify-between gap-3", isRTL && "flex-row-reverse")}>
        <div className={cn(isRTL && "text-right")}>
          <h1 className="text-2xl font-bold">
            {role === "pharmacy" ? t("pendingRx") : t("prescriptions")}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {pending > 0 ? `${pending} ${t("pendingDispensing")}` : t("allPrescriptions")}
          </p>
        </div>
        <div className={cn("flex items-center gap-2 shrink-0", isRTL && "flex-row-reverse")}>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs text-muted-foreground"
            onClick={() => { setFbSent(false); setFbError(""); setFeedbackOpen(true); }}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            {ar ? "ملاحظات" : "Feedback"}
          </Button>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("all")}</SelectItem>
              <SelectItem value="pending">{t("pending")}</SelectItem>
              <SelectItem value="dispensed">{t("dispensed")}</SelectItem>
              <SelectItem value="cancelled">{t("cancelled")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Patient search */}
      <div className="relative">
        <Search className={cn("absolute top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground", isRTL ? "right-3" : "left-3")} />
        <Input
          placeholder={isRTL ? "ابحث بالمريض..." : "Search by patient name..."}
          value={patientSearch}
          onChange={(e) => setPatientSearch(e.target.value)}
          className={cn("h-9 text-sm", isRTL ? "pr-9 text-right" : "pl-9")}
        />
      </div>

      <div className="space-y-3">
        {isLoading
          ? [1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)
          : (filteredPrescriptions?.length ?? 0) === 0
          ? (
            <Card className="border-dashed border-border">
              <CardContent className="py-16 text-center">
                <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">{t("noPrescriptions")}</p>
              </CardContent>
            </Card>
          )
          : filteredPrescriptions?.map((rx) => {
              const cfg = STATUS_CONFIG[rx.status] ?? STATUS_CONFIG.pending;
              const isExpanded = expanded.has(rx.id);
              const isPharmacy = role === "pharmacy";

              return (
                <Card key={rx.id} className="border-border">
                  <CardContent className="p-4">
                    <div className={cn("flex items-start justify-between gap-2", isRTL && "flex-row-reverse")}>
                      <div className={cn("flex items-start gap-3", isRTL && "flex-row-reverse")}>
                        <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
                          <FileText className="w-4.5 h-4.5 text-violet-600" />
                        </div>
                        <div className={cn(isRTL && "text-right")}>
                          <div className={cn("flex items-center gap-2 flex-wrap", isRTL && "flex-row-reverse")}>
                            <p className="font-semibold text-sm">Rx #{rx.id}</p>
                            <Badge variant={cfg.variant} className="text-xs gap-1">
                              {cfg.icon}{cfg.label}
                            </Badge>
                          </div>
                          <div className={cn("flex items-center gap-3 mt-0.5 flex-wrap", isRTL && "flex-row-reverse")}>
                            {rx.patientName && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <User className="w-3 h-3" />{rx.patientName}
                              </span>
                            )}
                            {rx.doctorName && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Stethoscope className="w-3 h-3" />{rx.doctorName}
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(rx.issuedAt), { addSuffix: true })}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className={cn("flex items-center gap-2 shrink-0 flex-wrap justify-end", isRTL && "flex-row-reverse")}>
                        {/* Doctor: Mark as Taken */}
                        {role === "doctor" && rx.status === "pending" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setMarkingTaken(rx.id);
                              markTakenMutation.mutate(rx.id);
                            }}
                            disabled={markingTaken === rx.id}
                            className="text-xs gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                          >
                            <CheckCheck className="w-3.5 h-3.5" />
                            {markingTaken === rx.id ? "..." : (isRTL ? "تم الاستلام" : "Mark Taken")}
                          </Button>
                        )}

                        {/* Pharmacy: Dispense */}
                        {isPharmacy && rx.status === "pending" && (
                          <Button
                            size="sm"
                            onClick={() => {
                              setDispensing(rx.id);
                              dispenseMutation.mutate(rx.id);
                            }}
                            disabled={dispensing === rx.id}
                            className="text-xs"
                          >
                            {dispensing === rx.id ? "..." : t("dispense")}
                          </Button>
                        )}

                        {/* Print — always visible for pharmacy; visible to all other roles too */}
                        {rx.items.length > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            className={cn("text-xs gap-1.5", isRTL && "flex-row-reverse")}
                            onClick={() => handlePrint(rx)}
                          >
                            <Printer className="w-3.5 h-3.5" />
                            {isRTL ? "طباعة" : "Print"}
                          </Button>
                        )}

                        {/* Patient: find nearby pharmacy */}
                        {role === "patient" && rx.items.length > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            className={cn("text-xs gap-1 text-blue-600 border-blue-300 hover:bg-blue-50", isRTL && "flex-row-reverse")}
                            onClick={() => navigate("/map?tab=prescription")}
                          >
                            <MapPin className="w-3 h-3" />
                            {isRTL ? "أقرب صيدلية" : "Find Pharmacy"}
                          </Button>
                        )}

                        <Button size="sm" variant="ghost" onClick={() => toggleExpand(rx.id)} className="text-xs">
                          {isExpanded ? "↑" : `${rx.items.length} ${t("items")}`}
                        </Button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-3 space-y-2 pt-3 border-t border-border">
                        {rx.items.map((item) => (
                          <div key={item.id} className={cn("flex items-start gap-2.5 p-2.5 rounded-lg bg-muted/40", isRTL && "flex-row-reverse")}>
                            <Pill className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                            <div className={cn("flex-1", isRTL && "text-right")}>
                              <p className="text-sm font-medium">{item.medicationName ?? `Med #${item.medicationId}`}</p>
                              <p className="text-xs text-muted-foreground">
                                {item.dosage} · {item.frequency}
                                {item.duration ? ` · ${item.duration}` : ""}
                                {" · "}{t("qty")}: {item.quantity}
                              </p>
                              {item.instructions && (
                                <p className="text-xs text-muted-foreground italic mt-0.5">{item.instructions}</p>
                              )}
                            </div>
                          </div>
                        ))}
                        {rx.notes && (
                          <p className={cn("text-xs text-muted-foreground italic px-1", isRTL && "text-right")}>
                            {t("note")}: {rx.notes}
                          </p>
                        )}
                        {rx.dispensedAt && (
                          <p className={cn("text-xs text-emerald-600 px-1", isRTL && "text-right")}>
                            {t("dispensed")} {formatDistanceToNow(new Date(rx.dispensedAt), { addSuffix: true })}
                          </p>
                        )}
                        {/* Print Prescription — quick access inside expanded view */}
                        {rx.items.length > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            className={cn("w-full mt-1 gap-2 text-xs", isRTL && "flex-row-reverse")}
                            onClick={() => handlePrint(rx)}
                          >
                            <Printer className="w-3.5 h-3.5" />
                            {isRTL ? "طباعة الوصفة الطبية" : "Print Prescription"}
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
      </div>

      {/* ── Feedback Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={feedbackOpen} onOpenChange={(v) => { if (!v) setFeedbackOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className={cn("flex items-center gap-2 text-base", isRTL && "flex-row-reverse")}>
              <MessageSquare className="w-4 h-4 text-primary shrink-0" />
              {ar ? "ملاحظات ودعم" : "Feedback & Support"}
            </DialogTitle>
          </DialogHeader>

          {fbSent ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              <p className="font-semibold text-sm">
                {ar ? "تم إرسال رسالتك بنجاح!" : "Message sent successfully!"}
              </p>
              <p className="text-xs text-muted-foreground">
                {ar ? "سيصلك تأكيد على بريدك الإلكتروني قريباً." : "A confirmation has been sent to your email."}
              </p>
              <Button size="sm" variant="outline" className="mt-2 text-xs" onClick={() => setFbSent(false)}>
                {ar ? "إرسال رسالة أخرى" : "Send another message"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              <div className={cn("grid grid-cols-2 gap-3", isRTL && "direction-rtl")}>
                <div className="space-y-1">
                  <Label className="text-xs">{ar ? "الاسم" : "Name"}</Label>
                  <Input
                    value={fbName}
                    onChange={e => setFbName(e.target.value)}
                    placeholder={ar ? "الاسم الكامل" : "Full name"}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{ar ? "البريد الإلكتروني" : "Email"}</Label>
                  <Input
                    type="email"
                    value={fbEmail}
                    onChange={e => setFbEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="h-8 text-sm"
                    dir="ltr"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{ar ? "الموضوع" : "Subject"}</Label>
                <Select value={fbSubject} onValueChange={setFbSubject}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder={ar ? "اختر موضوعاً…" : "Choose a subject…"} />
                  </SelectTrigger>
                  <SelectContent>
                    {FEEDBACK_SUBJECTS.map(s => (
                      <SelectItem key={s.value} value={s.value} className="text-sm">
                        {ar ? s.ar : s.en}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{ar ? "الرسالة" : "Message"}</Label>
                <Textarea
                  value={fbMessage}
                  onChange={e => setFbMessage(e.target.value)}
                  placeholder={ar ? "اكتب رسالتك هنا…" : "Write your message here…"}
                  rows={4}
                  className={cn("text-sm resize-none", isRTL && "text-right")}
                  dir={isRTL ? "rtl" : "ltr"}
                />
              </div>
              {fbError && (
                <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {fbError}
                </div>
              )}
              <div className={cn("flex pt-1", isRTL ? "justify-start" : "justify-end")}>
                <Button size="sm" onClick={handleFeedbackSubmit} disabled={fbSending} className="gap-2">
                  {fbSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  {fbSending
                    ? (ar ? "جارٍ الإرسال…" : "Sending…")
                    : (ar ? "إرسال" : "Send Message")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
