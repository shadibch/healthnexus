import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useRole } from "@/lib/role";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  X,
  User,
  Stethoscope,
  Activity,
  FlaskConical,
  Scan,
  Radiation,
  Heart,
  Waves,
  Clock,
  CheckCircle2,
  CornerDownRight,
  ArrowUpRight,
  FileSearch,
  ChevronRight,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface MedicalOrder {
  id: number;
  type: string;
  name: string;
  priority: string;
  status: string;
}

interface Consultation {
  id: number;
  appointmentId: number | null;
  patientId: number;
  patientName: string | null;
  doctorName: string | null;
  encounterType: string;
  parentConsultationId: number | null;
  chiefComplaint: string | null;
  diagnosis: string | null;
  treatmentPlan: string | null;
  followUpDate: string | null;
  status: string;
  createdAt: string;
  orders?: MedicalOrder[];
}

const ORDER_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  lab: FlaskConical, xray: Radiation, ct: Scan, mri: Scan,
  ultrasound: Waves, ecg: Heart, other: Activity,
};

const ORDER_COLORS: Record<string, string> = {
  lab:        "text-blue-600 bg-blue-50",
  xray:       "text-amber-600 bg-amber-50",
  ct:         "text-purple-600 bg-purple-50",
  mri:        "text-indigo-600 bg-indigo-50",
  ultrasound: "text-teal-600 bg-teal-50",
  ecg:        "text-red-600 bg-red-50",
  other:      "text-gray-600 bg-gray-50",
};

const ENCOUNTER_TYPE: Record<string, { en: string; ar: string; color: string }> = {
  initial:   { en: "Initial",   ar: "أولي",   color: "text-blue-700 border-blue-300" },
  follow_up: { en: "Follow-up", ar: "متابعة", color: "text-amber-700 border-amber-300" },
  emergency: { en: "Emergency", ar: "طارئ",   color: "text-red-700 border-red-300" },
};

const STATUS_COLOR: Record<string, string> = {
  in_progress: "bg-amber-100 text-amber-800 border-amber-300",
  completed:   "bg-emerald-100 text-emerald-800 border-emerald-300",
  pending:     "bg-blue-100 text-blue-800 border-blue-300",
};

function EncounterCard({ c, lang, isRTL, navigate }: {
  c: Consultation;
  lang: string;
  isRTL: boolean;
  navigate: (to: string) => void;
}) {
  const ar = lang === "ar";
  const typeCfg = ENCOUNTER_TYPE[c.encounterType] ?? ENCOUNTER_TYPE.initial;

  return (
    <Card className={cn(
      "border-border transition-all hover:shadow-sm",
      c.encounterType === "follow_up" && "border-l-4 border-l-amber-400",
      c.encounterType === "emergency" && "border-l-4 border-l-red-400",
    )}>
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className={cn("flex items-center justify-between gap-2 flex-wrap", isRTL && "flex-row-reverse")}>
          <div className={cn("flex items-center gap-2 flex-wrap", isRTL && "flex-row-reverse")}>
            {c.encounterType === "follow_up" && (
              <CornerDownRight className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            )}
            <span className="text-xs text-muted-foreground font-mono">#{c.id}</span>
            <Badge variant="outline" className={cn("text-xs", typeCfg.color)}>
              {ar ? typeCfg.ar : typeCfg.en}
            </Badge>
            <Badge variant="outline" className={cn("text-xs", STATUS_COLOR[c.status] ?? "")}>
              {c.status === "in_progress" ? (ar ? "قيد التنفيذ" : "In Progress")
                : c.status === "completed" ? (ar ? "مكتمل" : "Completed")
                : (ar ? "معلق" : "Pending")}
            </Badge>
            {c.parentConsultationId && (
              <span className="text-xs text-muted-foreground">↳ #{c.parentConsultationId}</span>
            )}
          </div>
          <div className={cn("flex items-center gap-2 shrink-0", isRTL && "flex-row-reverse")}>
            <span className="text-xs text-muted-foreground">
              {format(new Date(c.createdAt), "d MMM yyyy")}
            </span>
            <span className="text-xs text-muted-foreground/60">
              ({formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })})
            </span>
            {c.appointmentId && (
              <Button
                size="sm"
                variant={c.status === "in_progress" ? "default" : "outline"}
                onClick={() => navigate(`/encounter/${c.appointmentId}`)}
                className="gap-1 text-xs h-7 px-2"
              >
                <ArrowUpRight className="w-3 h-3" />
                {c.status === "in_progress" ? (ar ? "فتح" : "Open") : (ar ? "عرض" : "View")}
              </Button>
            )}
          </div>
        </div>

        {/* Clinical content */}
        <div className="space-y-2">
          {c.chiefComplaint && (
            <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-100">
              <p className={cn("text-xs font-semibold text-blue-700 mb-0.5", isRTL && "text-right")}>
                {ar ? "الشكوى الرئيسية" : "Chief Complaint"}
              </p>
              <p className={cn("text-sm text-blue-800", isRTL && "text-right")}>{c.chiefComplaint}</p>
            </div>
          )}
          {c.diagnosis && (
            <div className="p-2.5 rounded-lg bg-muted/40">
              <p className={cn("text-xs font-semibold text-muted-foreground mb-0.5", isRTL && "text-right")}>
                {ar ? "التشخيص" : "Diagnosis"}
              </p>
              <p className={cn("text-sm", isRTL && "text-right")}>{c.diagnosis}</p>
            </div>
          )}
          {c.treatmentPlan && (
            <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-100">
              <p className={cn("text-xs font-semibold text-emerald-700 mb-0.5", isRTL && "text-right")}>
                {ar ? "خطة العلاج" : "Treatment Plan"}
              </p>
              <p className={cn("text-sm text-emerald-800", isRTL && "text-right")}>{c.treatmentPlan}</p>
            </div>
          )}
          {c.followUpDate && (
            <p className={cn("text-xs text-muted-foreground flex items-center gap-1", isRTL && "flex-row-reverse")}>
              <Clock className="w-3 h-3" />
              {ar ? "موعد المتابعة:" : "Follow-up:"} {c.followUpDate}
            </p>
          )}
        </div>

        {/* Orders */}
        {c.orders && c.orders.length > 0 && (
          <div className="pt-2 border-t border-border">
            <p className={cn("text-xs font-semibold text-muted-foreground mb-1.5", isRTL && "text-right")}>
              {ar ? "الطلبات الطبية" : "Medical Orders"} ({c.orders.length})
            </p>
            <div className={cn("flex flex-wrap gap-1.5", isRTL && "flex-row-reverse")}>
              {c.orders.map((order) => {
                const Icon = ORDER_ICONS[order.type] ?? Activity;
                const isDone = order.status === "completed";
                return (
                  <span
                    key={order.id}
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border",
                      isDone
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : cn(ORDER_COLORS[order.type] ?? ORDER_COLORS.other, "border-transparent"),
                    )}
                  >
                    {isDone ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <Icon className="w-3 h-3" />}
                    {order.name}
                    {order.priority === "stat"   && <span className="text-red-600 font-bold ml-0.5">!</span>}
                    {order.priority === "urgent" && <span className="text-amber-600 font-bold ml-0.5">↑</span>}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SearchEncountersPage() {
  const { lang, isRTL } = useI18n();
  const { hasRole } = useRole();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const ar = lang === "ar";

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const { data: consultations, isLoading } = useQuery<Consultation[]>({
    queryKey: ["consultations-search"],
    queryFn: () => apiFetch("/consultations?limit=500"),
    refetchInterval: 30000,
  });

  if (!hasRole("doctor")) {
    return (
      <div className="text-center py-16">
        <FileSearch className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">
          {ar ? "هذه الصفحة للأطباء فقط" : "This page is only available to doctors"}
        </p>
      </div>
    );
  }

  const q = search.trim().toLowerCase();

  // Filter by search term
  const filtered = consultations?.filter((c) => {
    if (!q) return true;
    return (
      c.patientName?.toLowerCase().includes(q) ||
      c.chiefComplaint?.toLowerCase().includes(q) ||
      c.diagnosis?.toLowerCase().includes(q) ||
      c.treatmentPlan?.toLowerCase().includes(q) ||
      String(c.id).includes(q)
    );
  }) ?? [];

  // Group by patient when searching
  const grouped = new Map<number, { name: string; encounters: Consultation[] }>();
  for (const c of filtered) {
    if (!grouped.has(c.patientId)) {
      grouped.set(c.patientId, { name: c.patientName ?? `Patient #${c.patientId}`, encounters: [] });
    }
    grouped.get(c.patientId)!.encounters.push(c);
  }

  const groups = [...grouped.values()].sort((a, b) => {
    const aLast = new Date(a.encounters[0].createdAt).getTime();
    const bLast = new Date(b.encounters[0].createdAt).getTime();
    return bLast - aLast;
  });

  const totalCount = filtered.length;
  const patientCount = groups.length;

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Header */}
      <div className={cn(isRTL && "text-right")}>
        <h1 className={cn("text-xl font-bold flex items-center gap-2", isRTL && "flex-row-reverse")}>
          <FileSearch className="w-5 h-5 text-primary" />
          {ar ? "بحث في السجلات" : "Search Encounters"}
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {ar
            ? "ابحث في جميع سجلاتك الطبية بالاسم أو التشخيص أو الشكوى"
            : "Search through all your encounter records by patient name, diagnosis, or complaint"}
        </p>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className={cn(
          "absolute top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none",
          isRTL ? "right-3" : "left-3",
        )} />
        <Input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={ar
            ? "ابحث باسم المريض، التشخيص، الشكوى…"
            : "Search by patient name, diagnosis, complaint…"}
          className={cn("h-11 text-base font-medium shadow-sm", isRTL ? "pr-10 pl-10 text-right" : "pl-10 pr-10")}
          dir={isRTL ? "rtl" : "ltr"}
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className={cn(
              "absolute top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground",
              isRTL ? "left-3" : "right-3",
            )}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Results summary */}
      {!isLoading && consultations && (
        <p className={cn("text-xs text-muted-foreground", isRTL && "text-right")}>
          {q ? (
            totalCount === 0
              ? (ar ? "لا نتائج" : "No results")
              : ar
                ? `${totalCount} سجل لـ ${patientCount} مريض`
                : `${totalCount} encounter${totalCount !== 1 ? "s" : ""} across ${patientCount} patient${patientCount !== 1 ? "s" : ""}`
          ) : (
            ar
              ? `${consultations.length} سجل إجمالي`
              : `${consultations.length} total encounter${consultations.length !== 1 ? "s" : ""}`
          )}
        </p>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      )}

      {/* Empty search prompt */}
      {!isLoading && !q && consultations?.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <FileSearch className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {ar ? "لا توجد سجلات بعد" : "No encounters recorded yet"}
            </p>
          </CardContent>
        </Card>
      )}

      {/* No results */}
      {!isLoading && q && totalCount === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Search className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium">{ar ? "لا نتائج لـ" : "No results for"} &ldquo;{search}&rdquo;</p>
            <p className="text-xs text-muted-foreground mt-1">
              {ar ? "جرّب كلمة أخرى أو تحقق من الاسم" : "Try a different term or check the patient name"}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Results — grouped by patient */}
      {!isLoading && groups.map((group) => (
        <div key={group.name} className="space-y-2">
          {/* Patient header */}
          <div className={cn(
            "flex items-center gap-2 px-1",
            isRTL && "flex-row-reverse",
          )}>
            <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 shrink-0">
              <User className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className={cn("flex-1 min-w-0", isRTL && "text-right")}>
              <p className="font-semibold text-sm">{group.name}</p>
              <p className="text-xs text-muted-foreground">
                {group.encounters.length} {ar ? "سجل" : `encounter${group.encounters.length !== 1 ? "s" : ""}`}
                {" · "}
                {ar ? "آخر زيارة" : "last visit"}{" "}
                {formatDistanceToNow(new Date(group.encounters[0].createdAt), { addSuffix: true })}
              </p>
            </div>
            <ChevronRight className={cn("w-4 h-4 text-muted-foreground/40 shrink-0", isRTL && "rotate-180")} />
          </div>

          {/* Encounter cards for this patient */}
          <div className="space-y-2 pl-4 border-l-2 border-primary/20 ml-3">
            {group.encounters.map((c) => (
              <EncounterCard key={c.id} c={c} lang={lang} isRTL={isRTL} navigate={navigate} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
