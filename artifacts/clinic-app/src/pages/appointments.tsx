import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useRole } from "@/lib/role";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CalendarClock, User, Stethoscope, Clock, Plus, ChevronRight,
  ChevronLeft, CheckCircle2, XCircle, RefreshCw, Loader2,
  CalendarDays, Info, Star,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Appointment {
  id: number;
  patientId: number;
  doctorId: number;
  patientName: string | null;
  doctorName: string | null;
  scheduledAt: string;
  status: string;
  type: string;
  notes: string | null;
  queueNumber: number | null;
}

interface Doctor {
  id: number;
  firstName: string;
  lastName: string;
  specialization: string;
  consultationFee: string | null;
  isAvailable: boolean;
}

interface Slot {
  time: string;
  available: boolean;
  booked: boolean;
  past: boolean;
}

interface SlotsResponse {
  doctorId: number;
  date: string;
  slots: Slot[];
}

const STATUS_COLORS: Record<string, string> = {
  scheduled:   "bg-blue-100 text-blue-800 border-blue-200",
  confirmed:   "bg-indigo-100 text-indigo-800 border-indigo-200",
  in_progress: "bg-amber-100 text-amber-800 border-amber-200",
  completed:   "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelled:   "bg-red-100 text-red-800 border-red-200",
  no_show:     "bg-gray-100 text-gray-700 border-gray-200",
};

const APPOINTMENT_TYPES = ["routine", "follow_up", "consultation", "emergency"] as const;

function todayISO() {
  return new Date().toISOString().split("T")[0];
}
function minDateISO() {
  return todayISO();
}
function maxDateISO() {
  const d = new Date();
  d.setMonth(d.getMonth() + 3);
  return d.toISOString().split("T")[0];
}

// ─── Step indicator ───────────────────────────────────────────────────────────
function Steps({ step, total, isRTL }: { step: number; total: number; isRTL: boolean }) {
  return (
    <div className={cn("flex items-center gap-1 justify-center mb-4", isRTL && "flex-row-reverse")}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={cn("flex items-center gap-1", isRTL && "flex-row-reverse")}>
          <div className={cn(
            "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all",
            i + 1 < step ? "bg-primary text-primary-foreground border-primary" :
            i + 1 === step ? "border-primary text-primary bg-primary/10" :
            "border-border text-muted-foreground bg-muted/40"
          )}>
            {i + 1 < step ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
          </div>
          {i < total - 1 && (
            <div className={cn("w-6 h-0.5 rounded", i + 1 < step ? "bg-primary" : "bg-border")} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Book Appointment Dialog ──────────────────────────────────────────────────
function BookDialog({
  open,
  onClose,
  existingAppointment,
}: {
  open: boolean;
  onClose: () => void;
  existingAppointment?: Appointment;
}) {
  const { lang, isRTL } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isReschedule = !!existingAppointment;

  const [step, setStep] = useState(1);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [apptType, setApptType] = useState<string>("routine");
  const [notes, setNotes] = useState("");

  const totalSteps = isReschedule ? 2 : 3;

  // Reset when opened
  const handleOpen = () => {
    setStep(1);
    setSelectedSlot(null);
    setSelectedDate(todayISO());
    setNotes("");
    setApptType("routine");
    if (isReschedule) {
      setSelectedDoctor(null);
    }
  };

  const { data: doctors = [], isLoading: loadingDoctors } = useQuery<Doctor[]>({
    queryKey: ["doctors"],
    queryFn: () => apiFetch("/doctors"),
    enabled: open,
  });

  const activeDoctor = isReschedule
    ? (selectedDoctor ?? (doctors.find((d) => d.id === existingAppointment?.doctorId) ?? null))
    : selectedDoctor;

  const { data: slotsData, isLoading: loadingSlots } = useQuery<SlotsResponse>({
    queryKey: ["slots", activeDoctor?.id, selectedDate],
    queryFn: () => apiFetch(`/appointments/slots?doctorId=${activeDoctor!.id}&date=${selectedDate}`),
    enabled: !!activeDoctor && !!selectedDate && open,
  });

  const bookMutation = useMutation({
    mutationFn: () => {
      const [h, m] = selectedSlot!.split(":").map(Number);
      const dt = new Date(selectedDate);
      dt.setHours(h, m, 0, 0);
      return apiFetch("/appointments/book", {
        method: "POST",
        body: JSON.stringify({ doctorId: activeDoctor!.id, scheduledAt: dt.toISOString(), type: apptType, notes: notes || undefined }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      toast({ title: lang === "ar" ? "تم حجز الموعد بنجاح" : "Appointment booked successfully" });
      onClose();
    },
    onError: (e: Error) => toast({ title: lang === "ar" ? "خطأ" : "Error", description: e.message, variant: "destructive" }),
  });

  const rescheduleMutation = useMutation({
    mutationFn: () => {
      const [h, m] = selectedSlot!.split(":").map(Number);
      const dt = new Date(selectedDate);
      dt.setHours(h, m, 0, 0);
      return apiFetch(`/appointments/${existingAppointment!.id}/reschedule`, {
        method: "PATCH",
        body: JSON.stringify({ scheduledAt: dt.toISOString(), doctorId: activeDoctor?.id }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      toast({ title: lang === "ar" ? "تم إعادة الجدولة بنجاح" : "Appointment rescheduled successfully" });
      onClose();
    },
    onError: (e: Error) => toast({ title: lang === "ar" ? "خطأ" : "Error", description: e.message, variant: "destructive" }),
  });

  const TYPE_LABELS: Record<string, { en: string; ar: string }> = {
    routine:      { en: "Routine Checkup", ar: "فحص روتيني" },
    follow_up:    { en: "Follow-up Visit", ar: "زيارة متابعة" },
    consultation: { en: "Consultation",    ar: "استشارة" },
    emergency:    { en: "Urgent / Emergency", ar: "عاجل / طارئ" },
  };

  const SPEC_AR: Record<string, string> = {
    Cardiology: "أمراض القلب", "General Medicine": "الطب العام", Orthopedics: "العظام",
    Pediatrics: "طب الأطفال", Dermatology: "الجلدية", Neurology: "الأعصاب",
    Gynecology: "النساء والتوليد", Ophthalmology: "طب العيون", ENT: "الأنف والأذن والحنجرة",
  };

  const availableSlots = slotsData?.slots.filter((s) => s.available) ?? [];
  const now = new Date();

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); else handleOpen(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className={cn(isRTL && "text-right")}>
            {isReschedule
              ? (lang === "ar" ? "إعادة جدولة الموعد" : "Reschedule Appointment")
              : (lang === "ar" ? "حجز موعد جديد" : "Book New Appointment")}
          </DialogTitle>
        </DialogHeader>

        <Steps step={step} total={totalSteps} isRTL={isRTL} />

        {/* ── Step 1 (book): Choose doctor | Step 1 (reschedule): Choose date+slot ── */}
        {step === 1 && !isReschedule && (
          <div className="space-y-3">
            <p className={cn("text-sm font-medium text-muted-foreground", isRTL && "text-right")}>
              {lang === "ar" ? "اختر الطبيب" : "Select a Doctor"}
            </p>
            {loadingDoctors
              ? [1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)
              : doctors.filter((d) => d.isAvailable).map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => { setSelectedDoctor(doc); setStep(2); }}
                  className={cn(
                    "w-full text-left p-4 rounded-xl border-2 transition-all flex items-start gap-3",
                    selectedDoctor?.id === doc.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40 hover:bg-muted/40",
                    isRTL && "flex-row-reverse text-right"
                  )}
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Stethoscope className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">
                      {lang === "ar" ? `د. ${doc.firstName} ${doc.lastName}` : `Dr. ${doc.firstName} ${doc.lastName}`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {lang === "ar" ? (SPEC_AR[doc.specialization] ?? doc.specialization) : doc.specialization}
                    </p>
                    {doc.consultationFee && (
                      <p className="text-xs font-semibold text-emerald-700 mt-1">
                        AED {parseFloat(doc.consultationFee).toFixed(0)}
                        <span className="font-normal text-muted-foreground"> / {lang === "ar" ? "زيارة" : "visit"}</span>
                      </p>
                    )}
                  </div>
                  <ChevronRight className={cn("w-4 h-4 text-muted-foreground self-center shrink-0", isRTL && "rotate-180")} />
                </button>
              ))}
          </div>
        )}

        {/* ── Step 2 (book): Choose date + slot ── */}
        {step === 2 && !isReschedule && activeDoctor && (
          <div className="space-y-4">
            {/* Selected doctor summary */}
            <div className={cn("flex items-center gap-2 p-3 bg-muted/40 rounded-lg text-sm", isRTL && "flex-row-reverse")}>
              <Stethoscope className="w-4 h-4 text-primary shrink-0" />
              <span className="font-medium">
                {lang === "ar" ? `د. ${activeDoctor.firstName} ${activeDoctor.lastName}` : `Dr. ${activeDoctor.firstName} ${activeDoctor.lastName}`}
              </span>
              <span className="text-muted-foreground">— {lang === "ar" ? (SPEC_AR[activeDoctor.specialization] ?? activeDoctor.specialization) : activeDoctor.specialization}</span>
            </div>

            <div className="space-y-1">
              <Label className={cn(isRTL && "block text-right")}>{lang === "ar" ? "التاريخ" : "Date"}</Label>
              <input
                type="date"
                value={selectedDate}
                min={minDateISO()}
                max={maxDateISO()}
                onChange={(e) => { setSelectedDate(e.target.value); setSelectedSlot(null); }}
                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <SlotPicker
              slots={slotsData?.slots ?? []}
              loading={loadingSlots}
              selected={selectedSlot}
              onSelect={setSelectedSlot}
              isRTL={isRTL}
              lang={lang}
            />

            <div className={cn("flex gap-2 pt-2", isRTL && "flex-row-reverse")}>
              <Button variant="outline" onClick={() => setStep(1)} className="gap-1">
                <ChevronLeft className={cn("w-4 h-4", isRTL && "rotate-180")} />
                {lang === "ar" ? "رجوع" : "Back"}
              </Button>
              <Button
                className="flex-1"
                disabled={!selectedSlot}
                onClick={() => setStep(3)}
              >
                {lang === "ar" ? "التالي" : "Next"}
                <ChevronRight className={cn("w-4 h-4", isRTL && "rotate-180")} />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3 (book): Appointment type + notes + confirm ── */}
        {step === 3 && !isReschedule && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg space-y-1.5 text-sm">
              <div className={cn("flex items-center gap-2", isRTL && "flex-row-reverse")}>
                <Stethoscope className="w-3.5 h-3.5 text-primary" />
                <span>{lang === "ar" ? `د. ${activeDoctor?.firstName} ${activeDoctor?.lastName}` : `Dr. ${activeDoctor?.firstName} ${activeDoctor?.lastName}`}</span>
              </div>
              <div className={cn("flex items-center gap-2", isRTL && "flex-row-reverse")}>
                <CalendarDays className="w-3.5 h-3.5 text-primary" />
                <span>{new Date(selectedDate).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-AE", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</span>
              </div>
              <div className={cn("flex items-center gap-2", isRTL && "flex-row-reverse")}>
                <Clock className="w-3.5 h-3.5 text-primary" />
                <span>{selectedSlot}</span>
              </div>
            </div>

            <div className="space-y-1">
              <Label className={cn(isRTL && "block text-right")}>{lang === "ar" ? "نوع الموعد" : "Appointment Type"}</Label>
              <Select value={apptType} onValueChange={setApptType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APPOINTMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {lang === "ar" ? TYPE_LABELS[t].ar : TYPE_LABELS[t].en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className={cn(isRTL && "block text-right")}>{lang === "ar" ? "ملاحظات (اختياري)" : "Notes (optional)"}</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={lang === "ar" ? "اذكر أعراضك أو أي معلومات مفيدة..." : "Describe your symptoms or any relevant details..."}
                className={cn("resize-none", isRTL && "text-right")}
                rows={3}
                dir={isRTL ? "rtl" : "ltr"}
              />
            </div>

            <div className={cn("flex gap-2", isRTL && "flex-row-reverse")}>
              <Button variant="outline" onClick={() => setStep(2)} className="gap-1">
                <ChevronLeft className={cn("w-4 h-4", isRTL && "rotate-180")} />
                {lang === "ar" ? "رجوع" : "Back"}
              </Button>
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 gap-1"
                onClick={() => bookMutation.mutate()}
                disabled={bookMutation.isPending}
              >
                {bookMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {lang === "ar" ? "تأكيد الحجز" : "Confirm Booking"}
              </Button>
            </div>
          </div>
        )}

        {/* ── Reschedule: Step 1 ── pick date + slot */}
        {step === 1 && isReschedule && (
          <div className="space-y-4">
            {/* Current appointment summary */}
            <div className={cn("p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm space-y-1", isRTL && "text-right")}>
              <p className="font-medium text-amber-800">{lang === "ar" ? "الموعد الحالي" : "Current Appointment"}</p>
              <p className="text-amber-700">{new Date(existingAppointment!.scheduledAt).toLocaleString(lang === "ar" ? "ar-AE" : "en-AE", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
            </div>

            <div className="space-y-1">
              <Label className={cn(isRTL && "block text-right")}>{lang === "ar" ? "التاريخ الجديد" : "New Date"}</Label>
              <input
                type="date"
                value={selectedDate}
                min={minDateISO()}
                max={maxDateISO()}
                onChange={(e) => { setSelectedDate(e.target.value); setSelectedSlot(null); }}
                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Doctor selector for reschedule */}
            {doctors.length > 0 && (
              <div className="space-y-1">
                <Label className={cn(isRTL && "block text-right")}>{lang === "ar" ? "الطبيب" : "Doctor"}</Label>
                <Select
                  value={String(activeDoctor?.id ?? existingAppointment?.doctorId ?? "")}
                  onValueChange={(v) => { setSelectedDoctor(doctors.find((d) => d.id === parseInt(v)) ?? null); setSelectedSlot(null); }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {doctors.filter((d) => d.isAvailable).map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {lang === "ar" ? `د. ${d.firstName} ${d.lastName}` : `Dr. ${d.firstName} ${d.lastName}`} — {lang === "ar" ? (SPEC_AR[d.specialization] ?? d.specialization) : d.specialization}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <SlotPicker
              slots={slotsData?.slots ?? []}
              loading={loadingSlots}
              selected={selectedSlot}
              onSelect={setSelectedSlot}
              isRTL={isRTL}
              lang={lang}
            />

            <Button
              className="w-full bg-amber-600 hover:bg-amber-700 gap-1"
              disabled={!selectedSlot || rescheduleMutation.isPending}
              onClick={() => rescheduleMutation.mutate()}
            >
              {rescheduleMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {lang === "ar" ? "تأكيد إعادة الجدولة" : "Confirm Reschedule"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Slot Picker ──────────────────────────────────────────────────────────────
function SlotPicker({ slots, loading, selected, onSelect, isRTL, lang }: {
  slots: Slot[];
  loading: boolean;
  selected: string | null;
  onSelect: (t: string) => void;
  isRTL: boolean;
  lang: string;
}) {
  const morningSlots = slots.filter((s) => {
    const h = parseInt(s.time.split(":")[0]);
    return h < 13;
  });
  const afternoonSlots = slots.filter((s) => {
    const h = parseInt(s.time.split(":")[0]);
    return h >= 14;
  });

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground justify-center">
        <Loader2 className="w-4 h-4 animate-spin" />
        {lang === "ar" ? "جارٍ تحميل المواعيد..." : "Loading available slots..."}
      </div>
    );
  }

  const available = slots.filter((s) => s.available);
  if (slots.length === 0) return null;

  if (available.length === 0) {
    return (
      <div className="py-4 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
        {lang === "ar" ? "لا توجد مواعيد متاحة في هذا اليوم — اختر تاريخاً آخر" : "No available slots on this day — try another date"}
      </div>
    );
  }

  const SlotGroup = ({ title, items }: { title: string; items: Slot[] }) => (
    <div className="space-y-1.5">
      <p className={cn("text-xs font-semibold text-muted-foreground uppercase tracking-wide", isRTL && "text-right")}>{title}</p>
      <div className="grid grid-cols-4 gap-1.5">
        {items.map((slot) => (
          <button
            key={slot.time}
            disabled={!slot.available}
            onClick={() => onSelect(slot.time)}
            className={cn(
              "py-2 rounded-lg text-xs font-medium border transition-all",
              slot.available
                ? selected === slot.time
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "border-border hover:border-primary hover:bg-primary/5 text-foreground"
                : slot.past
                  ? "border-dashed border-border text-muted-foreground/40 cursor-not-allowed bg-muted/20"
                  : "border-border text-muted-foreground/50 line-through cursor-not-allowed bg-muted/30"
            )}
          >
            {slot.time}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <p className={cn("text-sm font-medium text-muted-foreground", isRTL && "text-right")}>
        {lang === "ar" ? "اختر وقتاً متاحاً" : "Select an available time"}
        <span className="ml-2 text-xs text-emerald-600">({available.length} {lang === "ar" ? "متاح" : "available"})</span>
      </p>
      {morningSlots.length > 0 && (
        <SlotGroup title={lang === "ar" ? "صباحاً" : "Morning"} items={morningSlots} />
      )}
      {afternoonSlots.length > 0 && (
        <SlotGroup title={lang === "ar" ? "بعد الظهر" : "Afternoon"} items={afternoonSlots} />
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AppointmentsPage() {
  const { user } = useAuth();
  const { lang, isRTL } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { hasRole } = useRole();
  const isPatient = hasRole("patient");

  const [bookOpen, setBookOpen] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const STATUS_COLORS: Record<string, string> = {
    scheduled:   "bg-blue-100 text-blue-800",
    confirmed:   "bg-indigo-100 text-indigo-800",
    in_progress: "bg-amber-100 text-amber-800",
    completed:   "bg-emerald-100 text-emerald-800",
    cancelled:   "bg-red-100 text-red-800",
    no_show:     "bg-gray-100 text-gray-700",
  };

  const STATUS_LABELS: Record<string, { en: string; ar: string }> = {
    scheduled:   { en: "Scheduled", ar: "مجدول" },
    confirmed:   { en: "Confirmed", ar: "مؤكد" },
    in_progress: { en: "In Progress", ar: "جارٍ" },
    completed:   { en: "Completed", ar: "مكتمل" },
    cancelled:   { en: "Cancelled", ar: "ملغى" },
    no_show:     { en: "No Show", ar: "غياب" },
  };

  const TYPE_LABELS: Record<string, { en: string; ar: string }> = {
    routine:      { en: "Routine", ar: "روتيني" },
    follow_up:    { en: "Follow-up", ar: "متابعة" },
    consultation: { en: "Consultation", ar: "استشارة" },
    emergency:    { en: "Urgent", ar: "عاجل" },
  };

  const { data: appointments = [], isLoading } = useQuery<Appointment[]>({
    queryKey: ["appointments"],
    queryFn: () => apiFetch("/appointments?limit=100"),
    refetchInterval: 30000,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/appointments/${id}/cancel`, { method: "PATCH" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      toast({ title: lang === "ar" ? "تم إلغاء الموعد" : "Appointment cancelled" });
      setCancelTarget(null);
    },
    onError: (e: Error) => toast({ title: lang === "ar" ? "خطأ" : "Error", description: e.message, variant: "destructive" }),
  });

  const filteredAppointments = useMemo(() => {
    const sorted = [...appointments].sort(
      (a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
    );
    if (filterStatus === "all") return sorted;
    return sorted.filter((a) => a.status === filterStatus);
  }, [appointments, filterStatus]);

  const upcoming = appointments.filter((a) =>
    ["scheduled", "confirmed"].includes(a.status) && new Date(a.scheduledAt) > new Date()
  );
  const canCancel = (a: Appointment) =>
    isPatient && ["scheduled", "confirmed"].includes(a.status) && new Date(a.scheduledAt) > new Date();
  const canReschedule = (a: Appointment) =>
    isPatient && ["scheduled", "confirmed"].includes(a.status) && new Date(a.scheduledAt) > new Date();

  const FILTER_OPTIONS = [
    { value: "all", en: "All", ar: "الكل" },
    { value: "scheduled", en: "Scheduled", ar: "مجدولة" },
    { value: "confirmed", en: "Confirmed", ar: "مؤكدة" },
    { value: "completed", en: "Completed", ar: "مكتملة" },
    { value: "cancelled", en: "Cancelled", ar: "ملغاة" },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className={cn("flex items-start justify-between gap-3", isRTL && "flex-row-reverse")}>
        <div className={cn(isRTL && "text-right")}>
          <h1 className="text-2xl font-bold">{lang === "ar" ? "مواعيدي" : "My Appointments"}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {appointments.length} {lang === "ar" ? "موعد" : "appointments"}
            {upcoming.length > 0 && (
              <span className="ml-2 text-primary font-medium">
                · {upcoming.length} {lang === "ar" ? "قادم" : "upcoming"}
              </span>
            )}
          </p>
        </div>
        {isPatient && (
          <Button onClick={() => setBookOpen(true)} className="gap-2 shrink-0">
            <Plus className="w-4 h-4" />
            {lang === "ar" ? "حجز موعد" : "Book Appointment"}
          </Button>
        )}
      </div>

      {/* Status filter tabs */}
      <div className={cn("flex gap-1.5 flex-wrap", isRTL && "flex-row-reverse")}>
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilterStatus(opt.value)}
            className={cn(
              "text-xs px-3 py-1.5 rounded-full border font-medium transition-colors",
              filterStatus === opt.value
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:bg-muted/50"
            )}
          >
            {lang === "ar" ? opt.ar : opt.en}
            {opt.value !== "all" && (
              <span className="ml-1 opacity-70">
                ({appointments.filter((a) => a.status === opt.value).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Appointments list */}
      <div className="space-y-3">
        {isLoading
          ? [1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)
          : filteredAppointments.length === 0
            ? (
              <Card className="border-dashed border-border">
                <CardContent className="py-16 text-center">
                  <CalendarClock className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground font-medium">
                    {lang === "ar" ? "لا توجد مواعيد" : "No appointments found"}
                  </p>
                  {isPatient && filterStatus === "all" && (
                    <Button
                      className="mt-4 gap-2"
                      size="sm"
                      onClick={() => setBookOpen(true)}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {lang === "ar" ? "احجز موعدك الأول" : "Book your first appointment"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )
            : filteredAppointments.map((a) => {
              const apptDate = new Date(a.scheduledAt);
              const isPast = apptDate < new Date();
              const isUpcoming = !isPast && ["scheduled", "confirmed"].includes(a.status);

              return (
                <Card
                  key={a.id}
                  className={cn(
                    "border transition-all",
                    isUpcoming && "border-primary/30 shadow-sm",
                    a.status === "cancelled" && "opacity-60"
                  )}
                >
                  <CardContent className="p-4">
                    <div className={cn("flex items-start gap-3", isRTL && "flex-row-reverse")}>
                      {/* Date block */}
                      <div className={cn(
                        "w-14 rounded-xl flex flex-col items-center justify-center py-2 shrink-0 border",
                        isUpcoming ? "bg-primary/10 border-primary/20 text-primary" : "bg-muted/40 border-border text-muted-foreground"
                      )}>
                        <span className="text-xs font-medium uppercase">
                          {apptDate.toLocaleString(lang === "ar" ? "ar-AE" : "en-AE", { month: "short" })}
                        </span>
                        <span className="text-2xl font-bold leading-tight">{apptDate.getDate()}</span>
                        <span className="text-xs">{apptDate.toLocaleString(lang === "ar" ? "ar-AE" : "en-AE", { weekday: "short" })}</span>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className={cn("flex items-center gap-2 flex-wrap", isRTL && "flex-row-reverse")}>
                          <Badge className={cn("text-xs border", STATUS_COLORS[a.status] ?? "")}>
                            {lang === "ar"
                              ? STATUS_LABELS[a.status]?.ar ?? a.status
                              : STATUS_LABELS[a.status]?.en ?? a.status}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {lang === "ar"
                              ? TYPE_LABELS[a.type]?.ar ?? a.type
                              : TYPE_LABELS[a.type]?.en ?? a.type}
                          </Badge>
                          {isUpcoming && (
                            <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border-primary/20">
                              {lang === "ar" ? "قادم" : "Upcoming"}
                            </Badge>
                          )}
                        </div>

                        <div className={cn("flex items-center gap-3 mt-1.5 flex-wrap text-xs text-muted-foreground", isRTL && "flex-row-reverse")}>
                          {a.doctorName && (
                            <span className="flex items-center gap-1">
                              <Stethoscope className="w-3 h-3" />
                              {lang === "ar" ? a.doctorName.replace("Dr.", "د.") : a.doctorName}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {apptDate.toLocaleTimeString(lang === "ar" ? "ar-AE" : "en-AE", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          {a.queueNumber && (
                            <span className="flex items-center gap-1 text-primary font-medium">
                              <Star className="w-3 h-3" />
                              {lang === "ar" ? `رقم الطابور: ${a.queueNumber}` : `Queue #${a.queueNumber}`}
                            </span>
                          )}
                        </div>

                        {a.notes && (
                          <p className={cn("text-xs text-muted-foreground mt-1.5 italic flex items-start gap-1", isRTL && "flex-row-reverse text-right")}>
                            <Info className="w-3 h-3 mt-0.5 shrink-0" />
                            {a.notes}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      {isPatient && (canCancel(a) || canReschedule(a)) && (
                        <div className={cn("flex flex-col gap-1.5 shrink-0", isRTL && "items-start")}>
                          {canReschedule(a) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-7 gap-1 border-amber-300 text-amber-700 hover:bg-amber-50"
                              onClick={() => setRescheduleTarget(a)}
                            >
                              <RefreshCw className="w-3 h-3" />
                              {lang === "ar" ? "إعادة جدولة" : "Reschedule"}
                            </Button>
                          )}
                          {canCancel(a) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-7 gap-1 border-red-200 text-red-600 hover:bg-red-50"
                              onClick={() => setCancelTarget(a)}
                            >
                              <XCircle className="w-3 h-3" />
                              {lang === "ar" ? "إلغاء" : "Cancel"}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
      </div>

      {/* Book dialog */}
      <BookDialog open={bookOpen} onClose={() => setBookOpen(false)} />

      {/* Reschedule dialog */}
      {rescheduleTarget && (
        <BookDialog
          open={!!rescheduleTarget}
          onClose={() => setRescheduleTarget(null)}
          existingAppointment={rescheduleTarget}
        />
      )}

      {/* Cancel confirm */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(v) => !v && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className={cn(isRTL && "text-right")}>
              {lang === "ar" ? "تأكيد الإلغاء" : "Confirm Cancellation"}
            </AlertDialogTitle>
            <AlertDialogDescription className={cn(isRTL && "text-right")}>
              {lang === "ar"
                ? "هل أنت متأكد من إلغاء هذا الموعد؟ لا يمكن التراجع عن هذا الإجراء."
                : "Are you sure you want to cancel this appointment? This action cannot be undone."}
              {cancelTarget && (
                <span className="block mt-2 font-medium text-foreground">
                  {new Date(cancelTarget.scheduledAt).toLocaleString(lang === "ar" ? "ar-AE" : "en-AE", {
                    weekday: "long", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
                  })}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={cn(isRTL && "flex-row-reverse")}>
            <AlertDialogCancel>{lang === "ar" ? "رجوع" : "Go Back"}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => cancelTarget && cancelMutation.mutate(cancelTarget.id)}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : (lang === "ar" ? "إلغاء الموعد" : "Yes, Cancel It")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
