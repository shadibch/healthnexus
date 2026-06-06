import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  BarChart2,
  Search,
  FlaskConical,
  Scan,
  Radiation,
  Heart,
  Waves,
  Activity,
  User,
  AlertCircle,
  CheckCircle2,
  Clock,
  Stethoscope,
  Pill,
  FileText,
  CalendarDays,
  TrendingUp,
  ArrowUpRight,
  X,
  Users,
  Package,
  CornerDownRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, format } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OverviewData {
  thisMonth: { consultations: number; completed: number; completionRate: number };
  lastMonth: { consultations: number };
  thisWeek: { consultations: number };
  allTime: { consultations: number };
  orders: { total: number; pending: number; completed: number; byType: { name: string; nameAr: string; count: number }[] };
  prescriptions: { total: number; pending: number; dispensed: number };
  byEncounterType: { name: string; nameAr: string; count: number }[];
}

interface PatientSummary {
  id: number;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  gender: string | null;
  bloodType: string | null;
  allergies: string | null;
  medicalNotes: string | null;
  phone: string | null;
  lastVisit: string | null;
  visitCount: number;
  pendingRx: number;
}

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
  patientName: string | null;
  patientId: number | null;
  diagnosis: string | null;
}

interface PrescriptionItem {
  id: number;
  medicationName: string | null;
  dosage: string;
  frequency: string;
  duration: string;
  quantity: number;
}

interface Prescription {
  id: number;
  patientId: number;
  patientName: string | null;
  status: string;
  issuedAt: string;
  dispensedAt: string | null;
  items: PrescriptionItem[];
}

interface Consultation {
  id: number;
  patientId: number;
  patientName: string | null;
  encounterType: string;
  chiefComplaint: string | null;
  diagnosis: string | null;
  treatmentPlan: string | null;
  vitals: string | null;
  status: string;
  createdAt: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ORDER_TYPES = [
  { value: "all",       label: "All",       labelAr: "الكل",        icon: Activity,     color: "text-gray-600" },
  { value: "lab",       label: "Lab",       labelAr: "تحاليل",      icon: FlaskConical, color: "text-blue-600" },
  { value: "xray",      label: "X-Ray",     labelAr: "أشعة",        icon: Radiation,    color: "text-amber-600" },
  { value: "ct",        label: "CT",        labelAr: "مقطعية",      icon: Scan,         color: "text-purple-600" },
  { value: "mri",       label: "MRI",       labelAr: "رنين",        icon: Scan,         color: "text-indigo-600" },
  { value: "ultrasound",label: "Ultrasound",labelAr: "موجات",       icon: Waves,        color: "text-teal-600" },
  { value: "ecg",       label: "ECG",       labelAr: "تخطيط قلب",  icon: Heart,        color: "text-red-600" },
  { value: "other",     label: "Other",     labelAr: "أخرى",        icon: Activity,     color: "text-gray-600" },
];

const ORDER_STATUSES = [
  { value: "all",        label: "All",         labelAr: "الكل",       color: "" },
  { value: "ordered",    label: "Ordered",     labelAr: "مطلوب",      color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "in_progress",label: "In Progress", labelAr: "جارٍ",       color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "completed",  label: "Completed",   labelAr: "مكتمل",      color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "cancelled",  label: "Cancelled",   labelAr: "ملغى",       color: "bg-gray-100 text-gray-500 border-gray-200" },
];

const PRIORITY_COLORS: Record<string, string> = {
  stat:    "bg-red-100 text-red-700 border-red-200",
  urgent:  "bg-amber-100 text-amber-700 border-amber-200",
  routine: "bg-gray-100 text-gray-600 border-gray-200",
};

const BAR_COLORS = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4", "#64748b"];

// ── Helper ────────────────────────────────────────────────────────────────────

function age(dob: string | null): number | null {
  if (!dob) return null;
  return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000));
}

function KpiCard({
  label, value, sub, icon: Icon, accent,
}: { label: string; value: string | number; sub?: string; icon: React.ComponentType<{ className?: string }>; accent: string }) {
  return (
    <Card className="border border-border">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            <p className={cn("text-2xl font-bold mt-1", accent)}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", accent.replace("text-", "bg-").replace("-700", "-100").replace("-600", "-100"))}>
            <Icon className={cn("w-4.5 h-4.5", accent)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ data, lang, isRTL }: { data: OverviewData; lang: string; isRTL: boolean }) {
  const kpis = [
    {
      label: lang === "ar" ? "استشارات الشهر" : "Consultations This Month",
      value: data.thisMonth.consultations,
      sub: lang === "ar"
        ? `${data.lastMonth.consultations} الشهر الماضي`
        : `${data.lastMonth.consultations} last month`,
      icon: Stethoscope,
      accent: "text-emerald-600",
    },
    {
      label: lang === "ar" ? "نسبة الإتمام" : "Completion Rate",
      value: `${data.thisMonth.completionRate}%`,
      sub: lang === "ar" ? "هذا الشهر" : "This month",
      icon: CheckCircle2,
      accent: data.thisMonth.completionRate >= 80 ? "text-emerald-600" : "text-amber-600",
    },
    {
      label: lang === "ar" ? "طلبات معلقة" : "Pending Orders",
      value: data.orders.pending,
      sub: lang === "ar" ? `${data.orders.total} إجمالي` : `${data.orders.total} total`,
      icon: FlaskConical,
      accent: data.orders.pending > 0 ? "text-amber-600" : "text-emerald-600",
    },
    {
      label: lang === "ar" ? "وصفات معلقة" : "Pending Prescriptions",
      value: data.prescriptions.pending,
      sub: lang === "ar"
        ? `${data.prescriptions.dispensed} صرفت`
        : `${data.prescriptions.dispensed} dispensed`,
      icon: Pill,
      accent: data.prescriptions.pending > 0 ? "text-blue-600" : "text-emerald-600",
    },
  ];

  const encounterChartData = data.byEncounterType.map((e) => ({
    name: lang === "ar" ? e.nameAr : e.name,
    count: e.count,
  }));

  const orderChartData = data.orders.byType.map((o) => ({
    name: lang === "ar" ? o.nameAr : o.name,
    count: o.count,
  }));

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => <KpiCard key={k.label} {...k} />)}
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Encounter types */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-emerald-500" />
              {lang === "ar" ? "توزيع الاستشارات هذا الشهر" : "Encounter Types This Month"}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {encounterChartData.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">
                {lang === "ar" ? "لا توجد بيانات" : "No data yet"}
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={encounterChartData} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={72} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    formatter={(v: number) => [v, lang === "ar" ? "استشارات" : "Encounters"]}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {encounterChartData.map((_, i) => (
                      <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Orders by type */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-blue-500" />
              {lang === "ar" ? "الطلبات حسب النوع" : "Orders by Type"}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {orderChartData.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">
                {lang === "ar" ? "لا توجد طلبات" : "No orders yet"}
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={orderChartData} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={72} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    formatter={(v: number) => [v, lang === "ar" ? "طلبات" : "Orders"]}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {orderChartData.map((_, i) => (
                      <Cell key={i} fill={BAR_COLORS[(i + 2) % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Summary stat strip */}
      <Card>
        <CardContent className="px-4 py-3">
          <div className="grid grid-cols-3 divide-x divide-border text-center gap-0">
            {[
              { label: lang === "ar" ? "هذا الأسبوع" : "This Week",  value: data.thisWeek.consultations },
              { label: lang === "ar" ? "هذا الشهر" : "This Month",   value: data.thisMonth.consultations },
              { label: lang === "ar" ? "الإجمالي" : "All Time",      value: data.allTime.consultations },
            ].map((s) => (
              <div key={s.label} className="px-4 py-1">
                <p className="text-lg font-bold text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Patient Summary Tab ───────────────────────────────────────────────────────

function PatientSummaryTab({ patients, search, lang, isRTL, onNavigate }: {
  patients: PatientSummary[];
  search: string;
  lang: string;
  isRTL: boolean;
  onNavigate: (path: string) => void;
}) {
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return patients.filter((p) =>
      !q || `${p.firstName} ${p.lastName}`.toLowerCase().includes(q)
    );
  }, [patients, search]);

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground px-1">
        {filtered.length} {lang === "ar" ? "مريض" : "patient(s)"}
      </p>
      {filtered.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {lang === "ar" ? "لا توجد بيانات" : "No patient records found"}
            </p>
          </CardContent>
        </Card>
      )}
      {filtered.map((p) => {
        const patientAge = age(p.dateOfBirth);
        const hasAllergy = p.allergies && p.allergies.toLowerCase() !== "none" && p.allergies.trim();
        return (
          <Card
            key={p.id}
            className="border border-border hover:border-primary/30 hover:bg-muted/20 transition-colors cursor-pointer"
            onClick={() => onNavigate(`/patients?id=${p.id}`)}
          >
            <CardContent className="p-3">
              <div className={cn("flex items-center gap-3", isRTL && "flex-row-reverse")}>
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-primary" />
                </div>
                <div className={cn("flex-1 min-w-0", isRTL && "text-right")}>
                  <div className={cn("flex items-center gap-2 flex-wrap", isRTL && "flex-row-reverse")}>
                    <p className="font-semibold text-sm">{p.firstName} {p.lastName}</p>
                    {p.bloodType && (
                      <Badge variant="outline" className="text-xs px-1.5 py-0">{p.bloodType}</Badge>
                    )}
                    {patientAge != null && (
                      <span className="text-xs text-muted-foreground">{patientAge}y · {p.gender}</span>
                    )}
                  </div>
                  <div className={cn("flex items-center gap-3 mt-0.5 flex-wrap", isRTL && "flex-row-reverse")}>
                    {hasAllergy && (
                      <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                        <AlertCircle className="w-3 h-3" />
                        {p.allergies}
                      </span>
                    )}
                    {p.lastVisit && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <CalendarDays className="w-3 h-3" />
                        {lang === "ar" ? "آخر زيارة:" : "Last:"} {formatDistanceToNow(new Date(p.lastVisit), { addSuffix: true })}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {p.visitCount} {lang === "ar" ? "زيارة" : "visit(s)"}
                    </span>
                    {p.pendingRx > 0 && (
                      <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200 px-1.5 py-0">
                        {p.pendingRx} {lang === "ar" ? "وصفة معلقة" : "pending Rx"}
                      </Badge>
                    )}
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ── Lab & Imaging Tab ─────────────────────────────────────────────────────────

function LabImagingTab({ orders, search, typeFilter, statusFilter, lang, isRTL }: {
  orders: MedicalOrder[];
  search: string;
  typeFilter: string;
  statusFilter: string;
  lang: string;
  isRTL: boolean;
}) {
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return orders.filter((o) => {
      if (typeFilter !== "all" && o.type !== typeFilter) return false;
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (q && !o.name.toLowerCase().includes(q) && !(o.patientName ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [orders, search, typeFilter, statusFilter]);

  const typeMap = Object.fromEntries(ORDER_TYPES.map((t) => [t.value, t]));
  const statusMap = Object.fromEntries(ORDER_STATUSES.map((s) => [s.value, s]));

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground px-1">
        {filtered.length} {lang === "ar" ? "نتيجة" : "result(s)"}
      </p>
      {filtered.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <FlaskConical className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {lang === "ar" ? "لا توجد طلبات" : "No orders found"}
            </p>
          </CardContent>
        </Card>
      )}
      {filtered.map((o) => {
        const typeInfo = typeMap[o.type] ?? typeMap["other"];
        const statusInfo = statusMap[o.status];
        const Icon = typeInfo.icon;
        const isCompleted = o.status === "completed";
        const hasCritical = (o.resultData ?? "").toLowerCase().match(/critical|abnormal|positive|urgent|high|low/);
        return (
          <Card key={o.id} className={cn("border", hasCritical && isCompleted && "border-red-200 bg-red-50/30 dark:border-red-900 dark:bg-red-950/20")}>
            <CardContent className="p-3">
              <div className={cn("flex items-start gap-3", isRTL && "flex-row-reverse")}>
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                  typeInfo.color.replace("text-", "bg-").replace("-600", "-100")
                )}>
                  <Icon className={cn("w-4 h-4", typeInfo.color)} />
                </div>
                <div className={cn("flex-1 min-w-0", isRTL && "text-right")}>
                  <div className={cn("flex items-center gap-2 flex-wrap", isRTL && "flex-row-reverse")}>
                    <span className="font-semibold text-sm">{o.name}</span>
                    <Badge variant="outline" className={cn("text-xs px-1.5 py-0 capitalize border", PRIORITY_COLORS[o.priority])}>
                      {o.priority}
                    </Badge>
                    {statusInfo && (
                      <Badge variant="outline" className={cn("text-xs px-1.5 py-0 border capitalize", statusInfo.color)}>
                        {lang === "ar" ? statusInfo.labelAr : statusInfo.label}
                      </Badge>
                    )}
                    {hasCritical && isCompleted && (
                      <Badge className="text-xs bg-red-100 text-red-700 border-red-300 border px-1.5 py-0">
                        <AlertCircle className="w-2.5 h-2.5 mr-0.5" />
                        {lang === "ar" ? "نتيجة بارزة" : "Notable result"}
                      </Badge>
                    )}
                  </div>
                  <div className={cn("flex items-center gap-3 mt-0.5 flex-wrap text-xs text-muted-foreground", isRTL && "flex-row-reverse")}>
                    {o.patientName && (
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {o.patientName}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <CalendarDays className="w-3 h-3" />
                      {format(new Date(o.orderedAt), "dd MMM yyyy")}
                    </span>
                    {o.completedAt && (
                      <span className="text-emerald-600">
                        {lang === "ar" ? "أُنجز" : "Done"} {formatDistanceToNow(new Date(o.completedAt), { addSuffix: true })}
                      </span>
                    )}
                  </div>
                  {isCompleted && o.resultData && (
                    <div className={cn(
                      "mt-1.5 rounded-md px-2.5 py-1.5 text-xs border",
                      hasCritical
                        ? "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300"
                        : "bg-muted/40 border-border text-foreground"
                    )}>
                      <span className="font-medium mr-1">{lang === "ar" ? "النتيجة:" : "Result:"}</span>
                      {o.resultData}
                    </div>
                  )}
                  {isCompleted && o.resultNotes && (
                    <p className="mt-1 text-xs text-muted-foreground italic">{o.resultNotes}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ── Medications Tab ───────────────────────────────────────────────────────────

function MedicationsTab({ prescriptions, search, lang, isRTL }: {
  prescriptions: Prescription[];
  search: string;
  lang: string;
  isRTL: boolean;
}) {
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return prescriptions.filter((p) =>
      !q ||
      (p.patientName ?? "").toLowerCase().includes(q) ||
      p.items.some((i) => (i.medicationName ?? "").toLowerCase().includes(q))
    );
  }, [prescriptions, search]);

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground px-1">
        {filtered.length} {lang === "ar" ? "وصفة" : "prescription(s)"}
      </p>
      {filtered.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Pill className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {lang === "ar" ? "لا توجد وصفات" : "No prescriptions found"}
            </p>
          </CardContent>
        </Card>
      )}
      {filtered.map((rx) => (
        <Card key={rx.id} className="border border-border">
          <CardContent className="p-3">
            <div className={cn("flex items-start gap-3", isRTL && "flex-row-reverse")}>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 mt-0.5">
                <Pill className="w-4 h-4 text-emerald-600" />
              </div>
              <div className={cn("flex-1 min-w-0", isRTL && "text-right")}>
                <div className={cn("flex items-center gap-2 flex-wrap", isRTL && "flex-row-reverse")}>
                  <span className="font-semibold text-sm">
                    {rx.patientName ?? (lang === "ar" ? "مريض غير معروف" : "Unknown patient")}
                  </span>
                  <Badge variant="outline" className={cn(
                    "text-xs px-1.5 py-0 border capitalize",
                    rx.status === "dispensed"
                      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                      : "bg-amber-100 text-amber-700 border-amber-200"
                  )}>
                    {rx.status === "dispensed" ? (lang === "ar" ? "صُرفت" : "Dispensed") : (lang === "ar" ? "معلقة" : "Pending")}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(rx.issuedAt), "dd MMM yyyy")}
                  </span>
                </div>
                <div className="mt-1.5 space-y-1">
                  {rx.items.map((item) => (
                    <div key={item.id} className={cn("flex items-start gap-1.5 text-xs", isRTL && "flex-row-reverse")}>
                      <span className="text-primary shrink-0">•</span>
                      <span>
                        <span className="font-medium">{item.medicationName ?? "?"}</span>
                        <span className="text-muted-foreground ml-1.5">
                          {item.dosage} · {item.frequency} · {item.duration} · qty {item.quantity}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Encounter Notes Tab ───────────────────────────────────────────────────────

function EncountersTab({ consultations, search, lang, isRTL, onNavigate }: {
  consultations: Consultation[];
  search: string;
  lang: string;
  isRTL: boolean;
  onNavigate: (path: string) => void;
}) {
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return consultations.filter((c) =>
      !q ||
      (c.patientName ?? "").toLowerCase().includes(q) ||
      (c.chiefComplaint ?? "").toLowerCase().includes(q) ||
      (c.diagnosis ?? "").toLowerCase().includes(q)
    );
  }, [consultations, search]);

  const TYPE_BADGE: Record<string, { label: string; labelAr: string; color: string }> = {
    initial:   { label: "Initial",   labelAr: "أول زيارة", color: "bg-blue-100 text-blue-700 border-blue-200" },
    follow_up: { label: "Follow-up", labelAr: "متابعة",    color: "bg-amber-100 text-amber-700 border-amber-200" },
    emergency: { label: "Emergency", labelAr: "طوارئ",     color: "bg-red-100 text-red-700 border-red-200" },
  };
  const STATUS_BADGE: Record<string, string> = {
    completed:   "bg-emerald-100 text-emerald-700 border-emerald-200",
    in_progress: "bg-amber-100 text-amber-700 border-amber-200",
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground px-1">
        {filtered.length} {lang === "ar" ? "سجل" : "record(s)"}
      </p>
      {filtered.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Stethoscope className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {lang === "ar" ? "لا توجد سجلات" : "No encounter records found"}
            </p>
          </CardContent>
        </Card>
      )}
      {filtered.map((c) => {
        const type = TYPE_BADGE[c.encounterType] ?? TYPE_BADGE["initial"];
        return (
          <Card key={c.id} className="border border-border hover:border-primary/30 hover:bg-muted/20 transition-colors">
            <CardContent className="p-3">
              <div className={cn("flex items-start gap-3", isRTL && "flex-row-reverse")}>
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Stethoscope className="w-4 h-4 text-primary" />
                </div>
                <div className={cn("flex-1 min-w-0", isRTL && "text-right")}>
                  <div className={cn("flex items-center gap-2 flex-wrap", isRTL && "flex-row-reverse")}>
                    <span className="font-semibold text-sm">
                      {c.patientName ?? (lang === "ar" ? "مريض" : "Patient")}
                    </span>
                    {c.encounterType === "follow_up" && (
                      <CornerDownRight className="w-3 h-3 text-amber-500" />
                    )}
                    <Badge variant="outline" className={cn("text-xs px-1.5 py-0 border", type.color)}>
                      {lang === "ar" ? type.labelAr : type.label}
                    </Badge>
                    <Badge variant="outline" className={cn("text-xs px-1.5 py-0 border capitalize", STATUS_BADGE[c.status])}>
                      {c.status === "completed" ? (lang === "ar" ? "مكتمل" : "Completed") : (lang === "ar" ? "جارٍ" : "In Progress")}
                    </Badge>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {format(new Date(c.createdAt), "dd MMM yyyy")}
                    </span>
                  </div>
                  {c.chiefComplaint && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      <span className="font-medium text-foreground">{lang === "ar" ? "الشكوى:" : "CC:"}</span>
                      {" "}{c.chiefComplaint}
                    </p>
                  )}
                  {c.diagnosis && (
                    <p className="text-xs text-foreground mt-0.5 line-clamp-1">
                      <span className="font-medium">{lang === "ar" ? "التشخيص:" : "Dx:"}</span>
                      {" "}{c.diagnosis}
                    </p>
                  )}
                  {c.vitals && (
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono line-clamp-1">{c.vitals}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: "overview",    label: "Overview",        labelAr: "نظرة عامة",       icon: TrendingUp   },
  { id: "patients",    label: "Patient Summary",  labelAr: "ملخص المرضى",     icon: Users        },
  { id: "orders",      label: "Lab & Imaging",    labelAr: "المختبر والتصوير", icon: FlaskConical },
  { id: "medications", label: "Medications",      labelAr: "الأدوية",          icon: Pill         },
  { id: "encounters",  label: "Encounter Notes",  labelAr: "سجلات المرضى",    icon: Stethoscope  },
];

export default function ReportsPage() {
  const { lang, isRTL } = useI18n();
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const [tab, setTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [orderTypeFilter, setOrderTypeFilter] = useState("all");
  const [orderStatusFilter, setOrderStatusFilter] = useState("all");

  const { data: overview, isLoading: loadingOverview } = useQuery<OverviewData>({
    queryKey: ["reports-overview"],
    queryFn: () => apiFetch("/reports/overview"),
    enabled: user?.role === "doctor",
  });

  const { data: patients = [], isLoading: loadingPatients } = useQuery<PatientSummary[]>({
    queryKey: ["reports-patients"],
    queryFn: () => apiFetch("/reports/patient-summary"),
    enabled: tab === "patients" && user?.role === "doctor",
  });

  const { data: orders = [], isLoading: loadingOrders } = useQuery<MedicalOrder[]>({
    queryKey: ["reports-orders"],
    queryFn: () => apiFetch("/reports/orders"),
    enabled: tab === "orders" && user?.role === "doctor",
  });

  const { data: prescriptions = [], isLoading: loadingRx } = useQuery<Prescription[]>({
    queryKey: ["prescriptions"],
    queryFn: () => apiFetch("/prescriptions"),
    enabled: tab === "medications" && user?.role === "doctor",
  });

  const { data: consultations = [], isLoading: loadingConsults } = useQuery<Consultation[]>({
    queryKey: ["consultations"],
    queryFn: () => apiFetch("/consultations"),
    enabled: tab === "encounters" && user?.role === "doctor",
  });

  const isTabLoading =
    (tab === "overview"    && loadingOverview) ||
    (tab === "patients"    && loadingPatients) ||
    (tab === "orders"      && loadingOrders) ||
    (tab === "medications" && loadingRx) ||
    (tab === "encounters"  && loadingConsults);

  if (user?.role !== "doctor") {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">
          {lang === "ar" ? "هذه الصفحة للأطباء فقط" : "This page is only available to doctors"}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4 max-w-5xl", isRTL && "font-arabic")} dir={isRTL ? "rtl" : "ltr"}>
      {/* Header */}
      <div className={cn("flex items-start justify-between gap-4", isRTL && "flex-row-reverse")}>
        <div className={cn(isRTL && "text-right")}>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-primary" />
            {lang === "ar" ? "مركز التقارير الطبية" : "Doctor Hub Reports"}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {lang === "ar"
              ? "بيانات سريرية عالية الدقة — آخر تحديث الآن"
              : "High-signal clinical data — live from the EHR"}
          </p>
        </div>

        {/* Global search */}
        <div className="relative w-56 shrink-0">
          <Search className={cn(
            "absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none",
            isRTL ? "right-2.5" : "left-2.5"
          )} />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={lang === "ar" ? "بحث..." : "Search..."}
            className={cn("h-8 text-sm", isRTL ? "pr-7 pl-7" : "pl-7 pr-7")}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className={cn(
                "absolute top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground",
                isRTL ? "left-2.5" : "right-2.5"
              )}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b border-border overflow-x-auto">
        <nav className={cn("flex gap-0", isRTL && "flex-row-reverse")}>
          {TABS.map(({ id, label, labelAr, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
                tab === id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {lang === "ar" ? labelAr : label}
            </button>
          ))}
        </nav>
      </div>

      {/* Order type / status filters — only visible on orders tab */}
      {tab === "orders" && (
        <div className="space-y-2">
          {/* Type pills */}
          <div className={cn("flex gap-1.5 flex-wrap", isRTL && "flex-row-reverse")}>
            {ORDER_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setOrderTypeFilter(t.value)}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                  orderTypeFilter === t.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-primary/40"
                )}
              >
                <t.icon className="w-3 h-3" />
                {lang === "ar" ? t.labelAr : t.label}
              </button>
            ))}
          </div>
          {/* Status pills */}
          <div className={cn("flex gap-1.5 flex-wrap", isRTL && "flex-row-reverse")}>
            {ORDER_STATUSES.map((s) => (
              <button
                key={s.value}
                onClick={() => setOrderStatusFilter(s.value)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                  orderStatusFilter === s.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-primary/40"
                )}
              >
                {lang === "ar" ? s.labelAr : s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tab content */}
      {isTabLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : (
        <>
          {tab === "overview" && overview && (
            <OverviewTab data={overview} lang={lang} isRTL={isRTL} />
          )}
          {tab === "overview" && !overview && !loadingOverview && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground text-sm">
                {lang === "ar" ? "لا توجد بيانات" : "No data available"}
              </CardContent>
            </Card>
          )}
          {tab === "patients" && (
            <PatientSummaryTab
              patients={patients}
              search={search}
              lang={lang}
              isRTL={isRTL}
              onNavigate={navigate}
            />
          )}
          {tab === "orders" && (
            <LabImagingTab
              orders={orders}
              search={search}
              typeFilter={orderTypeFilter}
              statusFilter={orderStatusFilter}
              lang={lang}
              isRTL={isRTL}
            />
          )}
          {tab === "medications" && (
            <MedicationsTab
              prescriptions={prescriptions}
              search={search}
              lang={lang}
              isRTL={isRTL}
            />
          )}
          {tab === "encounters" && (
            <EncountersTab
              consultations={consultations}
              search={search}
              lang={lang}
              isRTL={isRTL}
              onNavigate={navigate}
            />
          )}
        </>
      )}
    </div>
  );
}
