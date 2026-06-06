import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useClinicSettings } from "@/lib/clinic-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Stethoscope, Eye, EyeOff, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const DEMO_ACCOUNTS = [
  {
    role: "doctor" as const,
    email: "doctor@clinicflow.ae",
    password: "doctor123",
    name: "Dr. Ahmed Al-Rashidi",
    nameAr: "د. أحمد الراشدي",
    title: "Cardiologist",
    titleAr: "طبيب قلب",
    color: "bg-emerald-50 border-emerald-200 hover:bg-emerald-100",
    dot: "bg-emerald-500",
  },
  {
    role: "patient" as const,
    email: "patient@clinicflow.ae",
    password: "patient123",
    name: "Mohammed Al-Sayed",
    nameAr: "محمد السيد",
    title: "Patient",
    titleAr: "مريض",
    color: "bg-blue-50 border-blue-200 hover:bg-blue-100",
    dot: "bg-blue-500",
  },
  {
    role: "pharmacy" as const,
    email: "pharmacy@clinicflow.ae",
    password: "pharmacy123",
    name: "Pharmacy Staff",
    nameAr: "موظف الصيدلية",
    title: "Head Pharmacist",
    titleAr: "رئيس الصيادلة",
    color: "bg-purple-50 border-purple-200 hover:bg-purple-100",
    dot: "bg-purple-500",
  },
  {
    role: "receptionist" as const,
    email: "reception@clinicflow.ae",
    password: "reception123",
    name: "Sara Al-Mansouri",
    nameAr: "سارة المنصوري",
    title: "Head Receptionist",
    titleAr: "رئيسة الاستقبال",
    color: "bg-orange-50 border-orange-200 hover:bg-orange-100",
    dot: "bg-orange-500",
  },
];

export default function LoginPage() {
  const { login } = useAuth();
  const { t, lang, setLang, isRTL } = useI18n();
  const { clinicName, logoBase64 } = useClinicSettings();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch {
      setError(t("invalidCredentials"));
    } finally {
      setLoading(false);
    }
  };

  const fillAccount = (acc: (typeof DEMO_ACCOUNTS)[0]) => {
    setEmail(acc.email);
    setPassword(acc.password);
    setError("");
  };

  return (
    <div className={cn("min-h-screen bg-gradient-to-br from-primary/5 via-background to-primary/10 flex items-center justify-center p-4", isRTL && "font-arabic")}>
      <div className="w-full max-w-md space-y-4">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary shadow-lg mb-2 overflow-hidden">
            {logoBase64 ? (
              <img src={logoBase64} alt="logo" className="w-full h-full object-cover" />
            ) : (
              <Stethoscope className="w-7 h-7 text-primary-foreground" />
            )}
          </div>
          <h1 className="text-3xl font-bold text-foreground">{clinicName}</h1>
          <p className="text-muted-foreground text-sm">{t("signInSubtitle")}</p>
        </div>

        {/* Language toggle */}
        <div className="flex justify-center">
          <div className="flex items-center bg-muted rounded-lg p-0.5 gap-0.5">
            <button
              onClick={() => setLang("en")}
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
                lang === "en" ? "bg-background shadow text-foreground" : "text-muted-foreground"
              )}
            >
              English
            </button>
            <button
              onClick={() => setLang("ar")}
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
                lang === "ar" ? "bg-background shadow text-foreground" : "text-muted-foreground"
              )}
            >
              العربية
            </button>
          </div>
        </div>

        {/* Login form */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{t("signIn")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <Label className="text-xs font-medium">{t("emailAddress")}</Label>
                <Input
                  className="mt-1"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@clinicflow.ae"
                  dir="ltr"
                />
              </div>
              <div>
                <Label className="text-xs font-medium">{t("password")}</Label>
                <div className="relative mt-1">
                  <Input
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={isRTL ? "pl-10" : "pr-10"}
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className={cn(
                      "absolute top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground",
                      isRTL ? "left-3" : "right-3"
                    )}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              <Button type="submit" className="w-full" disabled={loading || !email || !password}>
                {loading ? t("signingIn") : t("signIn")}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Demo accounts */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-2 text-center uppercase tracking-wide">
            {t("demoCredentials")}
          </p>
          <div className="space-y-2">
            {DEMO_ACCOUNTS.map((acc) => (
              <button
                key={acc.role}
                onClick={() => fillAccount(acc)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors",
                  acc.color,
                  isRTL && "text-right flex-row-reverse"
                )}
              >
                <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", acc.dot)} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {lang === "ar" ? acc.nameAr : acc.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {lang === "ar" ? acc.titleAr : acc.title} · {acc.email}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs text-muted-foreground font-mono bg-white/60 px-2 py-0.5 rounded border">
                    {acc.password}
                  </span>
                  <ChevronRight className={cn("w-3.5 h-3.5 text-muted-foreground", isRTL && "rotate-180")} />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
