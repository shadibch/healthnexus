import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Activity,
  FlaskConical,
  Scan,
  Radiation,
  Heart,
  Waves,
  Plus,
  CheckCircle2,
  Clock,
  ChevronLeft,
  User,
  AlertCircle,
  Stethoscope,
  History,
  X,
  Loader2,
  CornerDownRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

const ORDER_TYPES = [
  { value: "lab",        label: "Lab Test",   labelAr: "تحليل مختبري",       icon: FlaskConical, color: "text-blue-600 bg-blue-50 border-blue-200" },
  { value: "xray",       label: "X-Ray",      labelAr: "أشعة سينية",         icon: Radiation,    color: "text-amber-600 bg-amber-50 border-amber-200" },
  { value: "ct",         label: "CT Scan",    labelAr: "أشعة مقطعية",        icon: Scan,         color: "text-purple-600 bg-purple-50 border-purple-200" },
  { value: "mri",        label: "MRI",        labelAr: "رنين مغناطيسي",      icon: Scan,         color: "text-indigo-600 bg-indigo-50 border-indigo-200" },
  { value: "ultrasound", label: "Ultrasound", labelAr: "موجات فوق صوتية",    icon: Waves,        color: "text-teal-600 bg-teal-50 border-teal-200" },
  { value: "ecg",        label: "ECG",        labelAr: "تخطيط القلب",        icon: Heart,        color: "text-red-600 bg-red-50 border-red-200" },
  { value: "other",      label: "Other",      labelAr: "أخرى",               icon: Activity,     color: "text-gray-600 bg-gray-50 border-gray-200" },
];

const PRIORITY_CFG = {
  routine: { label: "Routine",  labelAr: "روتيني", color: "bg-gray-100 text-gray-700 border-gray-200" },
  urgent:  { label: "Urgent",   labelAr: "عاجل",   color: "bg-amber-100 text-amber-700 border-amber-300" },
  stat:    { label: "STAT",     labelAr: "فوري",   color: "bg-red-100 text-red-700 border-red-300" },
};

const STATUS_CFG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  ordered:     { label: "Ordered",     icon: <Clock className="w-3 h-3" />,        color: "text-blue-700 bg-blue-50" },
  in_progress: { label: "In Progress", icon: <Activity className="w-3 h-3" />,     color: "text-amber-700 bg-amber-50" },
  completed:   { label: "Completed",   icon: <CheckCircle2 className="w-3 h-3" />, color: "text-emerald-700 bg-emerald-50" },
  cancelled:   { label: "Cancelled",   icon: <X className="w-3 h-3" />,            color: "text-gray-500 bg-gray-50" },
};

interface MedicalOrder {
  id: number;
  consultationId: number;
  type: string;
  name: string;
  priority: string;
  status: string;
  notes: string | null;
  resultData: string | null;
  resultNotes: string | null;
  orderedAt: string;
  completedAt: string | null;
}

interface Encounter {
  id: number;
  appointmentId: number;
  patientId: number;
  doctorId: number;
  patientName: string | null;
  doctorName: string | null;
  encounterType: string;
  parentConsultationId: number | null;
  chiefComplaint: string | null;
  diagnosis: string | null;
  treatmentPlan: string | null;
  vitals: string | null;
  notes: string | null;
  followUpDate: string | null;
  status: string;
  createdAt: string;
  orders: MedicalOrder[];
}

interface Appointment {
  id: number;
  patientId: number;
  doctorId: number;
  patientName: string | null;
  doctorName: string | null;
  status: string;
  type: string;
  scheduledAt: string;
  notes: string | null;
}

interface Patient {
  id: number;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  gender: string | null;
  bloodType: string | null;
  allergies: string | null;
  medicalNotes: string | null;
  phone: string | null;
}

interface PastEncounter {
  id: number;
  encounterType: string;
  doctorName: string | null;
  chiefComplaint: string | null;
  diagnosis: string | null;
  status: string;
  createdAt: string;
  orders: MedicalOrder[];
}

// ─── Add Order Dialog ────────────────────────────────────────────────────────
function AddOrderDialog({ consultationId, open, onClose }: {
  consultationId: number; open: boolean; onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { lang } = useI18n();
  const [type, setType] = useState("lab");
  const [name, setName] = useState("");
  const [priority, setPriority] = useState("routine");
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch(`/consultations/${consultationId}/orders`, {
        method: "POST",
        body: JSON.stringify({ type, name, priority, notes: notes || null }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["encounter", consultationId] });
      toast({ title: lang === "ar" ? "تم إضافة الطلب" : "Order placed" });
      setName(""); setNotes(""); setType("lab"); setPriority("routine");
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{lang === "ar" ? "إضافة طلب طبي" : "Add Medical Order"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label className="text-xs">{lang === "ar" ? "النوع" : "Order Type"}</Label>
            <div className="grid grid-cols-4 gap-2 mt-1">
              {ORDER_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setType(t.value)}
                  className={cn(
                    "flex flex-col items-center gap-1 p-2 rounded-lg border text-xs font-medium transition-colors",
                    type === t.value ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted/40"
                  )}
                >
                  <t.icon className="w-4 h-4" />
                  {lang === "ar" ? t.labelAr : t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs">{lang === "ar" ? "الاسم / الوصف" : "Name / Description"} *</Label>
            <Input
              className="mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={type === "lab" ? "e.g. CBC, CMP, HbA1c..." : type === "xray" ? "e.g. Chest PA..." : type === "ct" ? "e.g. CT Chest with contrast..." : "Description..."}
            />
          </div>
          <div>
            <Label className="text-xs">{lang === "ar" ? "الأولوية" : "Priority"}</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="routine">Routine</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="stat">STAT (Immediately)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{lang === "ar" ? "ملاحظات" : "Clinical Notes / Reason"}</Label>
            <Textarea className="mt-1" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason for order..." />
          </div>
          <Button className="w-full" onClick={() => mutation.mutate()} disabled={!name || mutation.isPending}>
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {lang === "ar" ? "إضافة الطلب" : "Place Order"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Enter Result Dialog ─────────────────────────────────────────────────────
function ResultDialog({ order, onClose }: { order: MedicalOrder | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [resultData, setResultData] = useState("");
  const [resultNotes, setResultNotes] = useState("");

  useEffect(() => {
    setResultData(order?.resultData ?? "");
    setResultNotes(order?.resultNotes ?? "");
  }, [order?.id]);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch(`/orders/${order!.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "completed", resultData, resultNotes }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["encounter", order!.consultationId] });
      toast({ title: "Result saved" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={order != null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enter Result: {order?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div>
            <Label className="text-xs">Result Data / Findings</Label>
            <Textarea className="mt-1 font-mono text-sm" rows={5} value={resultData} onChange={(e) => setResultData(e.target.value)} placeholder="Enter result values, findings..." />
          </div>
          <div>
            <Label className="text-xs">Interpretation / Notes</Label>
            <Textarea className="mt-1" rows={2} value={resultNotes} onChange={(e) => setResultNotes(e.target.value)} placeholder="Clinical interpretation..." />
          </div>
          <Button className="w-full" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Save Result & Mark Complete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Encounter Page ─────────────────────────────────────────────────────
export default function EncounterPage() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { lang, isRTL } = useI18n();
  const qc = useQueryClient();
  const { toast } = useToast();

  const apptId = parseInt(appointmentId ?? "0");

  const [addOrderOpen, setAddOrderOpen] = useState(false);
  const [resultOrder, setResultOrder] = useState<MedicalOrder | null>(null);

  // Form state
  const [vitals, setVitals] = useState("");
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [treatmentPlan, setTreatmentPlan] = useState("");
  const [notes, setNotes] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");

  // ── Fetch appointment ──────────────────────────────────────────────────────
  const { data: appointment, isLoading: loadingAppt } = useQuery<Appointment>({
    queryKey: ["appointment", apptId],
    queryFn: () => apiFetch(`/appointments/${apptId}`),
    enabled: apptId > 0,
  });

  // ── Fetch patient ──────────────────────────────────────────────────────────
  const { data: patient } = useQuery<Patient>({
    queryKey: ["patient", appointment?.patientId],
    queryFn: () => apiFetch(`/patients/${appointment!.patientId}`),
    enabled: !!appointment?.patientId,
  });

  // ── Fetch existing encounter for THIS appointment directly ─────────────────
  // Uses appointmentId filter so we never miss it regardless of how many consultations exist
  const { data: existingList, isLoading: loadingExisting } = useQuery<Encounter[]>({
    queryKey: ["encounter-for-appt", apptId],
    queryFn: () => apiFetch(`/consultations?appointmentId=${apptId}&limit=1`),
    enabled: apptId > 0,
  });
  const existingEncounter = existingList?.[0] ?? null;

  // ── Fetch full encounter with orders ──────────────────────────────────────
  const activeEncounterId = existingEncounter?.id ?? null;
  const { data: encounter, isLoading: loadingEncounter } = useQuery<Encounter>({
    queryKey: ["encounter", activeEncounterId],
    queryFn: () => apiFetch(`/consultations/${activeEncounterId}`),
    enabled: activeEncounterId != null,
    refetchInterval: 15000,
  });

  // Sync form when encounter loads
  useEffect(() => {
    if (encounter) {
      setVitals(encounter.vitals ?? "");
      setChiefComplaint(encounter.chiefComplaint ?? "");
      setDiagnosis(encounter.diagnosis ?? "");
      setTreatmentPlan(encounter.treatmentPlan ?? "");
      setNotes(encounter.notes ?? "");
      setFollowUpDate(encounter.followUpDate ?? "");
    }
  }, [encounter?.id]);

  // ── Patient's last 3 encounters (history panel) ───────────────────────────
  const { data: pastEncounters } = useQuery<PastEncounter[]>({
    queryKey: ["patient-encounters", appointment?.patientId],
    queryFn: () => apiFetch(`/patients/${appointment!.patientId}/encounters`),
    enabled: !!appointment?.patientId,
  });

  // ── Create encounter (idempotent — server returns existing if duplicate) ───
  const createEncounterMutation = useMutation({
    mutationFn: () =>
      apiFetch<Encounter>("/consultations", {
        method: "POST",
        body: JSON.stringify({
          appointmentId: apptId,
          patientId: appointment!.patientId,
          // doctorId is derived from session on the server; send as safety fallback
          doctorId: user?.doctorDbId ?? appointment?.doctorId,
          chiefComplaint: chiefComplaint || null,
          diagnosis: diagnosis || null,
          treatmentPlan: treatmentPlan || null,
          vitals: vitals || null,
          notes: notes || null,
          followUpDate: followUpDate || null,
          status: "in_progress",
        }),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["encounter-for-appt", apptId] });
      qc.invalidateQueries({ queryKey: ["encounter", data.id] });
      qc.invalidateQueries({ queryKey: ["patient-encounters", appointment?.patientId] });
      qc.invalidateQueries({ queryKey: ["consultations"] });
      const msg = data.encounterType === "follow_up"
        ? (lang === "ar" ? "تم إنشاء متابعة للزيارة السابقة" : "Follow-up encounter created — linked to previous visit")
        : (lang === "ar" ? "تم فتح سجل المريض" : "Encounter started successfully");
      toast({ title: msg });
    },
    onError: (e: Error) => toast({ title: lang === "ar" ? "خطأ" : "Error", description: e.message, variant: "destructive" }),
  });

  // ── Save encounter ─────────────────────────────────────────────────────────
  const saveEncounterMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/consultations/${activeEncounterId}`, {
        method: "PATCH",
        body: JSON.stringify({
          chiefComplaint: chiefComplaint || null,
          diagnosis: diagnosis || null,
          treatmentPlan: treatmentPlan || null,
          vitals: vitals || null,
          notes: notes || null,
          followUpDate: followUpDate || null,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["encounter", activeEncounterId] });
      qc.invalidateQueries({ queryKey: ["consultations"] });
      toast({ title: lang === "ar" ? "تم الحفظ" : "Saved" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Complete encounter ─────────────────────────────────────────────────────
  const completeEncounterMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/consultations/${activeEncounterId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "completed" }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["encounter", activeEncounterId] });
      qc.invalidateQueries({ queryKey: ["consultations"] });
      qc.invalidateQueries({ queryKey: ["queue"] });
      toast({ title: lang === "ar" ? "تم إنهاء السجل" : "Encounter completed" });
      navigate("/queue");
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loadingAppt) {
    return (
      <div className="space-y-4 max-w-5xl">
        <Skeleton className="h-10 w-48" />
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
          <Skeleton className="h-80 w-full" />
        </div>
      </div>
    );
  }

  if (!appointment) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">{lang === "ar" ? "لم يُعثر على الموعد" : "Appointment not found"}</p>
        <Button variant="ghost" onClick={() => navigate("/queue")} className="mt-2">
          {lang === "ar" ? "العودة للطابور" : "Back to Queue"}
        </Button>
      </div>
    );
  }

  const age = patient?.dateOfBirth
    ? Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null;

  const isCompleted = encounter?.status === "completed";
  const hasEncounter = activeEncounterId != null;
  const isEncounterLoading = hasEncounter && loadingEncounter;

  return (
    <div className={cn("space-y-4 max-w-5xl", isRTL && "font-arabic")} dir={isRTL ? "rtl" : "ltr"}>
      {/* ── Header ── */}
      <div className={cn("flex items-center gap-3", isRTL && "flex-row-reverse")}>
        <Button variant="ghost" size="sm" onClick={() => navigate("/queue")} className="gap-1 shrink-0">
          <ChevronLeft className={cn("w-4 h-4", isRTL && "rotate-180")} />
          {lang === "ar" ? "الطابور" : "Queue"}
        </Button>
        <div className={cn("flex-1 min-w-0", isRTL && "text-right")}>
          <h1 className="text-xl font-bold truncate">
            {lang === "ar" ? "سجل المريض" : "Patient Encounter"}
            {encounter?.encounterType === "follow_up" && (
              <span className="ml-2 text-sm font-normal text-amber-600 inline-flex items-center gap-1">
                <CornerDownRight className="w-3.5 h-3.5" />
                {lang === "ar" ? "متابعة" : "Follow-up"}
              </span>
            )}
          </h1>
          <p className="text-xs text-muted-foreground">
            {new Date(appointment.scheduledAt).toLocaleString(isRTL ? "ar-AE" : "en-AE")}
            {appointment.doctorName && <span className="ml-2">· {appointment.doctorName}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isCompleted && (
            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">
              {lang === "ar" ? "مكتمل" : "Completed"}
            </Badge>
          )}
          {hasEncounter && !isCompleted && (
            <Badge className="bg-amber-100 text-amber-800 border-amber-300 animate-pulse">
              {lang === "ar" ? "جارٍ" : "In Progress"}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* ── Left: Form ── */}
        <div className="lg:col-span-2 space-y-4">
          {/* Patient card */}
          <Card>
            <CardContent className="p-4">
              <div className={cn("flex items-start gap-3", isRTL && "flex-row-reverse")}>
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="w-6 h-6 text-primary" />
                </div>
                <div className={cn("flex-1 min-w-0", isRTL && "text-right")}>
                  <div className={cn("flex items-center gap-2 flex-wrap", isRTL && "flex-row-reverse")}>
                    <p className="font-bold text-base">{appointment.patientName}</p>
                    {patient?.bloodType && <Badge variant="outline" className="text-xs">{patient.bloodType}</Badge>}
                    {age != null && <span className="text-xs text-muted-foreground">{age}y · {patient?.gender}</span>}
                    <Badge variant="secondary" className="text-xs capitalize">{appointment.type.replace("_", " ")}</Badge>
                  </div>
                  {patient?.allergies && patient.allergies !== "None" && (
                    <div className={cn("flex items-center gap-1 mt-1", isRTL && "flex-row-reverse")}>
                      <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <p className="text-xs text-amber-700 font-medium">
                        {lang === "ar" ? "تحسس:" : "Allergy:"} {patient.allergies}
                      </p>
                    </div>
                  )}
                  {patient?.medicalNotes && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{patient.medicalNotes}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── No encounter yet: show big start button ── */}
          {!hasEncounter && !loadingExisting && (
            <Card className="border-dashed border-primary/40 bg-primary/5">
              <CardContent className="py-8 text-center">
                <Stethoscope className="w-10 h-10 text-primary/50 mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground mb-1">
                  {lang === "ar" ? "لم يُفتح سجل لهذا الموعد بعد" : "No encounter started for this appointment yet"}
                </p>
                <p className="text-xs text-muted-foreground mb-4">
                  {lang === "ar"
                    ? "انقر للبدء — سيُكشف تلقائياً إذا كانت متابعة لزيارة سابقة خلال 7 أيام"
                    : "Click to start — auto-detected as follow-up if patient visited in the last 7 days"}
                </p>
                <Button
                  size="lg"
                  onClick={() => createEncounterMutation.mutate()}
                  disabled={createEncounterMutation.isPending}
                  className="gap-2"
                >
                  {createEncounterMutation.isPending
                    ? <><Loader2 className="w-4 h-4 animate-spin" />{lang === "ar" ? "جارٍ الإنشاء..." : "Creating..."}</>
                    : <><Stethoscope className="w-4 h-4" />{lang === "ar" ? "بدء سجل المريض" : "Start Encounter"}</>}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Loading existing encounter */}
          {loadingExisting && (
            <Card><CardContent className="py-6 flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">{lang === "ar" ? "جارٍ التحميل..." : "Checking for existing encounter..."}</span>
            </CardContent></Card>
          )}

          {/* ── Encounter form (shown once encounter exists) ── */}
          {hasEncounter && (
            <>
              {/* Vitals */}
              <Card>
                <CardHeader className="py-3 px-4">
                  <CardTitle className={cn("text-sm font-semibold flex items-center gap-2", isRTL && "flex-row-reverse")}>
                    <Activity className="w-4 h-4 text-rose-500" />
                    {lang === "ar" ? "العلامات الحيوية" : "Vitals"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <Input
                    value={vitals}
                    onChange={(e) => setVitals(e.target.value)}
                    placeholder="BP: 120/80 · HR: 75 · Temp: 37°C · SpO2: 98% · RR: 16 · Weight: 70kg"
                    disabled={isCompleted}
                    className="font-mono text-sm"
                  />
                </CardContent>
              </Card>

              {/* Clinical Assessment */}
              <Card>
                <CardHeader className="py-3 px-4">
                  <CardTitle className={cn("text-sm font-semibold flex items-center gap-2", isRTL && "flex-row-reverse")}>
                    <Stethoscope className="w-4 h-4 text-primary" />
                    {lang === "ar" ? "الفحص السريري" : "Clinical Assessment"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">{lang === "ar" ? "الشكوى الرئيسية" : "Chief Complaint"}</Label>
                    <Textarea className="mt-1" rows={2} value={chiefComplaint} onChange={(e) => setChiefComplaint(e.target.value)}
                      placeholder={lang === "ar" ? "ما يشكو منه المريض..." : "Patient's presenting complaint..."} disabled={isCompleted} />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">{lang === "ar" ? "التشخيص" : "Diagnosis"}</Label>
                    <Textarea className="mt-1" rows={2} value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)}
                      placeholder={lang === "ar" ? "التشخيص / الحالة..." : "Diagnosis / ICD codes..."} disabled={isCompleted} />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">{lang === "ar" ? "خطة العلاج" : "Treatment Plan"}</Label>
                    <Textarea className="mt-1" rows={3} value={treatmentPlan} onChange={(e) => setTreatmentPlan(e.target.value)}
                      placeholder={lang === "ar" ? "الأدوية، الإجراءات، التحويل، التعليمات..." : "Medications, procedures, referrals, instructions..."} disabled={isCompleted} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">{lang === "ar" ? "ملاحظات" : "Internal Notes"}</Label>
                      <Textarea className="mt-1" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
                        placeholder={lang === "ar" ? "ملاحظات إضافية..." : "Additional notes..."} disabled={isCompleted} />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">{lang === "ar" ? "موعد المتابعة" : "Follow-up Date"}</Label>
                      <Input className="mt-1" type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)}
                        disabled={isCompleted} dir="ltr" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Medical Orders */}
              <Card>
                <CardHeader className="py-3 px-4">
                  <div className={cn("flex items-center justify-between", isRTL && "flex-row-reverse")}>
                    <CardTitle className={cn("text-sm font-semibold flex items-center gap-2", isRTL && "flex-row-reverse")}>
                      <FlaskConical className="w-4 h-4 text-blue-500" />
                      {lang === "ar" ? "الطلبات الطبية" : "Medical Orders"}
                      {encounter?.orders.length ? <Badge variant="secondary" className="text-xs">{encounter.orders.length}</Badge> : null}
                    </CardTitle>
                    {!isCompleted && (
                      <Button size="sm" variant="outline" onClick={() => setAddOrderOpen(true)} className="gap-1 text-xs">
                        <Plus className="w-3.5 h-3.5" />{lang === "ar" ? "إضافة طلب" : "Add Order"}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {isEncounterLoading ? (
                    <Skeleton className="h-20 w-full" />
                  ) : !encounter?.orders.length ? (
                    <p className="text-xs text-muted-foreground text-center py-6">
                      {lang === "ar" ? "لا توجد طلبات بعد — أضف تحليلاً أو أشعة" : "No orders yet — add labs or imaging"}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {encounter.orders.map((order) => {
                        const info = ORDER_TYPES.find((t) => t.value === order.type) ?? ORDER_TYPES[6];
                        const sc = STATUS_CFG[order.status];
                        const pc = PRIORITY_CFG[order.priority as keyof typeof PRIORITY_CFG];
                        const Icon = info.icon;
                        return (
                          <div key={order.id} className={cn("p-3 rounded-lg border", order.status === "completed" ? "bg-emerald-50/40 border-emerald-200" : "bg-muted/20 border-border")}>
                            <div className={cn("flex items-start justify-between gap-2", isRTL && "flex-row-reverse")}>
                              <div className={cn("flex items-center gap-2", isRTL && "flex-row-reverse")}>
                                <div className={cn("w-7 h-7 rounded-md flex items-center justify-center shrink-0 border", info.color)}>
                                  <Icon className="w-3.5 h-3.5" />
                                </div>
                                <div className={cn(isRTL && "text-right")}>
                                  <p className="text-sm font-medium">{order.name}</p>
                                  <div className={cn("flex items-center gap-1.5 mt-0.5", isRTL && "flex-row-reverse")}>
                                    <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1", sc.color)}>
                                      {sc.icon}{sc.label}
                                    </span>
                                    <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium border", pc.color)}>
                                      {lang === "ar" ? pc.labelAr : pc.label}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              {order.status !== "completed" && order.status !== "cancelled" && !isCompleted && (
                                <Button size="sm" variant="outline" onClick={() => setResultOrder(order)} className="text-xs shrink-0">
                                  {lang === "ar" ? "إدخال النتيجة" : "Enter Result"}
                                </Button>
                              )}
                            </div>
                            {order.notes && (
                              <p className={cn("text-xs text-muted-foreground mt-2 pl-9", isRTL && "text-right pr-9 pl-0")}>{order.notes}</p>
                            )}
                            {order.resultData && (
                              <div className={cn("mt-2 ml-9 p-2 rounded bg-emerald-50 border border-emerald-200", isRTL && "mr-9 ml-0 text-right")}>
                                <p className="text-xs font-semibold text-emerald-700 mb-1">{lang === "ar" ? "النتيجة:" : "Result:"}</p>
                                <p className="text-xs font-mono text-emerald-900 whitespace-pre-wrap">{order.resultData}</p>
                                {order.resultNotes && <p className="text-xs text-emerald-700 mt-1 italic">{order.resultNotes}</p>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Action buttons */}
              {!isCompleted && (
                <div className={cn("flex items-center gap-3", isRTL && "flex-row-reverse")}>
                  <Button
                    variant="outline"
                    onClick={() => saveEncounterMutation.mutate()}
                    disabled={saveEncounterMutation.isPending}
                    className="gap-1"
                  >
                    {saveEncounterMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    {lang === "ar" ? "حفظ" : "Save"}
                  </Button>
                  <Button
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 gap-1"
                    onClick={() => completeEncounterMutation.mutate()}
                    disabled={completeEncounterMutation.isPending}
                  >
                    {completeEncounterMutation.isPending
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <CheckCircle2 className="w-4 h-4" />}
                    {lang === "ar" ? "إنهاء وإغلاق السجل" : "Complete & Close Encounter"}
                  </Button>
                </div>
              )}
              {isCompleted && (
                <div className="flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  {lang === "ar" ? "تم إنهاء هذا السجل" : "This encounter has been completed"}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Right: Patient History ── */}
        <div className="space-y-4">
          <Card className="sticky top-0">
            <CardHeader className="py-3 px-4">
              <CardTitle className={cn("text-sm font-semibold flex items-center gap-2", isRTL && "flex-row-reverse")}>
                <History className="w-4 h-4 text-violet-500" />
                {lang === "ar" ? "آخر 3 زيارات" : "Last 3 Encounters"}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {!pastEncounters ? (
                <div className="space-y-2">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : pastEncounters.filter((e) => e.id !== activeEncounterId).length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">
                  {lang === "ar" ? "لا توجد زيارات سابقة" : "No previous encounters"}
                </p>
              ) : (
                <div className="space-y-3">
                  {pastEncounters
                    .filter((e) => e.id !== activeEncounterId)
                    .map((enc) => (
                      <div key={enc.id} className="border border-border rounded-lg p-3 space-y-2 bg-muted/10">
                        <div className={cn("flex items-center justify-between gap-1 flex-wrap", isRTL && "flex-row-reverse")}>
                          <div className={cn("flex items-center gap-1.5", isRTL && "flex-row-reverse")}>
                            <Badge variant="outline" className={cn("text-xs", enc.encounterType === "follow_up" ? "text-amber-700 border-amber-300" : "text-blue-700 border-blue-300")}>
                              {enc.encounterType === "follow_up" ? (lang === "ar" ? "متابعة" : "Follow-up") : (lang === "ar" ? "أولي" : "Initial")}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(enc.createdAt), { addSuffix: true })}
                            </span>
                          </div>
                          <Badge variant="secondary" className={cn("text-xs", enc.status === "completed" ? "text-emerald-700" : "text-amber-700")}>
                            {enc.status === "completed" ? (lang === "ar" ? "مكتمل" : "Done") : (lang === "ar" ? "جارٍ" : "Open")}
                          </Badge>
                        </div>
                        {enc.doctorName && (
                          <p className={cn("text-xs text-muted-foreground flex items-center gap-1", isRTL && "flex-row-reverse")}>
                            <Stethoscope className="w-3 h-3" />{enc.doctorName}
                          </p>
                        )}
                        {enc.chiefComplaint && (
                          <div className={cn(isRTL && "text-right")}>
                            <p className="text-xs font-semibold text-muted-foreground">{lang === "ar" ? "الشكوى:" : "Complaint:"}</p>
                            <p className="text-xs line-clamp-2">{enc.chiefComplaint}</p>
                          </div>
                        )}
                        {enc.diagnosis && (
                          <div className="p-2 bg-blue-50 rounded text-xs border border-blue-100">
                            <span className="font-semibold text-blue-700">{lang === "ar" ? "تشخيص: " : "Dx: "}</span>
                            <span className="text-blue-800">{enc.diagnosis}</span>
                          </div>
                        )}
                        {enc.orders.length > 0 && (
                          <div className={cn("flex flex-wrap gap-1", isRTL && "flex-row-reverse")}>
                            {enc.orders.map((o) => {
                              const info = ORDER_TYPES.find((t) => t.value === o.type) ?? ORDER_TYPES[6];
                              const Icon = info.icon;
                              return (
                                <span key={o.id} className={cn("text-xs px-1.5 py-0.5 rounded border flex items-center gap-1", info.color)}>
                                  <Icon className="w-3 h-3" />{o.name}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dialogs */}
      {activeEncounterId && (
        <AddOrderDialog consultationId={activeEncounterId} open={addOrderOpen} onClose={() => setAddOrderOpen(false)} />
      )}
      <ResultDialog order={resultOrder} onClose={() => setResultOrder(null)} />
    </div>
  );
}
