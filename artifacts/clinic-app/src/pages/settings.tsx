import { useState, useRef, useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useRole } from "@/lib/role";
import {
  useClinicSettings,
  CLINIC_SETTINGS_QUERY_KEY,
  type ClinicSettings,
} from "@/lib/clinic-settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import {
  Settings,
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  ImagePlus,
  Stethoscope,
  Save,
  Building2,
  MapPin,
  Navigation,
  Loader2,
  CircleDollarSign,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";

const MAX_BYTES = 1024 * 1024;

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

interface DoctorCategory {
  id: number;
  name: string;
  description: string | null;
  consultationFee: string;
  sortOrder: number;
  isActive: boolean;
}

// ── Fee Schedule Management Card ──────────────────────────────────────────────
function FeeScheduleCard({ lang, isRTL }: { lang: string; isRTL: boolean }) {
  const ar = lang === "ar";
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: categories, isLoading } = useQuery<DoctorCategory[]>({
    queryKey: ["fee-schedule"],
    queryFn: () => apiFetch("/fee-schedule"),
  });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editFee, setEditFee] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const [newName, setNewName] = useState("");
  const [newFee, setNewFee] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [adding, setAdding] = useState(false);

  const startEdit = (cat: DoctorCategory) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditFee(cat.consultationFee);
    setEditDesc(cat.description ?? "");
  };

  const updateMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/fee-schedule/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editName.trim(),
          consultationFee: parseFloat(editFee),
          description: editDesc.trim() || null,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fee-schedule"] });
      setEditingId(null);
      toast({ title: ar ? "تم الحفظ" : "Category updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/fee-schedule/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fee-schedule"] });
      toast({ title: ar ? "تم الحذف" : "Category removed" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch("/fee-schedule", {
        method: "POST",
        body: JSON.stringify({
          name: newName.trim(),
          consultationFee: parseFloat(newFee),
          description: newDesc.trim() || null,
          sortOrder: (categories?.length ?? 0) + 1,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fee-schedule"] });
      setNewName(""); setNewFee(""); setNewDesc(""); setAdding(false);
      toast({ title: ar ? "تمت الإضافة" : "Category added" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const tr = (en: string, arStr: string) => (ar ? arStr : en);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className={cn("flex items-center justify-between", isRTL && "flex-row-reverse")}>
          <CardTitle className={cn("text-sm font-semibold flex items-center gap-2", isRTL && "flex-row-reverse")}>
            <CircleDollarSign className="w-4 h-4 text-primary" />
            {tr("Fee Schedule", "جدول الرسوم")}
          </CardTitle>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs h-7"
            onClick={() => setAdding(true)}
          >
            <Plus className="w-3.5 h-3.5" />
            {tr("Add Category", "إضافة فئة")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {tr(
            "Define consultation fee tiers by doctor category. Fees are auto-applied when creating an encounter.",
            "حدِّد رسوم الكشف لكل فئة من الأطباء. تُطبَّق الرسوم تلقائياً عند فتح سجل المريض."
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-2 pb-4">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : !categories?.length ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            {tr("No categories yet. Add one above.", "لا توجد فئات. أضف واحدة بالضغط أعلاه.")}
          </p>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
            {categories.map((cat) => (
              <div key={cat.id} className={cn("px-4 py-3 bg-background", editingId === cat.id && "bg-muted/30")}>
                {editingId === cat.id ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">{tr("Category Name", "اسم الفئة")}</Label>
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{tr("Fee (AED)", "الرسم (AED)")}</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editFee}
                          onChange={(e) => setEditFee(e.target.value)}
                          className="h-8 text-sm font-mono"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{tr("Description (optional)", "الوصف (اختياري)")}</Label>
                      <Input
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        className="h-8 text-sm"
                        placeholder={tr("Short description...", "وصف قصير...")}
                      />
                    </div>
                    <div className={cn("flex gap-2 justify-end", isRTL && "flex-row-reverse")}>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => setEditingId(null)}
                      >
                        {tr("Cancel", "إلغاء")}
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        disabled={!editName.trim() || !editFee || updateMutation.isPending}
                        onClick={() => updateMutation.mutate(cat.id)}
                      >
                        {updateMutation.isPending
                          ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
                          : <Save className="w-3 h-3 mr-1" />}
                        {tr("Save", "حفظ")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className={cn("flex items-center justify-between gap-3", isRTL && "flex-row-reverse")}>
                    <div className={cn("flex-1 min-w-0", isRTL && "text-right")}>
                      <div className={cn("flex items-center gap-2 flex-wrap", isRTL && "flex-row-reverse")}>
                        <span className="text-sm font-semibold">{cat.name}</span>
                        {cat.description && (
                          <span className="text-xs text-muted-foreground truncate">{cat.description}</span>
                        )}
                      </div>
                    </div>
                    <div className={cn("flex items-center gap-3 shrink-0", isRTL && "flex-row-reverse")}>
                      <Badge variant="outline" className="text-emerald-700 border-emerald-300 font-mono font-semibold text-xs">
                        AED {parseFloat(cat.consultationFee).toFixed(2)}
                      </Badge>
                      <div className={cn("flex items-center gap-1", isRTL && "flex-row-reverse")}>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => startEdit(cat)}
                        >
                          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          disabled={deleteMutation.isPending}
                          onClick={() => {
                            if (confirm(tr("Remove this category?", "حذف هذه الفئة؟"))) {
                              deleteMutation.mutate(cat.id);
                            }
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add new category form */}
        {adding && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2 mt-2">
            <p className="text-xs font-semibold text-primary">{tr("New Category", "فئة جديدة")}</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{tr("Category Name *", "اسم الفئة *")}</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={tr("e.g. Consultant", "مثال: استشاري")}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{tr("Fee (AED) *", "الرسم (AED) *")}</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newFee}
                  onChange={(e) => setNewFee(e.target.value)}
                  placeholder="0.00"
                  className="h-8 text-sm font-mono"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{tr("Description (optional)", "الوصف (اختياري)")}</Label>
              <Input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="h-8 text-sm"
                placeholder={tr("Short note about this tier...", "ملاحظة قصيرة...")}
              />
            </div>
            <div className={cn("flex gap-2 justify-end", isRTL && "flex-row-reverse")}>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAdding(false)}>
                {tr("Cancel", "إلغاء")}
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={!newName.trim() || !newFee || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending
                  ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  : <Plus className="w-3 h-3 mr-1" />}
                {tr("Add", "إضافة")}
              </Button>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground pt-1">
          {tr(
            "Assign categories to individual doctors from the staff management section.",
            "يمكن تعيين الفئة لكل طبيب من قسم إدارة الكوادر الطبية."
          )}
        </p>
      </CardContent>
    </Card>
  );
}

// ── Main Settings Page ────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { lang, isRTL } = useI18n();
  const { user } = useAuth();
  const saved = useClinicSettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [name, setName] = useState("");

  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoChanged, setLogoChanged] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [address, setAddress] = useState("");
  const [city, setCity]       = useState("");
  const [country, setCountry] = useState("");
  const [latitude,  setLatitude]  = useState("");
  const [longitude, setLongitude] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError]   = useState("");
  const [geoSuccess, setGeoSuccess] = useState(false);

  useEffect(() => {
    if (!saved.isLoading) {
      if (saved.latitude  != null && latitude  === "") setLatitude(String(saved.latitude));
      if (saved.longitude != null && longitude === "") setLongitude(String(saved.longitude));
      if (saved.address   != null && address   === "") setAddress(saved.address);
      if (saved.city      != null && city      === "") setCity(saved.city);
      if (saved.country   != null && country   === "") setCountry(saved.country);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved.isLoading]);

  const { hasRole } = useRole();
  const isAdmin = hasRole("doctor") || hasRole("receptionist");

  const displayName = name.trim() !== "" ? name : saved.clinicName;
  const displayLogo = logoChanged ? logoPreview : saved.logoBase64;

  const mutation = useMutation({
    mutationFn: (payload: Partial<ClinicSettings>) =>
      apiFetch<ClinicSettings>("/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(CLINIC_SETTINGS_QUERY_KEY, data);
      setLogoChanged(false);
      setLogoPreview(null);
      setName("");
      toast({
        title: lang === "ar" ? "تم الحفظ بنجاح" : "Settings saved",
        description:
          lang === "ar"
            ? "تم تحديث بيانات المركز الطبي"
            : "Medical center information has been updated.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: lang === "ar" ? "خطأ في الحفظ" : "Save failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const processFile = useCallback(async (file: File) => {
    setFileError("");
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setFileError(lang === "ar" ? "يُقبل PNG و JPEG فقط" : "Only PNG and JPEG files are accepted");
      return;
    }
    if (file.size > MAX_BYTES) {
      setFileError(lang === "ar" ? "الحجم الأقصى للملف هو 1 MB" : "Maximum logo size is 1 MB");
      return;
    }
    setLogoPreview(await readFileAsBase64(file));
    setLogoChanged(true);
  }, [lang]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  };

  const handleRemoveLogo = () => { setLogoPreview(null); setLogoChanged(true); setFileError(""); };

  const geocodeAddress = async () => {
    const parts = [address || saved.address, city || saved.city, country || saved.country]
      .filter(Boolean) as string[];
    if (parts.length === 0) {
      setGeoError(lang === "ar" ? "أدخل عنواناً أو مدينةً أو بلداً أولاً" : "Enter an address, city, or country first.");
      return;
    }
    setGeoLoading(true);
    setGeoError("");
    setGeoSuccess(false);
    try {
      const q = encodeURIComponent(parts.join(", "));
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`,
        { headers: { "User-Agent": "ClinicFlow-HIS/1.0" } }
      );
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const results = await resp.json() as { lat: string; lon: string; display_name: string }[];
      if (results.length > 0) {
        setLatitude(parseFloat(results[0].lat).toFixed(6));
        setLongitude(parseFloat(results[0].lon).toFixed(6));
        setGeoSuccess(true);
        setTimeout(() => setGeoSuccess(false), 3000);
      } else {
        setGeoError(lang === "ar" ? "لم يُعثر على إحداثيات. حاول بمزيد من التفصيل." : "No location found. Try being more specific.");
      }
    } catch {
      setGeoError(lang === "ar" ? "فشل الاتصال بخدمة الخرائط" : "Geocoding request failed. Check your connection.");
    } finally {
      setGeoLoading(false);
    }
  };

  const handleSave = () => {
    const latNum  = latitude.trim()  !== "" ? parseFloat(latitude)  : null;
    const lonNum  = longitude.trim() !== "" ? parseFloat(longitude) : null;

    if (latNum != null && (isNaN(latNum) || latNum < -90  || latNum > 90)) {
      toast({ title: "Invalid latitude",  description: "Must be between -90 and 90.",   variant: "destructive" });
      return;
    }
    if (lonNum != null && (isNaN(lonNum) || lonNum < -180 || lonNum > 180)) {
      toast({ title: "Invalid longitude", description: "Must be between -180 and 180.", variant: "destructive" });
      return;
    }

    const payload: Partial<ClinicSettings> = {
      clinicName: displayName.trim() || saved.clinicName,
      address:    address.trim()  || null,
      city:       city.trim()     || null,
      country:    country.trim()  || null,
      latitude:   latNum,
      longitude:  lonNum,
    };
    if (logoChanged) payload.logoBase64 = logoPreview;

    mutation.mutate(payload);
  };

  if (!isAdmin) {
    return (
      <div className="text-center py-16">
        <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground text-sm">
          {lang === "ar"
            ? "هذه الصفحة للأطباء والمستقبلين فقط"
            : "This page is only available to doctors and receptionists"}
        </p>
      </div>
    );
  }

  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);

  return (
    <div
      className={cn("space-y-5 max-w-2xl", isRTL && "font-arabic")}
      dir={isRTL ? "rtl" : "ltr"}
    >
      <Toaster />

      {/* Header */}
      <div className={cn(isRTL && "text-right")}>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Settings className="w-5 h-5 text-primary" />
          {tr("System Settings", "إعدادات النظام")}
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {tr(
            "Configure your medical center's identity, location, and fee schedule",
            "ضبط هوية المركز الطبي وموقعه وجدول الرسوم"
          )}
        </p>
      </div>

      {/* Live preview */}
      <Card className="border border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">
            {tr("Live Preview", "معاينة فورية")}
          </p>
          <div className={cn("flex items-center gap-3", isRTL && "flex-row-reverse")}>
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center overflow-hidden shrink-0">
              {displayLogo ? (
                <img src={displayLogo} alt="logo" className="w-full h-full object-cover" />
              ) : (
                <Stethoscope className="w-5 h-5 text-primary-foreground" />
              )}
            </div>
            <div className={cn(isRTL && "text-right")}>
              <p className="font-bold text-base tracking-tight leading-tight">{displayName}</p>
              {(city || saved.city || country || saved.country) && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3" />
                  {[city || saved.city, country || saved.country].filter(Boolean).join(", ")}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Medical Center Name */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            {tr("Medical Center Name", "اسم المركز الطبي")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="clinic-name" className="text-xs text-muted-foreground">
            {tr(
              "Appears in the sidebar, login screen, and on all printed documents.",
              "يظهر في الشريط الجانبي وشاشة تسجيل الدخول وعلى جميع المستندات المطبوعة."
            )}
          </Label>
          <Input
            id="clinic-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={saved.clinicName}
            className={cn("max-w-md", isRTL && "text-right")}
          />
          <p className="text-xs text-muted-foreground">
            {tr("Current:", "الحالي:")} <span className="font-medium text-foreground">{saved.clinicName}</span>
          </p>
        </CardContent>
      </Card>

      {/* Location & Address */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            {tr("Location & Address", "الموقع والعنوان")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            {tr(
              "The physical location of your medical center. Coordinates can be used to embed a map or share directions.",
              "الموقع الفعلي للمركز الطبي. تُستخدم الإحداثيات لتضمين خريطة أو مشاركة الاتجاهات."
            )}
          </p>

          <div className="grid gap-3">
            <div className="space-y-1">
              <Label htmlFor="address" className="text-xs font-medium">
                {tr("Street Address", "عنوان الشارع")}
              </Label>
              <Input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={tr("e.g. 15 Al Reem Island, Tower B", "مثال: شارع الشيخ زايد، برج B")}
                className={cn(isRTL && "text-right")}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="city" className="text-xs font-medium">
                  {tr("City", "المدينة")}
                </Label>
                <Input
                  id="city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder={tr("e.g. Abu Dhabi", "مثال: أبوظبي")}
                  className={cn(isRTL && "text-right")}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="country" className="text-xs font-medium">
                  {tr("Country", "الدولة")}
                </Label>
                <Input
                  id="country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder={tr("e.g. UAE", "مثال: الإمارات")}
                  className={cn(isRTL && "text-right")}
                />
              </div>
            </div>
          </div>

          <div className="pt-1 border-t border-border space-y-3">
            <div className={cn("flex items-center justify-between gap-2", isRTL && "flex-row-reverse")}>
              <div>
                <p className="text-xs font-semibold flex items-center gap-1">
                  <Navigation className="w-3.5 h-3.5 text-primary" />
                  {tr("GPS Coordinates", "الإحداثيات الجغرافية")}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {tr(
                    "Decimal degrees format (e.g. 24.4539, 54.3773). Auto-fill from the address above, or enter manually.",
                    "نظام الدرجات العشرية (مثال: 24.4539، 54.3773). تعبئة تلقائية من العنوان أعلاه أو إدخال يدوي."
                  )}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={geocodeAddress}
                disabled={geoLoading}
                className="shrink-0 gap-1.5 text-xs h-8"
              >
                {geoLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Navigation className="w-3.5 h-3.5" />
                )}
                {geoLoading
                  ? tr("Fetching…", "جارٍ الجلب…")
                  : tr("Fetch from Address", "جلب من العنوان")}
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="latitude" className="text-xs font-medium">
                  {tr("Latitude", "خط العرض")}
                  <span className="text-muted-foreground font-normal ml-1">(-90 → 90)</span>
                </Label>
                <Input
                  id="latitude"
                  type="number"
                  step="0.000001"
                  min="-90"
                  max="90"
                  value={latitude}
                  onChange={(e) => { setLatitude(e.target.value); setGeoError(""); }}
                  placeholder="e.g. 24.453900"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="longitude" className="text-xs font-medium">
                  {tr("Longitude", "خط الطول")}
                  <span className="text-muted-foreground font-normal ml-1">(-180 → 180)</span>
                </Label>
                <Input
                  id="longitude"
                  type="number"
                  step="0.000001"
                  min="-180"
                  max="180"
                  value={longitude}
                  onChange={(e) => { setLongitude(e.target.value); setGeoError(""); }}
                  placeholder="e.g. 54.377300"
                  className="font-mono text-sm"
                />
              </div>
            </div>

            {geoSuccess && (
              <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                {tr("Coordinates fetched successfully — verify and save.", "تم جلب الإحداثيات — تحقق منها واحفظ.")}
              </div>
            )}
            {geoError && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {geoError}
              </div>
            )}

            {latitude && longitude && !isNaN(parseFloat(latitude)) && !isNaN(parseFloat(longitude)) && (
              <a
                href={`https://www.google.com/maps?q=${latitude},${longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <MapPin className="w-3 h-3" />
                {tr("Preview on Google Maps ↗", "معاينة على خرائط جوجل ↗")}
              </a>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Medical Center Logo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ImagePlus className="w-4 h-4 text-primary" />
            {tr("Medical Center Logo", "شعار المركز الطبي")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            {tr(
              "Upload a PNG or JPEG logo (max 1 MB). It will replace the stethoscope icon in the sidebar and on printed invoices.",
              "ارفع شعاراً بصيغة PNG أو JPEG (حجم أقصى 1 MB). سيحل محل أيقونة السماعة الطبية في الشريط الجانبي والفواتير المطبوعة."
            )}
          </p>

          <div className="flex gap-4 items-start flex-wrap">
            <div
              className={cn(
                "relative border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors text-center w-52 h-44",
                dragging
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50 hover:bg-muted/30"
              )}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-6 h-6 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {tr("Click or drag to upload", "انقر أو اسحب للرفع")}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">PNG, JPEG · max 1 MB</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            <div className="flex flex-col items-center gap-2">
              <p className="text-xs text-muted-foreground font-medium">
                {logoChanged ? tr("New Logo Preview", "معاينة الشعار الجديد") : tr("Current Logo", "الشعار الحالي")}
              </p>
              <div className="w-24 h-24 rounded-xl bg-primary/10 border border-border flex items-center justify-center overflow-hidden relative group">
                {displayLogo ? (
                  <>
                    <img src={displayLogo} alt="logo preview" className="w-full h-full object-contain p-1" />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleRemoveLogo(); }}
                      className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </>
                ) : (
                  <Stethoscope className="w-8 h-8 text-primary/40" />
                )}
              </div>
            </div>
          </div>

          {fileError && (
            <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 p-2 rounded-lg">
              <AlertCircle className="w-3 h-3" />
              {fileError}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fee Schedule */}
      <FeeScheduleCard lang={lang} isRTL={isRTL} />

      {/* Action bar */}
      <div className="sticky bottom-0 bg-background/80 backdrop-blur-sm py-4 border-t border-border flex justify-end">
        <Button
          onClick={handleSave}
          disabled={mutation.isPending}
          className="gap-2 min-w-[140px]"
        >
          {mutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {mutation.isPending ? tr("Saving…", "جارٍ الحفظ…") : tr("Save Changes", "حفظ التغييرات")}
        </Button>
      </div>
    </div>
  );
}
