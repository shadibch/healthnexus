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
  FileText,
  Stethoscope,
  History,
  Pill,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

const ORDER_TYPES = [
  { value: "lab", label: "Lab Test", labelAr: "تحليل مختبري", icon: FlaskConical, color: "text-blue-600 bg-blue-50" },
  { value: "xray", label: "X-Ray", labelAr: "أشعة سينية", icon: Radiation, color: "text-amber-600 bg-amber-50" },
  { value: "ct", label: "CT Scan", labelAr: "أشعة مقطعية", icon: Scan, color: "text-purple-600 bg-purple-50" },
  { value: "mri", label: "MRI", labelAr: "رنين مغناطيسي", icon: Scan, color: "text-indigo-600 bg-indigo-50" },
  { value: "ultrasound", label: "Ultrasound", labelAr: "موجات فوق صوتية", icon: Waves, color: "text-teal-600 bg-teal-50" },
  { value: "ecg", label: "ECG", labelAr: "تخطيط القلب", icon: Heart, color: "text-red-600 bg-red-50" },
  { value: "other", label: "Other", labelAr: "أخرى", icon: Activity, color: "text-gray-600 bg-gray-50" },
];

const PRIORITY_CONFIG = {
  routine: { label: "Routine", labelAr: "روتيني", color: "bg-gray-100 text-gray-700" },
  urgent: { label: "Urgent", labelAr: "عاجل", color: "bg-amber-100 text-amber-700" },
  stat: { label: "STAT", labelAr: "فوري", color: "bg-red-100 text-red-700" },
};

const ORDER_STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  ordered: { label: "Ordered", icon: <Clock className="w-3 h-3" />, color: "text-blue-700 bg-blue-50" },
  in_progress: { label: "In Progress", icon: <Activity className="w-3 h-3" />, color: "text-amber-700 bg-amber-50" },
  completed: { label: "Completed", icon: <CheckCircle2 className="w-3 h-3" />, color: "text-emerald-700 bg-emerald-50" },
  cancelled: { label: "Cancelled", icon: <X className="w-3 h-3" />, color: "text-gray-500 bg-gray-50" },
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

function AddOrderDialog({
  consultationId,
  open,
  onClose,
}: {
  consultationId: number;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { lang, isRTL } = useI18n();
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
      qc.invalidateQueries({ queryKey: ["encounter-orders", consultationId] });
      toast({ title: "Order placed successfully" });
      setName(""); setNotes(""); setType("lab"); setPriority("routine");
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const selectedType = ORDER_TYPES.find((t) => t.value === type);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md" dir={isRTL ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle className={cn(isRTL && "text-right")}>
            {lang === "ar" ? "إضافة طلب طبي" : "Add Medical Order"}
          </DialogTitle>
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
                    type === t.value
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/40"
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
              placeholder={
                type === "lab" ? "e.g. CBC, CMP, HbA1c..." :
                type === "xray" ? "e.g. Chest PA, Lateral..." :
                type === "ct" ? "e.g. CT Chest with contrast..." :
                type === "mri" ? "e.g. MRI Brain without contrast..." :
                "Description..."
              }
            />
          </div>
          <div>
            <Label className="text-xs">{lang === "ar" ? "الأولوية" : "Priority"}</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="routine">Routine</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="stat">STAT (Immediately)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{lang === "ar" ? "ملاحظات سريرية" : "Clinical Notes / Reason"}</Label>
            <Textarea
              className="mt-1"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason for order, clinical context..."
            />
          </div>
          <Button
            className="w-full"
            onClick={() => mutation.mutate()}
            disabled={!name || mutation.isPending}
          >
            {mutation.isPending ? "Placing..." : lang === "ar" ? "إضافة الطلب" : "Place Order"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResultDialog({
  order,
  onClose,
}: {
  order: MedicalOrder | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [resultData, setResultData] = useState(order?.resultData ?? "");
  const [resultNotes, setResultNotes] = useState(order?.resultNotes ?? "");

  useEffect(() => {
    setResultData(order?.resultData ?? "");
    setResultNotes(order?.resultNotes ?? "");
  }, [order]);

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
            <Textarea
              className="mt-1 font-mono text-sm"
              rows={5}
              value={resultData}
              onChange={(e) => setResultData(e.target.value)}
              placeholder="Enter result values, findings, measurements..."
            />
          </div>
          <div>
            <Label className="text-xs">Interpretation / Notes</Label>
            <Textarea
              className="mt-1"
              rows={2}
              value={resultNotes}
              onChange={(e) => setResultNotes(e.target.value)}
              placeholder="Clinical interpretation..."
            />
          </div>
          <Button className="w-full" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving..." : "Save Result & Mark Complete"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function EncounterPage() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { t, lang, isRTL } = useI18n();
  const qc = useQueryClient();
  const { toast } = useToast();

  const apptId = parseInt(appointmentId ?? "0");

  const [addOrderOpen, setAddOrderOpen] = useState(false);
  const [resultOrder, setResultOrder] = useState<MedicalOrder | null>(null);

  // Encounter form state
  const [vitals, setVitals] = useState("");
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [treatmentPlan, setTreatmentPlan] = useState("");
  const [notes, setNotes] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [encounterId, setEncounterId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Fetch the appointment
  const { data: appointment, isLoading: loadingAppt } = useQuery<Appointment>({
    queryKey: ["appointment", apptId],
    queryFn: () => apiFetch(`/appointments/${apptId}`),
    enabled: apptId > 0,
  });

  // Fetch the patient
  const { data: patient } = useQuery<Patient>({
    queryKey: ["patient", appointment?.patientId],
    queryFn: () => apiFetch(`/patients/${appointment!.patientId}`),
    enabled: !!appointment?.patientId,
  });

  // Fetch existing encounter for this appointment (if any)
  const { data: existingEncounters } = useQuery<Encounter[]>({
    queryKey: ["consultation-for-appt", apptId],
    queryFn: () => apiFetch(`/consultations?limit=5`),
    enabled: apptId > 0,
  });

  // Find encounter for this appointment
  const existingEncounter = existingEncounters?.find((e) => e.appointmentId === apptId);

  // Fetch full encounter (with orders) if we have an ID
  const activeEncounterId = encounterId ?? existingEncounter?.id ?? null;
  const { data: encounter } = useQuery<Encounter>({
    queryKey: ["encounter", activeEncounterId],
    queryFn: () => apiFetch(`/consultations/${activeEncounterId}`),
    enabled: activeEncounterId != null,
    refetchInterval: 10000,
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

  // Fetch last 3 encounters for patient (history)
  const { data: pastEncounters } = useQuery<PastEncounter[]>({
    queryKey: ["patient-encounters", appointment?.patientId],
    queryFn: () => apiFetch(`/patients/${appointment!.patientId}/encounters`),
    enabled: !!appointment?.patientId,
  });

  const createEncounterMutation = useMutation({
    mutationFn: () =>
      apiFetch<Encounter>("/consultations", {
        method: "POST",
        body: JSON.stringify({
          appointmentId: apptId,
          patientId: appointment!.patientId,
          doctorId: user!.doctorDbId,
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
      setEncounterId(data.id);
      qc.invalidateQueries({ queryKey: ["consultation-for-appt", apptId] });
      qc.invalidateQueries({ queryKey: ["patient-encounters", appointment?.patientId] });
      toast({ title: data.encounterType === "follow_up" ? "Follow-up encounter created (linked to previous visit)" : "New encounter created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

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
      toast({ title: "Encounter saved" });
      setSaving(false);
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setSaving(false);
    },
  });

  const completeEncounterMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/consultations/${activeEncounterId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "completed" }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["encounter", activeEncounterId] });
      qc.invalidateQueries({ queryKey: ["queue"] });
      toast({ title: "Encounter completed" });
      navigate("/queue");
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (loadingAppt) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!appointment) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Appointment not found</p>
        <Button variant="ghost" onClick={() => navigate("/queue")} className="mt-2">Back to Queue</Button>
      </div>
    );
  }

  const age = patient?.dateOfBirth
    ? Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null;

  const ordersByStatus = {
    pending: encounter?.orders.filter((o) => ["ordered", "in_progress"].includes(o.status)) ?? [],
    completed: encounter?.orders.filter((o) => o.status === "completed") ?? [],
  };

  const isCompleted = encounter?.status === "completed";

  return (
    <div className={cn("space-y-4 max-w-5xl", isRTL && "font-arabic")} dir={isRTL ? "rtl" : "ltr"}>
      {/* Header */}
      <div className={cn("flex items-center gap-3", isRTL && "flex-row-reverse")}>
        <Button variant="ghost" size="sm" onClick={() => navigate("/queue")} className="gap-1 shrink-0">
          <ChevronLeft className={cn("w-4 h-4", isRTL && "rotate-180")} />
          {lang === "ar" ? "العودة" : "Back"}
        </Button>
        <div className={cn("flex-1", isRTL && "text-right")}>
          <h1 className="text-xl font-bold">
            {lang === "ar" ? "سجل المريض" : "Patient Encounter"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {new Date(appointment.scheduledAt).toLocaleString(isRTL ? "ar-AE" : "en-AE")}
            {encounter?.encounterType === "follow_up" && (
              <span className="ml-2 text-amber-600 font-medium">
                · {lang === "ar" ? "متابعة للزيارة السابقة" : "Follow-up Visit"}
              </span>
            )}
          </p>
        </div>
        {isCompleted && (
          <Badge className="bg-emerald-100 text-emerald-800 shrink-0">
            {lang === "ar" ? "مكتمل" : "Completed"}
          </Badge>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Left: Encounter form */}
        <div className="lg:col-span-2 space-y-4">
          {/* Patient card */}
          <Card className="border-border">
            <CardContent className="p-4">
              <div className={cn("flex items-start gap-3", isRTL && "flex-row-reverse")}>
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="w-6 h-6 text-primary" />
                </div>
                <div className={cn("flex-1", isRTL && "text-right")}>
                  <div className={cn("flex items-center gap-2 flex-wrap", isRTL && "flex-row-reverse")}>
                    <p className="font-bold text-base">{appointment.patientName}</p>
                    {patient?.bloodType && (
                      <Badge variant="outline" className="text-xs">{patient.bloodType}</Badge>
                    )}
                    {age != null && (
                      <span className="text-xs text-muted-foreground">{age}y · {patient?.gender}</span>
                    )}
                    <Badge variant="secondary" className="text-xs capitalize">{appointment.type}</Badge>
                  </div>
                  {patient?.allergies && patient.allergies !== "None" && (
                    <div className={cn("flex items-center gap-1 mt-1", isRTL && "flex-row-reverse")}>
                      <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <p className="text-xs text-amber-700 font-medium">
                        {lang === "ar" ? "حساسية:" : "Allergy:"} {patient.allergies}
                      </p>
                    </div>
                  )}
                  {patient?.medicalNotes && (
                    <p className={cn("text-xs text-muted-foreground mt-0.5", isRTL && "text-right")}>
                      {patient.medicalNotes}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Vitals */}
          <Card className="border-border">
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

          {/* Clinical notes */}
          <Card className="border-border">
            <CardHeader className="py-3 px-4">
              <CardTitle className={cn("text-sm font-semibold flex items-center gap-2", isRTL && "flex-row-reverse")}>
                <Stethoscope className="w-4 h-4 text-primary" />
                {lang === "ar" ? "الفحص السريري" : "Clinical Assessment"}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div>
                <Label className="text-xs font-medium text-muted-foreground">
                  {lang === "ar" ? "الشكوى الرئيسية" : "Chief Complaint"}
                </Label>
                <Textarea
                  className="mt-1"
                  rows={2}
                  value={chiefComplaint}
                  onChange={(e) => setChiefComplaint(e.target.value)}
                  placeholder={lang === "ar" ? "ما يشكو منه المريض..." : "Patient's presenting complaint..."}
                  disabled={isCompleted}
                />
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground">
                  {lang === "ar" ? "التشخيص" : "Diagnosis"}
                </Label>
                <Textarea
                  className="mt-1"
                  rows={2}
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  placeholder={lang === "ar" ? "التشخيص / الحالة..." : "Diagnosis / ICD codes..."}
                  disabled={isCompleted}
                />
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground">
                  {lang === "ar" ? "خطة العلاج" : "Treatment Plan"}
                </Label>
                <Textarea
                  className="mt-1"
                  rows={3}
                  value={treatmentPlan}
                  onChange={(e) => setTreatmentPlan(e.target.value)}
                  placeholder={lang === "ar" ? "الإجراءات، الأدوية، المتابعة..." : "Medications, procedures, referrals, follow-up instructions..."}
                  disabled={isCompleted}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">
                    {lang === "ar" ? "ملاحظات" : "Internal Notes"}
                  </Label>
                  <Textarea
                    className="mt-1"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={lang === "ar" ? "ملاحظات إضافية..." : "Additional notes..."}
                    disabled={isCompleted}
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">
                    {lang === "ar" ? "موعد المتابعة" : "Follow-up Date"}
                  </Label>
                  <Input
                    className="mt-1"
                    type="date"
                    value={followUpDate}
                    onChange={(e) => setFollowUpDate(e.target.value)}
                    disabled={isCompleted}
                    dir="ltr"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Medical Orders */}
          <Card className="border-border">
            <CardHeader className="py-3 px-4">
              <div className={cn("flex items-center justify-between", isRTL && "flex-row-reverse")}>
                <CardTitle className={cn("text-sm font-semibold flex items-center gap-2", isRTL && "flex-row-reverse")}>
                  <FlaskConical className="w-4 h-4 text-blue-500" />
                  {lang === "ar" ? "الطلبات الطبية" : "Medical Orders"}
                  {encounter?.orders.length ? (
                    <Badge variant="secondary" className="text-xs">{encounter.orders.length}</Badge>
                  ) : null}
                </CardTitle>
                {!isCompleted && activeEncounterId && (
                  <Button size="sm" variant="outline" onClick={() => setAddOrderOpen(true)} className="gap-1 text-xs">
                    <Plus className="w-3.5 h-3.5" />
                    {lang === "ar" ? "إضافة طلب" : "Add Order"}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {!activeEncounterId ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  {lang === "ar" ? "أنشئ السجل أولاً لإضافة الطلبات" : "Create the encounter first to add orders"}
                </p>
              ) : !encounter?.orders.length ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  {lang === "ar" ? "لا توجد طلبات بعد" : "No orders yet"}
                </p>
              ) : (
                <div className="space-y-2">
                  {encounter.orders.map((order) => {
                    const typeInfo = ORDER_TYPES.find((t) => t.value === order.type);
                    const statusCfg = ORDER_STATUS_CONFIG[order.status];
                    const priorityCfg = PRIORITY_CONFIG[order.priority as keyof typeof PRIORITY_CONFIG];
                    const Icon = typeInfo?.icon ?? Activity;
                    return (
                      <div key={order.id} className={cn("p-3 rounded-lg border border-border bg-muted/20", order.status === "completed" && "bg-emerald-50/30 border-emerald-200")}>
                        <div className={cn("flex items-start justify-between gap-2", isRTL && "flex-row-reverse")}>
                          <div className={cn("flex items-center gap-2", isRTL && "flex-row-reverse")}>
                            <div className={cn("w-7 h-7 rounded-md flex items-center justify-center shrink-0", typeInfo?.color ?? "bg-gray-50 text-gray-600")}>
                              <Icon className="w-3.5 h-3.5" />
                            </div>
                            <div className={cn(isRTL && "text-right")}>
                              <p className="text-sm font-medium">{order.name}</p>
                              <div className={cn("flex items-center gap-1.5 mt-0.5", isRTL && "flex-row-reverse")}>
                                <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1", statusCfg.color)}>
                                  {statusCfg.icon}{statusCfg.label}
                                </span>
                                <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium", priorityCfg.color)}>
                                  {priorityCfg.label}
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
                          <p className={cn("text-xs text-muted-foreground mt-2 px-1", isRTL && "text-right")}>{order.notes}</p>
                        )}
                        {order.resultData && (
                          <div className={cn("mt-2 p-2 rounded bg-emerald-50 border border-emerald-200", isRTL && "text-right")}>
                            <p className="text-xs font-semibold text-emerald-700 mb-1">
                              {lang === "ar" ? "النتيجة:" : "Result:"}
                            </p>
                            <p className="text-xs font-mono text-emerald-900 whitespace-pre-wrap">{order.resultData}</p>
                            {order.resultNotes && (
                              <p className="text-xs text-emerald-700 mt-1 italic">{order.resultNotes}</p>
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

          {/* Action buttons */}
          {!isCompleted && (
            <div className={cn("flex items-center gap-3", isRTL && "flex-row-reverse")}>
              {!activeEncounterId ? (
                <Button
                  className="flex-1"
                  onClick={() => createEncounterMutation.mutate()}
                  disabled={createEncounterMutation.isPending}
                >
                  {createEncounterMutation.isPending
                    ? (lang === "ar" ? "جارٍ الإنشاء..." : "Creating...")
                    : (lang === "ar" ? "بدء سجل المريض" : "Start Encounter")}
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={() => saveEncounterMutation.mutate()}
                    disabled={saveEncounterMutation.isPending}
                  >
                    {saveEncounterMutation.isPending ? "Saving..." : lang === "ar" ? "حفظ" : "Save"}
                  </Button>
                  <Button
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => completeEncounterMutation.mutate()}
                    disabled={completeEncounterMutation.isPending}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    {completeEncounterMutation.isPending
                      ? "Completing..."
                      : lang === "ar" ? "إنهاء السجل" : "Complete & Close"}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Right: Patient history */}
        <div className="space-y-4">
          <Card className="border-border sticky top-0">
            <CardHeader className="py-3 px-4">
              <CardTitle className={cn("text-sm font-semibold flex items-center gap-2", isRTL && "flex-row-reverse")}>
                <History className="w-4 h-4 text-violet-500" />
                {lang === "ar" ? "آخر 3 زيارات" : "Last 3 Encounters"}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {!pastEncounters?.length ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  {lang === "ar" ? "لا توجد زيارات سابقة" : "No previous encounters"}
                </p>
              ) : (
                <div className="space-y-3">
                  {pastEncounters
                    .filter((e) => e.id !== activeEncounterId)
                    .map((enc) => (
                      <div key={enc.id} className="border border-border rounded-lg p-3 space-y-2">
                        <div className={cn("flex items-center justify-between gap-1", isRTL && "flex-row-reverse")}>
                          <div className={cn("flex items-center gap-1.5", isRTL && "flex-row-reverse")}>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-xs",
                                enc.encounterType === "follow_up" ? "text-amber-700 border-amber-300" : "text-blue-700 border-blue-300"
                              )}
                            >
                              {enc.encounterType === "follow_up"
                                ? (lang === "ar" ? "متابعة" : "Follow-up")
                                : (lang === "ar" ? "أولي" : "Initial")}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(enc.createdAt), { addSuffix: true })}
                            </span>
                          </div>
                          <Badge
                            variant="secondary"
                            className={cn("text-xs", enc.status === "completed" ? "text-emerald-700" : "text-amber-700")}
                          >
                            {enc.status === "completed" ? (lang === "ar" ? "مكتمل" : "Done") : (lang === "ar" ? "جارٍ" : "Open")}
                          </Badge>
                        </div>
                        {enc.doctorName && (
                          <p className={cn("text-xs text-muted-foreground", isRTL && "text-right")}>
                            <Stethoscope className="w-3 h-3 inline mr-1" />{enc.doctorName}
                          </p>
                        )}
                        {enc.chiefComplaint && (
                          <div className={cn(isRTL && "text-right")}>
                            <p className="text-xs font-semibold text-muted-foreground">
                              {lang === "ar" ? "الشكوى:" : "Complaint:"}
                            </p>
                            <p className="text-xs truncate">{enc.chiefComplaint}</p>
                          </div>
                        )}
                        {enc.diagnosis && (
                          <div className="p-2 bg-blue-50 rounded text-xs">
                            <span className="font-semibold text-blue-700">{lang === "ar" ? "تشخيص: " : "Dx: "}</span>
                            <span className="text-blue-800">{enc.diagnosis}</span>
                          </div>
                        )}
                        {enc.orders.length > 0 && (
                          <div className={cn("flex items-center gap-1 flex-wrap", isRTL && "flex-row-reverse")}>
                            {enc.orders.map((o) => {
                              const info = ORDER_TYPES.find((t) => t.value === o.type);
                              const Icon = info?.icon ?? Activity;
                              return (
                                <span key={o.id} className={cn("text-xs px-1.5 py-0.5 rounded flex items-center gap-1", info?.color ?? "bg-gray-50 text-gray-600")}>
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

      {activeEncounterId && (
        <AddOrderDialog
          consultationId={activeEncounterId}
          open={addOrderOpen}
          onClose={() => setAddOrderOpen(false)}
        />
      )}
      <ResultDialog order={resultOrder} onClose={() => setResultOrder(null)} />
    </div>
  );
}
