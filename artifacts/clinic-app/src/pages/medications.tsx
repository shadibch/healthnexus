import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useRole } from "@/lib/role";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Search, Plus, FlaskConical, Pill, Lock, Unlock,
  ChevronDown, ChevronUp, Pencil, X,
} from "lucide-react";

interface Medication {
  id: number;
  name: string;
  genericName: string | null;
  category: string | null;
  dosageForm: string | null;
  strength: string | null;
  manufacturer: string | null;
  description: string | null;
  requiresPrescription: boolean;
  createdAt: string;
}

const DOSAGE_FORMS = [
  "Tablet", "Capsule", "Syrup", "Injection", "Inhaler",
  "Cream / Ointment", "Drops", "Lozenge", "Spray", "Patch",
  "Suppository", "Powder", "Gel", "Solution", "Other",
];

const COMMON_CATEGORIES = [
  "Analgesic", "Analgesic/Antipyretic", "NSAID", "Opioid Analgesic",
  "Antibiotic", "Antibiotic/Antiprotozoal", "Throat Antiseptic", "Throat Anti-inflammatory",
  "Antihypertensive", "ACE Inhibitor", "ARB", "Beta-blocker",
  "Calcium Channel Blocker", "Thiazide Diuretic", "Thiazide-like Diuretic", "Loop Diuretic",
  "Antidiabetic", "Antidiabetic (DPP-4)", "Antidiabetic (Sulfonylurea)", "SGLT-2 Inhibitor",
  "Insulin", "GLP-1 Agonist",
  "Antiplatelet", "Anticoagulant", "Statin", "Fibrate",
  "Cardiac Glycoside", "Antacid", "PPI", "Prokinetic", "Antiemetic", "Antidiarrheal", "Laxative",
  "Bronchodilator", "Inhaled Corticosteroid + LABA", "Anticholinergic Bronchodilator",
  "Leukotriene Antagonist", "Antihistamine", "Corticosteroid",
  "SSRI", "Tricyclic Antidepressant", "Benzodiazepine", "Anticonvulsant/Analgesic",
  "Thyroid Hormone", "Iron Supplement", "Vitamin Supplement", "Mineral Supplement",
  "Topical Antibiotic", "Topical Corticosteroid", "Other",
];

const CATEGORY_GROUPS: Record<string, string[]> = {
  "Pain / Fever":     ["Analgesic", "Analgesic/Antipyretic", "NSAID", "Opioid Analgesic"],
  "Antibiotics":      ["Antibiotic", "Antibiotic/Antiprotozoal", "Throat Antiseptic", "Throat Anti-inflammatory"],
  "Blood Pressure":   ["ACE Inhibitor", "ARB", "Beta-blocker", "Calcium Channel Blocker", "Loop Diuretic", "Thiazide Diuretic", "Thiazide-like Diuretic", "Antihypertensive"],
  "Diabetes":         ["Antidiabetic", "Antidiabetic (DPP-4)", "Antidiabetic (Sulfonylurea)", "SGLT-2 Inhibitor", "Insulin", "GLP-1 Agonist"],
  "Heart":            ["Antiplatelet", "Anticoagulant", "Statin", "Fibrate", "Cardiac Glycoside"],
  "Respiratory":      ["Bronchodilator", "Inhaled Corticosteroid + LABA", "Anticholinergic Bronchodilator", "Leukotriene Antagonist", "Antihistamine"],
  "Stomach / Gut":    ["Antacid", "PPI", "Prokinetic", "Antiemetic", "Antidiarrheal", "Laxative"],
  "Mental Health":    ["SSRI", "Tricyclic Antidepressant", "Benzodiazepine", "Anticonvulsant/Analgesic"],
  "Supplements":      ["Thyroid Hormone", "Iron Supplement", "Vitamin Supplement", "Mineral Supplement"],
  "Topical":          ["Topical Antibiotic", "Topical Corticosteroid", "Corticosteroid"],
};

function groupForCategory(cat: string | null): string {
  if (!cat) return "Other";
  for (const [group, cats] of Object.entries(CATEGORY_GROUPS)) {
    if (cats.includes(cat)) return group;
  }
  return "Other";
}

const GROUP_COLORS: Record<string, string> = {
  "Pain / Fever":  "bg-orange-100 text-orange-800 border-orange-200",
  "Antibiotics":   "bg-red-100 text-red-800 border-red-200",
  "Blood Pressure":"bg-blue-100 text-blue-800 border-blue-200",
  "Diabetes":      "bg-violet-100 text-violet-800 border-violet-200",
  "Heart":         "bg-rose-100 text-rose-800 border-rose-200",
  "Respiratory":   "bg-sky-100 text-sky-800 border-sky-200",
  "Stomach / Gut": "bg-amber-100 text-amber-800 border-amber-200",
  "Mental Health": "bg-purple-100 text-purple-800 border-purple-200",
  "Supplements":   "bg-green-100 text-green-800 border-green-200",
  "Topical":       "bg-teal-100 text-teal-800 border-teal-200",
  "Other":         "bg-muted text-muted-foreground border-border",
};

const FILTER_GROUPS = ["All", ...Object.keys(CATEGORY_GROUPS), "Other"];

interface MedFormState {
  name: string;
  genericName: string;
  category: string;
  customCategory: string;
  dosageForm: string;
  strength: string;
  manufacturer: string;
  description: string;
  requiresPrescription: boolean;
}

const EMPTY_FORM: MedFormState = {
  name: "", genericName: "", category: "", customCategory: "",
  dosageForm: "", strength: "", manufacturer: "", description: "",
  requiresPrescription: true,
};

export default function MedicationsPage() {
  const { role } = useRole();
  const { t, isRTL, lang } = useI18n();
  const qc = useQueryClient();
  const { toast } = useToast();
  const ar = lang === "ar";

  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("All");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingMed, setEditingMed] = useState<Medication | null>(null);
  const [form, setForm] = useState<MedFormState>(EMPTY_FORM);

  const { data: medications, isLoading } = useQuery<Medication[]>({
    queryKey: ["medications"],
    queryFn: () => apiFetch("/medications"),
  });

  // Client-side search + group filter
  const filtered = useMemo(() => {
    if (!medications) return [];
    const q = search.toLowerCase().trim();
    return medications.filter((m) => {
      const matchSearch =
        !q ||
        m.name.toLowerCase().includes(q) ||
        (m.genericName ?? "").toLowerCase().includes(q) ||
        (m.category ?? "").toLowerCase().includes(q) ||
        (m.description ?? "").toLowerCase().includes(q);

      const matchGroup =
        groupFilter === "All" ||
        groupForCategory(m.category) === groupFilter;

      return matchSearch && matchGroup;
    });
  }, [medications, search, groupFilter]);

  // Group counts for the filter pills
  const groupCounts = useMemo(() => {
    if (!medications) return {} as Record<string, number>;
    const counts: Record<string, number> = { All: medications.length };
    for (const m of medications) {
      const g = groupForCategory(m.category);
      counts[g] = (counts[g] ?? 0) + 1;
    }
    return counts;
  }, [medications]);

  // Add / edit mutation
  const saveMutation = useMutation({
    mutationFn: async (payload: Partial<Medication>) => {
      if (editingMed) {
        return apiFetch(`/medications/${editingMed.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }
      return apiFetch("/medications", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["medications"] });
      toast({
        title: editingMed
          ? (ar ? "تم تحديث الدواء" : "Medication updated")
          : (ar ? "تم إضافة الدواء" : "Medication added"),
      });
      closeSheet();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  function openAdd() {
    setEditingMed(null);
    setForm(EMPTY_FORM);
    setSheetOpen(true);
  }

  function openEdit(m: Medication) {
    setEditingMed(m);
    setForm({
      name: m.name,
      genericName: m.genericName ?? "",
      category: COMMON_CATEGORIES.includes(m.category ?? "") ? (m.category ?? "") : "Other",
      customCategory: COMMON_CATEGORIES.includes(m.category ?? "") ? "" : (m.category ?? ""),
      dosageForm: m.dosageForm ?? "",
      strength: m.strength ?? "",
      manufacturer: m.manufacturer ?? "",
      description: m.description ?? "",
      requiresPrescription: m.requiresPrescription,
    });
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setEditingMed(null);
    setForm(EMPTY_FORM);
  }

  function handleSave() {
    if (!form.name.trim()) {
      toast({ title: ar ? "اسم الدواء مطلوب" : "Medication name is required", variant: "destructive" });
      return;
    }
    const finalCategory = form.category === "Other" || form.category === ""
      ? form.customCategory.trim() || undefined
      : form.category;

    saveMutation.mutate({
      name: form.name.trim(),
      genericName: form.genericName.trim() || undefined,
      category: finalCategory,
      dosageForm: form.dosageForm || undefined,
      strength: form.strength.trim() || undefined,
      manufacturer: form.manufacturer.trim() || undefined,
      description: form.description.trim() || undefined,
      requiresPrescription: form.requiresPrescription,
    } as any);
  }

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const isDoctor = role === "doctor";

  return (
    <div className={cn("p-4 md:p-6 space-y-4 max-w-7xl mx-auto", isRTL && "font-arabic")} dir={isRTL ? "rtl" : "ltr"}>
      {/* Header */}
      <div className={cn("flex items-center justify-between gap-3 flex-wrap", isRTL && "flex-row-reverse")}>
        <div className={cn("flex items-center gap-2", isRTL && "flex-row-reverse")}>
          <FlaskConical className="w-6 h-6 text-primary" />
          <div className={isRTL ? "text-right" : ""}>
            <h1 className="text-xl font-bold">{ar ? "دليل الأدوية" : "Medicines Catalogue"}</h1>
            <p className="text-sm text-muted-foreground">
              {medications
                ? (ar ? `${medications.length} دواء مسجّل` : `${medications.length} medications in the system`)
                : ""}
            </p>
          </div>
        </div>
        {isDoctor && (
          <Button onClick={openAdd} className={cn("gap-2", isRTL && "flex-row-reverse")}>
            <Plus className="w-4 h-4" />
            {ar ? "إضافة دواء جديد" : "Add Medication"}
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className={cn("absolute top-2.5 w-4 h-4 text-muted-foreground", isRTL ? "right-3" : "left-3")} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={ar ? "ابحث بالاسم التجاري أو العلمي أو الفئة..." : "Search by commercial name, scientific name, or category..."}
          className={cn(
            "w-full rounded-lg border border-border bg-background py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40",
            isRTL ? "pr-9 pl-3" : "pl-9 pr-3"
          )}
          dir={isRTL ? "rtl" : "ltr"}
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className={cn("absolute top-2.5", isRTL ? "left-3" : "right-3")}
          >
            <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>

      {/* Group filter chips */}
      <div className={cn("flex gap-1.5 flex-wrap", isRTL && "flex-row-reverse")}>
        {FILTER_GROUPS.map((g) => (
          <button
            key={g}
            onClick={() => setGroupFilter(g)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium border transition-colors whitespace-nowrap",
              groupFilter === g
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:bg-muted"
            )}
          >
            {g}{groupCounts[g] != null ? ` (${groupCounts[g]})` : ""}
          </button>
        ))}
      </div>

      {/* Results count */}
      {search && (
        <p className="text-sm text-muted-foreground">
          {ar
            ? `${filtered.length} نتيجة للبحث عن "${search}"`
            : `${filtered.length} result${filtered.length !== 1 ? "s" : ""} for "${search}"`}
        </p>
      )}

      {/* Medications list */}
      <div className="space-y-2">
        {isLoading
          ? [1,2,3,4,5,6].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)
          : filtered.length === 0
          ? (
            <div className="text-center py-16 text-muted-foreground">
              <Pill className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">{ar ? "لا توجد أدوية مطابقة" : "No medications found"}</p>
              {isDoctor && (
                <Button variant="outline" size="sm" onClick={openAdd} className="mt-3 gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  {ar ? "أضف دواءً جديداً" : "Add a new medication"}
                </Button>
              )}
            </div>
          )
          : filtered.map((med) => {
            const isExpanded = expanded.has(med.id);
            const group = groupForCategory(med.category);
            const groupColor = GROUP_COLORS[group] ?? GROUP_COLORS["Other"];

            return (
              <div
                key={med.id}
                className="rounded-xl border border-border bg-card hover:bg-muted/20 transition-colors"
              >
                {/* Main row */}
                <div
                  className={cn("flex items-center gap-3 px-4 py-3 cursor-pointer", isRTL && "flex-row-reverse")}
                  onClick={() => toggleExpand(med.id)}
                >
                  {/* Icon */}
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Pill className="w-4 h-4 text-primary" />
                  </div>

                  {/* Names */}
                  <div className={cn("flex-1 min-w-0", isRTL && "text-right")}>
                    <div className={cn("flex items-baseline gap-2 flex-wrap", isRTL && "flex-row-reverse")}>
                      <span className="font-semibold text-sm">{med.name}</span>
                      {med.genericName && (
                        <span className="text-xs text-muted-foreground font-mono tracking-wide uppercase">
                          {med.genericName}
                        </span>
                      )}
                    </div>
                    <div className={cn("flex items-center gap-2 mt-0.5 flex-wrap", isRTL && "flex-row-reverse")}>
                      {med.category && (
                        <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border", groupColor)}>
                          {med.category}
                        </span>
                      )}
                      {med.dosageForm && (
                        <span className="text-xs text-muted-foreground">{med.dosageForm}</span>
                      )}
                      {med.strength && (
                        <span className="text-xs text-muted-foreground font-medium">{med.strength}</span>
                      )}
                    </div>
                  </div>

                  {/* Right side */}
                  <div className={cn("flex items-center gap-2 shrink-0", isRTL && "flex-row-reverse")}>
                    {med.requiresPrescription ? (
                      <span className="flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                        <Lock className="w-3 h-3" />
                        {ar ? "وصفة" : "Rx"}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                        <Unlock className="w-3 h-3" />
                        OTC
                      </span>
                    )}
                    {isDoctor && (
                      <button
                        onClick={(e) => { e.stopPropagation(); openEdit(med); }}
                        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {isExpanded
                      ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    }
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className={cn("px-4 pb-4 pt-0 border-t border-border", isRTL && "text-right")}>
                    <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 mt-3 text-sm">
                      {med.genericName && (
                        <div>
                          <dt className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                            {ar ? "الاسم العلمي" : "Scientific Name"}
                          </dt>
                          <dd className="font-mono font-medium mt-0.5 uppercase text-xs">{med.genericName}</dd>
                        </div>
                      )}
                      {med.category && (
                        <div>
                          <dt className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                            {ar ? "الفئة" : "Category"}
                          </dt>
                          <dd className="mt-0.5 text-sm">{med.category}</dd>
                        </div>
                      )}
                      {med.dosageForm && (
                        <div>
                          <dt className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                            {ar ? "الشكل الدوائي" : "Dosage Form"}
                          </dt>
                          <dd className="mt-0.5 text-sm">{med.dosageForm}</dd>
                        </div>
                      )}
                      {med.strength && (
                        <div>
                          <dt className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                            {ar ? "التركيز" : "Strength"}
                          </dt>
                          <dd className="mt-0.5 text-sm font-medium">{med.strength}</dd>
                        </div>
                      )}
                      {med.manufacturer && (
                        <div>
                          <dt className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                            {ar ? "الشركة المصنّعة" : "Manufacturer"}
                          </dt>
                          <dd className="mt-0.5 text-sm">{med.manufacturer}</dd>
                        </div>
                      )}
                      <div>
                        <dt className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                          {ar ? "صرف" : "Dispensing"}
                        </dt>
                        <dd className="mt-0.5 text-sm">
                          {med.requiresPrescription
                            ? (ar ? "يستلزم وصفة طبية" : "Prescription required")
                            : (ar ? "بدون وصفة (OTC)" : "Over-the-counter (OTC)")}
                        </dd>
                      </div>
                    </dl>
                    {med.description && (
                      <p className="mt-3 text-sm text-muted-foreground leading-relaxed border-t border-border pt-3">
                        {med.description}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {/* Add / Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={(v) => { if (!v) closeSheet(); }}>
        <SheetContent
          side={isRTL ? "left" : "right"}
          className="w-full sm:max-w-lg overflow-y-auto"
          dir={isRTL ? "rtl" : "ltr"}
        >
          <SheetHeader>
            <SheetTitle className={cn("flex items-center gap-2", isRTL && "flex-row-reverse")}>
              <FlaskConical className="w-5 h-5 text-primary" />
              {editingMed
                ? (ar ? `تعديل: ${editingMed.name}` : `Edit: ${editingMed.name}`)
                : (ar ? "إضافة دواء جديد" : "Add New Medication")}
            </SheetTitle>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            {/* Commercial name */}
            <Field label={ar ? "الاسم التجاري *" : "Commercial Name *"} isRTL={isRTL}>
              <input
                className={INPUT_CLS}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={ar ? "مثال: Augmentin، Aspirin..." : "e.g. Augmentin, Aspirin..."}
              />
            </Field>

            {/* Scientific / generic name */}
            <Field label={ar ? "الاسم العلمي (العام) *" : "Scientific Name (Generic) *"} isRTL={isRTL}>
              <input
                className={cn(INPUT_CLS, "font-mono uppercase")}
                value={form.genericName}
                onChange={(e) => setForm((f) => ({ ...f, genericName: e.target.value }))}
                placeholder="e.g. ACETYLSALICYLIC ACID, AMOXICILLIN..."
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                {ar ? "أدخل المادة الفعالة بالاسم الكامل (INN أو USAN)" : "Enter the active ingredient (INN or USAN name)"}
              </p>
            </Field>

            {/* Category */}
            <Field label={ar ? "الفئة الدوائية" : "Category"} isRTL={isRTL}>
              <select
                className={INPUT_CLS}
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              >
                <option value="">{ar ? "اختر الفئة..." : "Select category..."}</option>
                {COMMON_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Field>

            {/* Custom category if Other selected */}
            {(form.category === "Other" || (form.category === "" && form.customCategory)) && (
              <Field label={ar ? "فئة مخصصة" : "Custom Category"} isRTL={isRTL}>
                <input
                  className={INPUT_CLS}
                  value={form.customCategory}
                  onChange={(e) => setForm((f) => ({ ...f, customCategory: e.target.value }))}
                  placeholder={ar ? "اكتب الفئة..." : "Type the category..."}
                />
              </Field>
            )}

            {/* Dosage form */}
            <Field label={ar ? "الشكل الدوائي" : "Dosage Form"} isRTL={isRTL}>
              <select
                className={INPUT_CLS}
                value={form.dosageForm}
                onChange={(e) => setForm((f) => ({ ...f, dosageForm: e.target.value }))}
              >
                <option value="">{ar ? "اختر..." : "Select..."}</option>
                {DOSAGE_FORMS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </Field>

            {/* Strength */}
            <Field label={ar ? "التركيز / الجرعة" : "Strength / Dose"} isRTL={isRTL}>
              <input
                className={INPUT_CLS}
                value={form.strength}
                onChange={(e) => setForm((f) => ({ ...f, strength: e.target.value }))}
                placeholder="e.g. 500mg, 10mg/ml, 250mg / 500mg..."
              />
            </Field>

            {/* Manufacturer */}
            <Field label={ar ? "الشركة المصنّعة" : "Manufacturer"} isRTL={isRTL}>
              <input
                className={INPUT_CLS}
                value={form.manufacturer}
                onChange={(e) => setForm((f) => ({ ...f, manufacturer: e.target.value }))}
                placeholder={ar ? "اختياري..." : "Optional..."}
              />
            </Field>

            {/* Requires prescription */}
            <div className={cn("flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20", isRTL && "flex-row-reverse")}>
              <input
                type="checkbox"
                id="rx-check"
                checked={form.requiresPrescription}
                onChange={(e) => setForm((f) => ({ ...f, requiresPrescription: e.target.checked }))}
                className="w-4 h-4 accent-primary"
              />
              <label htmlFor="rx-check" className={cn("flex-1 cursor-pointer", isRTL && "text-right")}>
                <span className="text-sm font-medium block">
                  {ar ? "يستلزم وصفة طبية (Rx)" : "Requires Prescription (Rx)"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {ar
                    ? "إذا لم يُفعَّل، يُعدّ الدواء متاحاً بدون وصفة (OTC)"
                    : "If unchecked, medication is available over-the-counter (OTC)"}
                </span>
              </label>
              {form.requiresPrescription
                ? <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                : <Unlock className="w-4 h-4 text-emerald-600 shrink-0" />
              }
            </div>

            {/* Description */}
            <Field label={ar ? "الوصف / الاستخدام" : "Description / Usage"} isRTL={isRTL}>
              <textarea
                className={cn(INPUT_CLS, "resize-none")}
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder={ar
                  ? "اكتب وصفاً موجزاً للدواء واستخداماته..."
                  : "Brief description and clinical uses..."}
              />
            </Field>

            {/* Actions */}
            <div className={cn("flex gap-2 pt-2", isRTL && "flex-row-reverse")}>
              <Button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="flex-1 gap-2"
              >
                {saveMutation.isPending
                  ? (ar ? "جارٍ الحفظ..." : "Saving...")
                  : editingMed
                  ? (ar ? "حفظ التعديلات" : "Save Changes")
                  : (ar ? "إضافة الدواء" : "Add Medication")}
              </Button>
              <Button variant="outline" onClick={closeSheet} className="gap-2">
                {ar ? "إلغاء" : "Cancel"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

const INPUT_CLS =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

function Field({
  label, children, isRTL,
}: {
  label: string; children: React.ReactNode; isRTL: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className={cn("block text-sm font-medium", isRTL && "text-right")}>{label}</label>
      {children}
    </div>
  );
}
