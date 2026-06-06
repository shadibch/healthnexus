import { useState, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import {
  useClinicSettings,
  CLINIC_SETTINGS_QUERY_KEY,
  type ClinicSettings,
} from "@/lib/clinic-settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";

const MAX_BYTES = 1024 * 1024; // 1 MB

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export default function SettingsPage() {
  const { lang, isRTL } = useI18n();
  const { user } = useAuth();
  const { clinicName: savedName, logoBase64: savedLogo } = useClinicSettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoChanged, setLogoChanged] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin =
    user?.role === "doctor" || user?.role === "receptionist";

  const displayName = name !== "" ? name : savedName;
  const displayLogo = logoChanged ? logoPreview : savedLogo;

  const mutation = useMutation({
    mutationFn: (payload: { clinicName: string; logoBase64: string | null | undefined }) =>
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
      setFileError(
        lang === "ar"
          ? "يُقبل PNG و JPEG فقط"
          : "Only PNG and JPEG files are accepted"
      );
      return;
    }
    if (file.size > MAX_BYTES) {
      setFileError(
        lang === "ar"
          ? "الحجم الأقصى للملف هو 1 MB"
          : "Maximum logo size is 1 MB"
      );
      return;
    }
    const b64 = await readFileAsBase64(file);
    setLogoPreview(b64);
    setLogoChanged(true);
  }, [lang]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  };

  const handleRemoveLogo = () => {
    setLogoPreview(null);
    setLogoChanged(true);
    setFileError("");
  };

  const handleSave = () => {
    const payload: { clinicName: string; logoBase64?: string | null } = {
      clinicName: displayName.trim() || savedName,
    };
    if (logoChanged) {
      payload.logoBase64 = logoPreview;
    }
    mutation.mutate(payload as { clinicName: string; logoBase64: string | null | undefined });
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
            "Configure your medical center's identity across the platform",
            "ضبط هوية المركز الطبي عبر المنصة"
          )}
        </p>
      </div>

      {/* Live preview strip */}
      <Card className="border border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">
            {tr("Live Preview", "معاينة فورية")}
          </p>
          <div className={cn("flex items-center gap-3", isRTL && "flex-row-reverse")}>
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center overflow-hidden shrink-0">
              {displayLogo ? (
                <img
                  src={displayLogo}
                  alt="logo"
                  className="w-full h-full object-cover"
                />
              ) : (
                <Stethoscope className="w-5 h-5 text-primary-foreground" />
              )}
            </div>
            <span className="font-bold text-lg tracking-tight">{displayName}</span>
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
              "This name appears in the sidebar, login screen, and on all printed documents.",
              "يظهر هذا الاسم في الشريط الجانبي وشاشة تسجيل الدخول وعلى جميع المستندات المطبوعة."
            )}
          </Label>
          <Input
            id="clinic-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={savedName}
            className={cn("max-w-md", isRTL && "text-right")}
          />
          <p className="text-xs text-muted-foreground">
            {tr("Current:", "الحالي:")} <span className="font-medium text-foreground">{savedName}</span>
          </p>
        </CardContent>
      </Card>

      {/* Logo Upload */}
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
            {/* Drop zone */}
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

            {/* Current / preview */}
            <div className="flex flex-col items-center gap-2">
              <p className="text-xs text-muted-foreground font-medium">
                {logoChanged
                  ? tr("New Logo Preview", "معاينة الشعار الجديد")
                  : tr("Current Logo", "الشعار الحالي")}
              </p>
              <div className="w-24 h-24 rounded-xl bg-primary/10 border border-border flex items-center justify-center overflow-hidden relative group">
                {displayLogo ? (
                  <>
                    <img
                      src={displayLogo}
                      alt="logo preview"
                      className="w-full h-full object-contain p-1"
                    />
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRemoveLogo(); }}
                      className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-xl"
                    >
                      <X className="w-5 h-5 text-white" />
                    </button>
                  </>
                ) : (
                  <Stethoscope className="w-10 h-10 text-primary/40" />
                )}
              </div>
              {displayLogo && (
                <button
                  onClick={handleRemoveLogo}
                  className="text-xs text-destructive hover:underline flex items-center gap-1"
                >
                  <X className="w-3 h-3" />
                  {tr("Remove logo", "حذف الشعار")}
                </button>
              )}
              {!displayLogo && (
                <p className="text-xs text-muted-foreground">
                  {tr("Default icon", "أيقونة افتراضية")}
                </p>
              )}
            </div>
          </div>

          {/* File error */}
          {fileError && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {fileError}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save */}
      <div className={cn("flex items-center gap-3", isRTL && "flex-row-reverse")}>
        <Button
          onClick={handleSave}
          disabled={mutation.isPending}
          className="gap-2"
        >
          <Save className="w-4 h-4" />
          {mutation.isPending
            ? tr("Saving…", "جارٍ الحفظ…")
            : tr("Save Settings", "حفظ الإعدادات")}
        </Button>

        {mutation.isSuccess && (
          <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
            <CheckCircle2 className="w-4 h-4" />
            {tr("Saved successfully", "تم الحفظ بنجاح")}
          </span>
        )}

        {mutation.isError && (
          <span className="flex items-center gap-1.5 text-sm text-destructive font-medium">
            <AlertCircle className="w-4 h-4" />
            {mutation.error?.message ?? tr("Save failed", "فشل الحفظ")}
          </span>
        )}
      </div>
    </div>
  );
}
