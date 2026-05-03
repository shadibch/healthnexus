import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ClipboardList,
  Search,
  Plus,
  Minus,
  X,
  Loader2,
  Receipt,
  FlaskConical,
  Scan,
  Stethoscope,
  Activity,
  Heart,
  ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface HaadCode {
  code: string;
  description: string;
  descriptionAr: string;
  category: string;
  unitPrice: number;
}

interface EncounterActivity {
  id: number;
  consultationId: number;
  activityCode: string;
  description: string;
  category: string;
  quantity: number;
  unitPrice: string;
  total: string;
  notes: string | null;
  addedAt: string;
}

const CATEGORY_CFG: Record<string, { label: string; labelAr: string; icon: React.ElementType; color: string; bg: string }> = {
  consultation:   { label: "Consultation",   labelAr: "استشارة",      icon: Stethoscope,  color: "text-indigo-700", bg: "bg-indigo-50 border-indigo-200" },
  procedure:      { label: "Procedure",      labelAr: "إجراء",        icon: Activity,     color: "text-violet-700", bg: "bg-violet-50 border-violet-200" },
  laboratory:     { label: "Laboratory",     labelAr: "مختبر",         icon: FlaskConical, color: "text-blue-700",   bg: "bg-blue-50 border-blue-200" },
  radiology:      { label: "Radiology",      labelAr: "أشعة",          icon: Scan,         color: "text-amber-700",  bg: "bg-amber-50 border-amber-200" },
  nursing:        { label: "Nursing",        labelAr: "تمريض",         icon: Heart,        color: "text-rose-700",   bg: "bg-rose-50 border-rose-200" },
  physiotherapy:  { label: "Physiotherapy",  labelAr: "علاج طبيعي",   icon: Activity,     color: "text-teal-700",   bg: "bg-teal-50 border-teal-200" },
};

const CATEGORIES = Object.keys(CATEGORY_CFG);

// ─── Search / Add Dialog ──────────────────────────────────────────────────────
function AddActivityDialog({
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
  const [q, setQ] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selected, setSelected] = useState<HaadCode | null>(null);
  const [qty, setQty] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ(""); setActiveCategory(null); setSelected(null); setQty(1);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  const { data: results = [], isFetching } = useQuery<HaadCode[]>({
    queryKey: ["haad-catalogue", q, activeCategory],
    queryFn: () => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (activeCategory) params.set("category", activeCategory);
      return apiFetch(`/activities/catalogue?${params}`);
    },
    placeholderData: (prev) => prev,
  });

  const addMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/consultations/${consultationId}/activities`, {
        method: "POST",
        body: JSON.stringify({
          activityCode: selected!.code,
          description: selected!.description,
          category: selected!.category,
          quantity: qty,
          unitPrice: selected!.unitPrice,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activities", consultationId] });
      toast({ title: lang === "ar" ? "تمت إضافة النشاط" : "Activity added" });
      setSelected(null); setQty(1); setQ("");
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className={cn(isRTL && "text-right")}>
            {lang === "ar" ? "إضافة نشاط طبي — رموز HAAD / CPT" : "Add Medical Activity — HAAD / CPT Codes"}
          </DialogTitle>
        </DialogHeader>

        {/* Selected item confirm area */}
        {selected && (
          <div className="px-5 py-3 bg-primary/5 border-b flex items-center justify-between gap-3">
            <div className={cn("flex-1 min-w-0", isRTL && "text-right")}>
              <p className="text-sm font-semibold">{selected.code} — {isRTL ? selected.descriptionAr : selected.description}</p>
              <p className="text-xs text-muted-foreground">AED {selected.unitPrice.toFixed(2)} per unit</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setQty((n) => Math.max(1, n - 1))}
                className="w-7 h-7 rounded-md border border-border bg-background flex items-center justify-center hover:bg-muted"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-6 text-center font-mono text-sm font-bold">{qty}</span>
              <button
                onClick={() => setQty((n) => n + 1)}
                className="w-7 h-7 rounded-md border border-border bg-background flex items-center justify-center hover:bg-muted"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <Badge variant="secondary" className="font-mono text-sm">
                AED {(selected.unitPrice * qty).toFixed(2)}
              </Badge>
              <Button size="sm" onClick={() => addMutation.mutate()} disabled={addMutation.isPending} className="gap-1">
                {addMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                {lang === "ar" ? "أضف" : "Add"}
              </Button>
              <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Search + filter */}
        <div className="px-5 py-3 space-y-2 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
              placeholder={lang === "ar" ? "ابحث بالرمز أو الاسم... مثال: ECG, CBC, 99213" : "Search by code or name… e.g. ECG, CBC, 99213, chest X-ray"}
              dir="ltr"
            />
            {isFetching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setActiveCategory(null)}
              className={cn(
                "text-xs px-2.5 py-1 rounded-full border font-medium transition-colors",
                !activeCategory ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted/50"
              )}
            >
              {lang === "ar" ? "الكل" : "All"}
            </button>
            {CATEGORIES.map((cat) => {
              const cfg = CATEGORY_CFG[cat];
              const Icon = cfg.icon;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-full border font-medium transition-colors flex items-center gap-1",
                    activeCategory === cat
                      ? `${cfg.color} ${cfg.bg} border-current`
                      : "border-border text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  <Icon className="w-3 h-3" />
                  {lang === "ar" ? cfg.labelAr : cfg.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Results list */}
        <div className="overflow-y-auto flex-1 px-3 py-2">
          {results.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {lang === "ar" ? "لا توجد نتائج — جرب كلمة أخرى" : "No results — try a different keyword or code"}
            </div>
          ) : (
            <div className="space-y-0.5">
              {results.map((item) => {
                const cfg = CATEGORY_CFG[item.category] ?? CATEGORY_CFG.procedure;
                const Icon = cfg.icon;
                const isSelected = selected?.code === item.code && selected?.description === item.description;
                return (
                  <button
                    key={`${item.code}-${item.description}`}
                    onClick={() => { setSelected(item); setQty(1); }}
                    className={cn(
                      "w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 transition-colors",
                      isSelected ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted/50"
                    )}
                  >
                    <div className={cn("w-8 h-8 rounded-md flex items-center justify-center shrink-0 border", cfg.bg)}>
                      <Icon className={cn("w-4 h-4", cfg.color)} />
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-muted-foreground">{item.code}</span>
                        <span className={cn("text-xs px-1.5 py-0.5 rounded-full border font-medium", cfg.bg, cfg.color)}>
                          {lang === "ar" ? cfg.labelAr : cfg.label}
                        </span>
                      </div>
                      <p className="text-sm font-medium truncate mt-0.5">
                        {lang === "ar" ? item.descriptionAr : item.description}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold text-emerald-700">AED {item.unitPrice.toFixed(2)}</p>
                      <ChevronRight className={cn("w-3.5 h-3.5 text-muted-foreground mx-auto mt-0.5", isSelected && "text-primary")} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Activities Panel (main export) ──────────────────────────────────────────
interface ActivitiesPanelProps {
  consultationId: number;
  isCompleted: boolean;
}

export default function ActivitiesPanel({ consultationId, isCompleted }: ActivitiesPanelProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { lang, isRTL } = useI18n();
  const [addOpen, setAddOpen] = useState(false);

  const { data: activities = [], isLoading } = useQuery<EncounterActivity[]>({
    queryKey: ["activities", consultationId],
    queryFn: () => apiFetch(`/consultations/${consultationId}/activities`),
    refetchInterval: 20000,
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/activities/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activities", consultationId] });
      toast({ title: lang === "ar" ? "تم حذف النشاط" : "Activity removed" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateQtyMutation = useMutation({
    mutationFn: ({ id, quantity }: { id: number; quantity: number }) =>
      apiFetch(`/activities/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ quantity }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["activities", consultationId] }),
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const grandTotal = activities.reduce((sum, a) => sum + parseFloat(a.total), 0);

  return (
    <>
      <Card>
        <CardHeader className="py-3 px-4">
          <div className={cn("flex items-center justify-between", isRTL && "flex-row-reverse")}>
            <CardTitle className={cn("text-sm font-semibold flex items-center gap-2", isRTL && "flex-row-reverse")}>
              <ClipboardList className="w-4 h-4 text-emerald-600" />
              {lang === "ar" ? "الأنشطة الطبية (HAAD)" : "Medical Activities (HAAD/CPT)"}
              {activities.length > 0 && (
                <Badge variant="secondary" className="text-xs">{activities.length}</Badge>
              )}
            </CardTitle>
            {!isCompleted && (
              <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} className="gap-1 text-xs">
                <Plus className="w-3.5 h-3.5" />
                {lang === "ar" ? "إضافة نشاط" : "Add Activity"}
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="px-4 pb-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              {lang === "ar" ? "جارٍ التحميل..." : "Loading..."}
            </div>
          ) : activities.length === 0 ? (
            <div className="text-center py-6">
              <Receipt className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">
                {lang === "ar"
                  ? "لا توجد أنشطة — أضف رموز HAAD/CPT للمطالبات والفواتير"
                  : "No activities yet — add HAAD/CPT codes for billing & claims"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {activities.map((act) => {
                const cfg = CATEGORY_CFG[act.category] ?? CATEGORY_CFG.procedure;
                const Icon = cfg.icon;
                return (
                  <div
                    key={act.id}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-lg border",
                      cfg.bg,
                      isRTL && "flex-row-reverse"
                    )}
                  >
                    <div className={cn("w-8 h-8 rounded-md flex items-center justify-center shrink-0 border bg-white/70", cfg.color)}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={cn("flex items-center gap-2 flex-wrap", isRTL && "flex-row-reverse")}>
                        <span className="font-mono text-xs font-bold text-muted-foreground">{act.activityCode}</span>
                        <span className={cn("text-xs px-1.5 py-0.5 rounded-full border font-medium", cfg.color, cfg.bg)}>
                          {lang === "ar" ? cfg.labelAr : cfg.label}
                        </span>
                      </div>
                      <p className={cn("text-sm font-medium mt-0.5", isRTL && "text-right")}>
                        {lang === "ar"
                          ? (CATEGORY_CFG[act.category] ? act.description : act.description)
                          : act.description}
                      </p>
                      <div className={cn("flex items-center gap-3 mt-1.5", isRTL && "flex-row-reverse")}>
                        {/* Quantity controls */}
                        {!isCompleted ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => updateQtyMutation.mutate({ id: act.id, quantity: Math.max(1, act.quantity - 1) })}
                              disabled={act.quantity <= 1 || updateQtyMutation.isPending}
                              className="w-5 h-5 rounded border border-border bg-white/80 flex items-center justify-center hover:bg-white disabled:opacity-40"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="font-mono text-xs font-bold w-5 text-center">{act.quantity}</span>
                            <button
                              onClick={() => updateQtyMutation.mutate({ id: act.id, quantity: act.quantity + 1 })}
                              disabled={updateQtyMutation.isPending}
                              className="w-5 h-5 rounded border border-border bg-white/80 flex items-center justify-center hover:bg-white"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                            <span className="text-xs text-muted-foreground">
                              × AED {parseFloat(act.unitPrice).toFixed(2)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {act.quantity} × AED {parseFloat(act.unitPrice).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={cn("shrink-0 flex flex-col items-end gap-1.5", isRTL && "items-start")}>
                      <span className="font-bold text-sm text-emerald-800">
                        AED {parseFloat(act.total).toFixed(2)}
                      </span>
                      {!isCompleted && (
                        <button
                          onClick={() => removeMutation.mutate(act.id)}
                          disabled={removeMutation.isPending}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          title={lang === "ar" ? "حذف" : "Remove"}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Grand total */}
              <div className={cn(
                "flex items-center justify-between px-3 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 mt-3",
                isRTL && "flex-row-reverse"
              )}>
                <div className={cn("flex items-center gap-2", isRTL && "flex-row-reverse")}>
                  <Receipt className="w-4 h-4 text-emerald-700" />
                  <span className="text-sm font-semibold text-emerald-900">
                    {lang === "ar" ? "إجمالي المطالبة" : "Total Claim"}
                  </span>
                  <span className="text-xs text-emerald-700">
                    ({activities.length} {lang === "ar" ? "نشاط" : activities.length === 1 ? "activity" : "activities"})
                  </span>
                </div>
                <span className="text-lg font-bold text-emerald-800">
                  AED {grandTotal.toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AddActivityDialog
        consultationId={consultationId}
        open={addOpen}
        onClose={() => setAddOpen(false)}
      />
    </>
  );
}
