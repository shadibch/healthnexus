import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
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
import {
  CalendarClock, Users, UserCheck, Clock, Plus, ChevronRight,
  Search, Stethoscope, CheckCircle2, XCircle, Loader2,
  CalendarDays, UserPlus, ClipboardList, AlertCircle, Star,
  TrendingUp, ChevronLeft,
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

interface Patient {
  id: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  nationalId: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  bloodType: string | null;
  allergies: string | null;
  medicalNotes: string | null;
  address: string | null;
  email: string | null;
  createdAt: string;
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

const STATUS_COLORS: Record<string, string> = {
  scheduled:   "bg-blue-100 text-blue-800",
  confirmed:   "bg-indigo-100 text-indigo-800",
  in_progress: "bg-amber-100 text-amber-800",
  completed:   "bg-emerald-100 text-emerald-800",
  cancelled:   "bg-red-100 text-red-800",
  no_show:     "bg-gray-100 text-gray-600",
};

const STATUS_LABELS: Record<string, { en: string; ar: string }> = {
  scheduled:   { en: "Scheduled", ar: "مجدول" },
  confirmed:   { en: "Checked In", ar: "حضر" },
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

const SPEC_AR: Record<string, string> = {
  Cardiology: "أمراض القلب",
  "General Medicine": "الطب العام",
  Orthopedics: "العظام",
  Pediatrics: "طب الأطفال",
  Dermatology: "الجلدية",
  Neurology: "الأعصاب",
};

function todayISO() {
  return new Date().toISOString().split("T")[0];
}
function minDateISO() { return todayISO(); }
function maxDateISO() {
  const d = new Date();
  d.setMonth(d.getMonth() + 3);
  return d.toISOString().split("T")[0];
}

// ─── Stat Card ─────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color, sub }: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  color: string;
  sub?: string;
}) {
  return (
    <Card className="border">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", color)}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Register Patient Dialog ─────────────────────────────────────────────────
function RegisterPatientDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { lang, isRTL } = useI18n();
  const [form, setForm] = useState({
    firstName: "", lastName: "", phone: "", email: "", gender: "", bloodType: "",
    dateOfBirth: "", nationalId: "", allergies: "", medicalNotes: "", address: "",
  });

  const mutation = useMutation({
    mutationFn: (data: typeof form) => apiFetch("/patients", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patients"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast({ title: lang === "ar" ? "تم تسجيل المريض بنجاح" : "Patient registered successfully" });
      onOpenChange(false);
      setForm({ firstName: "", lastName: "", phone: "", email: "", gender: "", bloodType: "", dateOfBirth: "", nationalId: "", allergies: "", medicalNotes: "", address: "" });
    },
    onError: (e: Error) => toast({ title: lang === "ar" ? "خطأ" : "Error", description: e.message, variant: "destructive" }),
  });

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" dir={isRTL ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle className={cn(isRTL && "text-right")}>
            {lang === "ar" ? "تسجيل مريض جديد" : "Register New Patient"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{lang === "ar" ? "الاسم الأول" : "First Name"} *</Label>
              <Input className="mt-1" value={form.firstName} onChange={f("firstName")} />
            </div>
            <div>
              <Label className="text-xs">{lang === "ar" ? "اسم العائلة" : "Last Name"} *</Label>
              <Input className="mt-1" value={form.lastName} onChange={f("lastName")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{lang === "ar" ? "الهاتف" : "Phone"}</Label>
              <Input className="mt-1" value={form.phone} onChange={f("phone")} dir="ltr" />
            </div>
            <div>
              <Label className="text-xs">{lang === "ar" ? "البريد الإلكتروني" : "Email"}</Label>
              <Input className="mt-1" type="email" value={form.email} onChange={f("email")} dir="ltr" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">{lang === "ar" ? "الجنس" : "Gender"}</Label>
              <Select onValueChange={(v) => setForm((p) => ({ ...p, gender: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder={lang === "ar" ? "اختر" : "Select"} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">{lang === "ar" ? "ذكر" : "Male"}</SelectItem>
                  <SelectItem value="female">{lang === "ar" ? "أنثى" : "Female"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{lang === "ar" ? "فصيلة الدم" : "Blood Type"}</Label>
              <Select onValueChange={(v) => setForm((p) => ({ ...p, bloodType: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder={lang === "ar" ? "اختر" : "Select"} /></SelectTrigger>
                <SelectContent>
                  {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map((bt) => (
                    <SelectItem key={bt} value={bt}>{bt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{lang === "ar" ? "تاريخ الميلاد" : "Date of Birth"}</Label>
              <Input className="mt-1" type="date" value={form.dateOfBirth} onChange={f("dateOfBirth")} />
            </div>
          </div>
          <div>
            <Label className="text-xs">{lang === "ar" ? "الرقم الوطني" : "National ID"}</Label>
            <Input className="mt-1" value={form.nationalId} onChange={f("nationalId")} dir="ltr" />
          </div>
          <div>
            <Label className="text-xs">{lang === "ar" ? "العنوان" : "Address"}</Label>
            <Input className="mt-1" value={form.address} onChange={f("address")} />
          </div>
          <div>
            <Label className="text-xs">{lang === "ar" ? "الحساسية المعروفة" : "Known Allergies"}</Label>
            <Input className="mt-1" value={form.allergies} onChange={f("allergies")} placeholder={lang === "ar" ? "مثال: البنسلين، لا يوجد" : "e.g. Penicillin, None"} />
          </div>
          <div>
            <Label className="text-xs">{lang === "ar" ? "ملاحظات طبية" : "Medical Notes"}</Label>
            <Textarea className="mt-1 resize-none" rows={2} value={form.medicalNotes} onChange={f("medicalNotes")} />
          </div>
          <Button
            className="w-full"
            disabled={!form.firstName || !form.lastName || mutation.isPending}
            onClick={() => mutation.mutate(form)}
          >
            {mutation.isPending
              ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />{lang === "ar" ? "جارٍ التسجيل..." : "Registering..."}</>
              : <><UserPlus className="w-4 h-4 mr-2" />{lang === "ar" ? "تسجيل المريض" : "Register Patient"}</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Book Appointment Dialog (receptionist books on behalf of patient) ─────────
function BookAppointmentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { lang, isRTL } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [step, setStep] = useState(1);
  const [patientSearch, setPatientSearch] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [apptType, setApptType] = useState("routine");
  const [notes, setNotes] = useState("");

  const { data: allPatients = [] } = useQuery<Patient[]>({
    queryKey: ["patients"],
    queryFn: () => apiFetch("/patients?limit=200"),
    enabled: open,
  });

  const { data: doctors = [] } = useQuery<Doctor[]>({
    queryKey: ["doctors"],
    queryFn: () => apiFetch("/doctors"),
    enabled: open,
  });

  const { data: slotsData, isLoading: loadingSlots } = useQuery<{ slots: Slot[] }>({
    queryKey: ["slots", selectedDoctor?.id, selectedDate],
    queryFn: () => apiFetch(`/appointments/slots?doctorId=${selectedDoctor!.id}&date=${selectedDate}`),
    enabled: !!selectedDoctor && !!selectedDate && open,
  });

  const bookMutation = useMutation({
    mutationFn: () => {
      const [h, m] = selectedSlot!.split(":").map(Number);
      const dt = new Date(selectedDate);
      dt.setHours(h, m, 0, 0);
      return apiFetch("/appointments", {
        method: "POST",
        body: JSON.stringify({
          patientId: selectedPatient!.id,
          doctorId: selectedDoctor!.id,
          scheduledAt: dt.toISOString(),
          type: apptType,
          status: "scheduled",
          notes: notes || undefined,
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["today-appointments"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast({ title: lang === "ar" ? "تم حجز الموعد بنجاح" : "Appointment booked successfully" });
      onOpenChange(false);
      setStep(1);
      setSelectedPatient(null);
      setSelectedDoctor(null);
      setSelectedSlot(null);
      setNotes("");
      setApptType("routine");
    },
    onError: (e: Error) => toast({ title: lang === "ar" ? "خطأ" : "Error", description: e.message, variant: "destructive" }),
  });

  const filteredPatients = useMemo(() => {
    if (!patientSearch.trim()) return allPatients.slice(0, 10);
    const q = patientSearch.toLowerCase();
    return allPatients
      .filter((p) =>
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
        (p.nationalId ?? "").toLowerCase().includes(q) ||
        (p.phone ?? "").includes(q)
      )
      .slice(0, 8);
  }, [allPatients, patientSearch]);

  const availableSlots = slotsData?.slots.filter((s) => s.available) ?? [];
  const morningSlots = slotsData?.slots.filter((s) => parseInt(s.time) < 13) ?? [];
  const afternoonSlots = slotsData?.slots.filter((s) => parseInt(s.time) >= 14) ?? [];

  const resetAndClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setStep(1);
      setSelectedPatient(null);
      setSelectedDoctor(null);
      setSelectedSlot(null);
      setPatientSearch("");
      setNotes("");
      setApptType("routine");
    }, 200);
  };

  const APPOINTMENT_TYPES = [
    { value: "routine",      en: "Routine Checkup",      ar: "فحص روتيني" },
    { value: "follow_up",    en: "Follow-up Visit",       ar: "زيارة متابعة" },
    { value: "consultation", en: "Consultation",           ar: "استشارة" },
    { value: "emergency",    en: "Urgent / Emergency",     ar: "عاجل / طارئ" },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetAndClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className={cn(isRTL && "text-right")}>
            {lang === "ar" ? "حجز موعد للمريض" : "Book Appointment for Patient"}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicators */}
        <div className={cn("flex items-center gap-1 justify-center mb-2", isRTL && "flex-row-reverse")}>
          {[1,2,3].map((s) => (
            <div key={s} className={cn("flex items-center gap-1", isRTL && "flex-row-reverse")}>
              <div className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all",
                s < step ? "bg-primary text-primary-foreground border-primary" :
                s === step ? "border-primary text-primary bg-primary/10" :
                "border-border text-muted-foreground bg-muted/30"
              )}>
                {s < step ? <CheckCircle2 className="w-3.5 h-3.5" /> : s}
              </div>
              {s < 3 && <div className={cn("w-6 h-0.5 rounded", s < step ? "bg-primary" : "bg-border")} />}
            </div>
          ))}
        </div>

        {/* Step 1: Select patient */}
        {step === 1 && (
          <div className="space-y-3">
            <p className={cn("text-sm font-medium text-muted-foreground", isRTL && "text-right")}>
              {lang === "ar" ? "ابحث عن مريض أو اختره" : "Search for a patient"}
            </p>
            <div className="relative">
              <Search className={cn("absolute top-2.5 w-4 h-4 text-muted-foreground", isRTL ? "right-3" : "left-3")} />
              <Input
                className={cn("text-sm", isRTL ? "pr-9" : "pl-9")}
                placeholder={lang === "ar" ? "ابحث بالاسم أو الرقم الوطني..." : "Search by name or national ID..."}
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
                dir={isRTL ? "rtl" : "ltr"}
              />
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {filteredPatients.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  {lang === "ar" ? "لم يتم العثور على مريض" : "No patient found"}
                </p>
              ) : filteredPatients.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedPatient(p); setStep(2); }}
                  className={cn(
                    "w-full text-left p-3 rounded-lg border transition-all flex items-center gap-3",
                    "border-border hover:border-primary/40 hover:bg-muted/40",
                    isRTL && "flex-row-reverse text-right"
                  )}
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{p.firstName} {p.lastName}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.nationalId && `ID: ${p.nationalId}`}
                      {p.nationalId && p.phone && " · "}
                      {p.phone}
                    </p>
                  </div>
                  <ChevronRight className={cn("w-4 h-4 text-muted-foreground shrink-0", isRTL && "rotate-180")} />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Select doctor + date + slot */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Patient summary */}
            <div className={cn("flex items-center gap-2 p-2.5 bg-muted/40 rounded-lg text-sm", isRTL && "flex-row-reverse")}>
              <Users className="w-4 h-4 text-primary shrink-0" />
              <span className="font-medium">{selectedPatient?.firstName} {selectedPatient?.lastName}</span>
            </div>

            <div className="space-y-1">
              <Label className={cn("text-xs", isRTL && "block text-right")}>
                {lang === "ar" ? "الطبيب" : "Doctor"}
              </Label>
              <Select
                value={selectedDoctor ? String(selectedDoctor.id) : ""}
                onValueChange={(v) => {
                  setSelectedDoctor(doctors.find((d) => d.id === parseInt(v)) ?? null);
                  setSelectedSlot(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={lang === "ar" ? "اختر الطبيب" : "Choose a doctor"} />
                </SelectTrigger>
                <SelectContent>
                  {doctors.filter((d) => d.isAvailable).map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {lang === "ar"
                        ? `د. ${d.firstName} ${d.lastName} — ${SPEC_AR[d.specialization] ?? d.specialization}`
                        : `Dr. ${d.firstName} ${d.lastName} — ${d.specialization}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className={cn("text-xs", isRTL && "block text-right")}>
                {lang === "ar" ? "التاريخ" : "Date"}
              </Label>
              <input
                type="date"
                value={selectedDate}
                min={minDateISO()}
                max={maxDateISO()}
                onChange={(e) => { setSelectedDate(e.target.value); setSelectedSlot(null); }}
                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {selectedDoctor && (
              <div className="space-y-2">
                <p className={cn("text-xs font-medium text-muted-foreground", isRTL && "text-right")}>
                  {lang === "ar" ? "الأوقات المتاحة" : "Available Slots"}
                  {availableSlots.length > 0 && (
                    <span className="ml-1 text-emerald-600">({availableSlots.length} {lang === "ar" ? "متاح" : "available"})</span>
                  )}
                </p>
                {loadingSlots ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-2 justify-center">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {lang === "ar" ? "جارٍ التحميل..." : "Loading..."}
                  </div>
                ) : availableSlots.length === 0 ? (
                  <p className="text-xs text-center text-muted-foreground py-3 border border-dashed rounded-lg">
                    {lang === "ar" ? "لا مواعيد متاحة — اختر تاريخاً آخر" : "No slots available — try another date"}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {morningSlots.some((s) => s.available) && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                          {lang === "ar" ? "صباحاً" : "Morning"}
                        </p>
                        <div className="grid grid-cols-5 gap-1">
                          {morningSlots.map((slot) => (
                            <button
                              key={slot.time}
                              disabled={!slot.available}
                              onClick={() => setSelectedSlot(slot.time)}
                              className={cn(
                                "py-1.5 rounded-lg text-xs font-medium border transition-all",
                                slot.available
                                  ? selectedSlot === slot.time
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "border-border hover:border-primary/60 hover:bg-primary/5"
                                  : "border-dashed border-border text-muted-foreground/40 cursor-not-allowed bg-muted/20 line-through"
                              )}
                            >
                              {slot.time}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {afternoonSlots.some((s) => s.available) && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                          {lang === "ar" ? "بعد الظهر" : "Afternoon"}
                        </p>
                        <div className="grid grid-cols-5 gap-1">
                          {afternoonSlots.map((slot) => (
                            <button
                              key={slot.time}
                              disabled={!slot.available}
                              onClick={() => setSelectedSlot(slot.time)}
                              className={cn(
                                "py-1.5 rounded-lg text-xs font-medium border transition-all",
                                slot.available
                                  ? selectedSlot === slot.time
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "border-border hover:border-primary/60 hover:bg-primary/5"
                                  : "border-dashed border-border text-muted-foreground/40 cursor-not-allowed bg-muted/20 line-through"
                              )}
                            >
                              {slot.time}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className={cn("flex gap-2 pt-1", isRTL && "flex-row-reverse")}>
              <Button variant="outline" size="sm" onClick={() => setStep(1)} className="gap-1">
                <ChevronLeft className={cn("w-4 h-4", isRTL && "rotate-180")} />
                {lang === "ar" ? "رجوع" : "Back"}
              </Button>
              <Button
                className="flex-1"
                disabled={!selectedDoctor || !selectedSlot}
                onClick={() => setStep(3)}
              >
                {lang === "ar" ? "التالي" : "Next"}
                <ChevronRight className={cn("w-4 h-4 ml-1", isRTL && "rotate-180")} />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Type + notes + confirm */}
        {step === 3 && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg space-y-1.5 text-sm">
              <div className={cn("flex items-center gap-2", isRTL && "flex-row-reverse")}>
                <Users className="w-3.5 h-3.5 text-primary" />
                <span>{selectedPatient?.firstName} {selectedPatient?.lastName}</span>
              </div>
              <div className={cn("flex items-center gap-2", isRTL && "flex-row-reverse")}>
                <Stethoscope className="w-3.5 h-3.5 text-primary" />
                <span>
                  {lang === "ar"
                    ? `د. ${selectedDoctor?.firstName} ${selectedDoctor?.lastName}`
                    : `Dr. ${selectedDoctor?.firstName} ${selectedDoctor?.lastName}`}
                </span>
              </div>
              <div className={cn("flex items-center gap-2", isRTL && "flex-row-reverse")}>
                <CalendarDays className="w-3.5 h-3.5 text-primary" />
                <span>
                  {new Date(selectedDate).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-AE", {
                    weekday: "short", month: "short", day: "numeric",
                  })} — {selectedSlot}
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <Label className={cn("text-xs", isRTL && "block text-right")}>
                {lang === "ar" ? "نوع الموعد" : "Appointment Type"}
              </Label>
              <Select value={apptType} onValueChange={setApptType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APPOINTMENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {lang === "ar" ? t.ar : t.en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className={cn("text-xs", isRTL && "block text-right")}>
                {lang === "ar" ? "ملاحظات (اختياري)" : "Notes (optional)"}
              </Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={lang === "ar" ? "أي تفاصيل أو سبب الزيارة..." : "Reason for visit or any details..."}
                className={cn("resize-none", isRTL && "text-right")}
                rows={3}
                dir={isRTL ? "rtl" : "ltr"}
              />
            </div>

            <div className={cn("flex gap-2", isRTL && "flex-row-reverse")}>
              <Button variant="outline" size="sm" onClick={() => setStep(2)} className="gap-1">
                <ChevronLeft className={cn("w-4 h-4", isRTL && "rotate-180")} />
                {lang === "ar" ? "رجوع" : "Back"}
              </Button>
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 gap-1"
                onClick={() => bookMutation.mutate()}
                disabled={bookMutation.isPending}
              >
                {bookMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <CheckCircle2 className="w-4 h-4" />}
                {lang === "ar" ? "تأكيد الحجز" : "Confirm Booking"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Reception Dashboard ────────────────────────────────────────────────
export default function ReceptionPage() {
  const { lang, isRTL } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [registerOpen, setRegisterOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");

  // Fetch today's appointments
  const { data: todayData, isLoading: loadingToday } = useQuery<{
    total: number;
    scheduled: number;
    confirmed: number;
    inProgress: number;
    completed: number;
    cancelled: number;
    noShow: number;
    appointments: Appointment[];
  }>({
    queryKey: ["today-appointments"],
    queryFn: () => apiFetch("/appointments/today"),
    refetchInterval: 20000,
  });

  // Patient count for "new today"
  const { data: patients = [] } = useQuery<Patient[]>({
    queryKey: ["patients"],
    queryFn: () => apiFetch("/patients?limit=500"),
  });

  const newToday = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return patients.filter((p) => p.createdAt?.startsWith(today)).length;
  }, [patients]);

  // Status update mutation (check-in / no-show)
  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiFetch(`/appointments/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["today-appointments"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast({
        title: vars.status === "confirmed"
          ? (lang === "ar" ? "تم تسجيل الحضور" : "Checked in successfully")
          : (lang === "ar" ? "تم تسجيل الغياب" : "Marked as no-show"),
      });
    },
    onError: (e: Error) => toast({ title: lang === "ar" ? "خطأ" : "Error", description: e.message, variant: "destructive" }),
  });

  const appts = todayData?.appointments ?? [];
  const filteredAppts = filterStatus === "all"
    ? appts
    : appts.filter((a) => a.status === filterStatus);

  const FILTER_OPTS = [
    { value: "all",       en: "All",        ar: "الكل" },
    { value: "scheduled", en: "Scheduled",  ar: "مجدولة" },
    { value: "confirmed", en: "Checked In", ar: "حضروا" },
    { value: "in_progress", en: "With Doctor", ar: "مع الطبيب" },
    { value: "completed", en: "Done",       ar: "منتهية" },
    { value: "no_show",   en: "No Show",    ar: "غياب" },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className={cn("flex items-start justify-between gap-3", isRTL && "flex-row-reverse")}>
        <div className={cn(isRTL && "text-right")}>
          <h1 className="text-2xl font-bold">
            {lang === "ar" ? "لوحة الاستقبال" : "Reception Dashboard"}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString(lang === "ar" ? "ar-AE" : "en-AE", {
              weekday: "long", year: "numeric", month: "long", day: "numeric",
            })}
          </p>
        </div>
        <div className={cn("flex gap-2 shrink-0", isRTL && "flex-row-reverse")}>
          <Button
            variant="outline"
            className="gap-2 border-orange-300 text-orange-700 hover:bg-orange-50"
            onClick={() => setRegisterOpen(true)}
          >
            <UserPlus className="w-4 h-4" />
            <span className="hidden sm:inline">{lang === "ar" ? "تسجيل مريض" : "Register Patient"}</span>
          </Button>
          <Button className="gap-2" onClick={() => setBookOpen(true)}>
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">{lang === "ar" ? "حجز موعد" : "Book Appointment"}</span>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={CalendarClock}
          label={lang === "ar" ? "المواعيد اليوم" : "Today's Appointments"}
          value={loadingToday ? "—" : todayData?.total ?? 0}
          color="bg-blue-100 text-blue-700"
        />
        <StatCard
          icon={UserCheck}
          label={lang === "ar" ? "سُجّل حضورهم" : "Checked In"}
          value={loadingToday ? "—" : (todayData?.confirmed ?? 0) + (todayData?.inProgress ?? 0) + (todayData?.completed ?? 0)}
          color="bg-emerald-100 text-emerald-700"
        />
        <StatCard
          icon={Clock}
          label={lang === "ar" ? "ينتظرون" : "Waiting"}
          value={loadingToday ? "—" : todayData?.scheduled ?? 0}
          color="bg-amber-100 text-amber-700"
          sub={lang === "ar" ? "لم يسجلوا حضورهم بعد" : "not yet checked in"}
        />
        <StatCard
          icon={UserPlus}
          label={lang === "ar" ? "مرضى جدد اليوم" : "New Patients Today"}
          value={newToday}
          color="bg-orange-100 text-orange-700"
        />
      </div>

      {/* Today's appointment table */}
      <Card>
        <CardHeader className="pb-3">
          <div className={cn("flex items-center justify-between", isRTL && "flex-row-reverse")}>
            <CardTitle className="text-base">
              {lang === "ar" ? "مواعيد اليوم" : "Today's Appointments"}
            </CardTitle>
            <Badge variant="secondary" className="font-mono">{appts.length}</Badge>
          </div>
          {/* Filter tabs */}
          <div className={cn("flex gap-1 flex-wrap mt-2", isRTL && "flex-row-reverse")}>
            {FILTER_OPTS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilterStatus(opt.value)}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-full border font-medium transition-colors",
                  filterStatus === opt.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:bg-muted/50"
                )}
              >
                {lang === "ar" ? opt.ar : opt.en}
                {opt.value !== "all" && (
                  <span className="ml-1 opacity-60">
                    ({appts.filter((a) => a.status === opt.value).length})
                  </span>
                )}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {loadingToday ? (
            <div className="space-y-2">
              {[1,2,3,4].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
            </div>
          ) : filteredAppts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CalendarClock className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                {lang === "ar" ? "لا توجد مواعيد لعرضها" : "No appointments to display"}
              </p>
              <Button className="mt-4 gap-2" size="sm" onClick={() => setBookOpen(true)}>
                <Plus className="w-3.5 h-3.5" />
                {lang === "ar" ? "احجز موعداً" : "Book an appointment"}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredAppts
                .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
                .map((appt) => {
                  const time = new Date(appt.scheduledAt).toLocaleTimeString(lang === "ar" ? "ar-AE" : "en-AE", {
                    hour: "2-digit", minute: "2-digit",
                  });
                  const canCheckIn = appt.status === "scheduled";
                  const canNoShow = appt.status === "scheduled";
                  return (
                    <div
                      key={appt.id}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border transition-all",
                        canCheckIn ? "border-amber-200 bg-amber-50/40" : "border-border bg-background",
                        isRTL && "flex-row-reverse"
                      )}
                    >
                      {/* Queue + time */}
                      <div className={cn("flex flex-col items-center shrink-0 w-10 text-center", canCheckIn ? "text-amber-700" : "text-muted-foreground")}>
                        {appt.queueNumber && (
                          <span className="text-xs font-bold">#{appt.queueNumber}</span>
                        )}
                        <span className="text-xs font-medium">{time}</span>
                      </div>

                      {/* Info */}
                      <div className={cn("flex-1 min-w-0", isRTL && "text-right")}>
                        <div className={cn("flex items-center gap-1.5 flex-wrap", isRTL && "flex-row-reverse justify-end")}>
                          <span className="text-sm font-semibold truncate">
                            {appt.patientName ?? "—"}
                          </span>
                          <Badge className={cn("text-xs", STATUS_COLORS[appt.status] ?? "")}>
                            {lang === "ar"
                              ? STATUS_LABELS[appt.status]?.ar ?? appt.status
                              : STATUS_LABELS[appt.status]?.en ?? appt.status}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {lang === "ar"
                              ? TYPE_LABELS[appt.type]?.ar ?? appt.type
                              : TYPE_LABELS[appt.type]?.en ?? appt.type}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Stethoscope className="w-3 h-3" />
                          {lang === "ar" ? (appt.doctorName?.replace("Dr.", "د.") ?? "—") : (appt.doctorName ?? "—")}
                        </p>
                      </div>

                      {/* Actions */}
                      {(canCheckIn || canNoShow) && (
                        <div className={cn("flex items-center gap-1.5 shrink-0", isRTL && "flex-row-reverse")}>
                          {canCheckIn && (
                            <Button
                              size="sm"
                              className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700"
                              onClick={() => updateStatus.mutate({ id: appt.id, status: "confirmed" })}
                              disabled={updateStatus.isPending}
                            >
                              <UserCheck className="w-3 h-3" />
                              {lang === "ar" ? "حضور" : "Check In"}
                            </Button>
                          )}
                          {canNoShow && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1 border-red-200 text-red-600 hover:bg-red-50"
                              onClick={() => updateStatus.mutate({ id: appt.id, status: "no_show" })}
                              disabled={updateStatus.isPending}
                            >
                              <XCircle className="w-3 h-3" />
                              {lang === "ar" ? "غياب" : "No Show"}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <RegisterPatientDialog open={registerOpen} onOpenChange={setRegisterOpen} />
      <BookAppointmentDialog open={bookOpen} onOpenChange={setBookOpen} />
    </div>
  );
}
