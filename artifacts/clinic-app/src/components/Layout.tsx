import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useRole } from "@/lib/role";
import { useAuth, signOutAndReset } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useNavBadges } from "@/hooks/use-badges";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  CalendarClock,
  FileText,
  Pill,
  Package,
  Stethoscope,
  LogOut,
  Globe,
  User,
  ShieldCheck,
  Map,
  FlaskConical,
  BarChart2,
  Settings,
  Building2,
  Bell,
  Pencil,
  Check,
  X,
  FileSearch,
  MessageSquare,
} from "lucide-react";
import { useClinicSettings } from "@/lib/clinic-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AppRole } from "@/lib/auth";
import type { LucideIcon } from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge: number;
  badgeVariant: "red" | "amber";
};

const ROLE_DOT: Record<string, string> = {
  doctor:       "bg-emerald-500",
  patient:      "bg-blue-500",
  pharmacy:     "bg-purple-500",
  pharmacist:   "bg-purple-500",
  receptionist: "bg-orange-500",
  admin:        "bg-blue-700",
  pending:      "bg-slate-400",
};

const ROLE_BADGE: Record<string, string> = {
  doctor:       "bg-emerald-100 text-emerald-800",
  patient:      "bg-blue-100 text-blue-800",
  pharmacy:     "bg-purple-100 text-purple-800",
  pharmacist:   "bg-purple-100 text-purple-800",
  receptionist: "bg-orange-100 text-orange-800",
  admin:        "bg-blue-100 text-blue-800",
  pending:      "bg-slate-100 text-slate-600",
};

function NavBadge({ count, variant = "red" }: { count: number; variant?: "red" | "amber" }) {
  if (count <= 0) return null;
  return (
    <span className={cn(
      "ml-auto shrink-0 min-w-[1.25rem] h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center leading-none",
      variant === "amber" ? "bg-amber-500 text-white" : "bg-destructive text-destructive-foreground"
    )}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

// Build the unified nav from all roles — deduped, in logical order
function buildNav(
  roles: AppRole[],
  opts: {
    t: (k: string) => string;
    lang: string;
    badges: { queue: number; prescriptions: number; stock: number };
  },
): NavItem[] {
  const { t, lang, badges } = opts;
  const has = (...rs: string[]) => rs.some(r => roles.includes(r as AppRole));

  const seen = new Set<string>();
  const items: NavItem[] = [];
  const add = (item: NavItem) => {
    if (!seen.has(item.href)) {
      seen.add(item.href);
      items.push(item);
    }
  };

  // ── Dashboard (always) ─────────────────────────────────────────────────────
  add({ href: "/", label: t("dashboard"), icon: LayoutDashboard, badge: 0, badgeVariant: "red" });

  // ── Admin panel ────────────────────────────────────────────────────────────
  if (has("admin")) {
    add({ href: "/admin", label: lang === "ar" ? "إدارة الموظفين" : "Staff & Admin", icon: Building2, badge: 0, badgeVariant: "red" });
  }

  // ── Clinical staff (doctor + receptionist) ─────────────────────────────────
  if (has("doctor", "receptionist")) {
    add({ href: "/patients",     label: t("patients"),     icon: Users,        badge: 0,            badgeVariant: "red"   });
    add({ href: "/queue",        label: t("todaysQueue"),  icon: CalendarClock, badge: badges.queue, badgeVariant: "amber" });
    add({ href: "/appointments", label: t("appointments"), icon: CalendarClock, badge: 0,            badgeVariant: "red"   });
  }

  // ── Doctor-specific ────────────────────────────────────────────────────────
  if (has("doctor")) {
    add({ href: "/consultations",    label: t("consultations"),                                        icon: Stethoscope,  badge: 0,                    badgeVariant: "red"   });
    add({ href: "/search-encounters", label: lang === "ar" ? "بحث في السجلات" : "Search Encounters",  icon: FileSearch,   badge: 0,                    badgeVariant: "red"   });
    add({ href: "/prescriptions", label: t("prescriptions"),                                    icon: FileText,    badge: badges.prescriptions, badgeVariant: "amber" });
    add({ href: "/medications",   label: t("medications"),                                      icon: FlaskConical, badge: 0,                   badgeVariant: "red"   });
    add({ href: "/billing",       label: t("billing"),                                          icon: ShieldCheck, badge: 0,                    badgeVariant: "red"   });
    add({ href: "/reports",       label: lang === "ar" ? "التقارير" : "Reports",               icon: BarChart2,   badge: 0,                    badgeVariant: "red"   });
  }

  // ── Receptionist-specific (billing if not already added by doctor) ─────────
  if (has("receptionist") && !has("doctor")) {
    add({ href: "/billing", label: t("billing"), icon: ShieldCheck, badge: 0, badgeVariant: "red" });
  }

  // ── Pharmacy ───────────────────────────────────────────────────────────────
  if (has("pharmacy", "pharmacist")) {
    add({ href: "/prescriptions", label: t("pendingRx"), icon: Pill,    badge: badges.prescriptions, badgeVariant: "amber" });
    add({ href: "/stock",         label: t("stock"),     icon: Package, badge: badges.stock,         badgeVariant: "red"   });
  }

  // ── Patient ────────────────────────────────────────────────────────────────
  if (has("patient")) {
    add({ href: "/appointments",  label: t("myAppointments"),  icon: CalendarClock, badge: 0,                    badgeVariant: "red"   });
    add({ href: "/prescriptions", label: t("myPrescriptions"), icon: FileText,      badge: badges.prescriptions, badgeVariant: "amber" });
    add({ href: "/map",           label: t("findNearby"),      icon: Map,           badge: 0,                    badgeVariant: "red"   });
  }

  // ── Reminders (admin + doctor) ─────────────────────────────────────────────
  if (has("admin", "doctor")) {
    add({ href: "/reminders", label: lang === "ar" ? "التذكيرات" : "Reminders", icon: Bell, badge: 0, badgeVariant: "red" });
  }

  // ── Settings / Feedback (all roles) ────────────────────────────────────────
  add({ href: "/settings", label: lang === "ar" ? "الإعدادات والدعم" : "Settings & Support", icon: Settings, badge: 0, badgeVariant: "red" });
  add({ href: "/feedback", label: lang === "ar" ? "أرسل ملاحظاتك" : "Send your feedback", icon: MessageSquare, badge: 0, badgeVariant: "red" });

  return items;
}

type DoctorProfile = {
  id: number;
  firstName: string;
  lastName: string;
  specialization: string;
};

export default function Layout({ children }: { children: React.ReactNode }) {
  const { role, roles } = useRole();
  const { user } = useAuth();
  const { t, lang, setLang, isRTL } = useI18n();
  const [location, setLocation] = useLocation();
  const badges = useNavBadges();
  const { clinicName, logoBase64 } = useClinicSettings();
  const qc = useQueryClient();

  // Fetch doctor profile for users who have the doctor role
  const { data: doctorProfile } = useQuery<DoctorProfile>({
    queryKey: ["my-doctor-profile", user?.doctorDbId],
    queryFn: () => apiFetch(`/doctors/${user!.doctorDbId}`),
    enabled: !!user?.doctorDbId,
    staleTime: 60_000,
  });

  // Inline name editing state
  const [editingName, setEditingName] = useState(false);
  const [firstNameInput, setFirstNameInput] = useState("");
  const [lastNameInput, setLastNameInput] = useState("");

  const nameMutation = useMutation({
    mutationFn: ({ firstName, lastName }: { firstName: string; lastName: string }) =>
      apiFetch(`/doctors/${user!.doctorDbId}`, {
        method: "PATCH",
        body: JSON.stringify({ firstName, lastName }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-doctor-profile", user?.doctorDbId] });
      setEditingName(false);
    },
  });

  function startEditName() {
    setFirstNameInput(doctorProfile?.firstName ?? "");
    setLastNameInput(doctorProfile?.lastName ?? "");
    setEditingName(true);
  }
  function saveName() {
    const fn = firstNameInput.trim();
    const ln = lastNameInput.trim();
    if (fn) nameMutation.mutate({ firstName: fn, lastName: ln || "-" });
  }

  const ROLE_LABELS: Record<string, string> = {
    doctor:       t("doctorView"),
    patient:      t("patientView"),
    pharmacy:     t("pharmacyView"),
    pharmacist:   t("pharmacyView"),
    receptionist: t("receptionView"),
    admin:        lang === "ar" ? "مدير النظام" : "Admin",
    pending:      lang === "ar" ? "جاري الإعداد" : "Setting up...",
  };

  // Labels for additional roles shown in the sidebar
  const ROLE_SHORT: Record<string, string> = {
    admin:        lang === "ar" ? "مدير"    : "Admin",
    doctor:       lang === "ar" ? "طبيب"    : "Doctor",
    receptionist: lang === "ar" ? "استقبال" : "Reception",
    pharmacist:   lang === "ar" ? "صيدلاني" : "Pharmacist",
    pharmacy:     lang === "ar" ? "صيدلية"  : "Pharmacy",
    patient:      lang === "ar" ? "مريض"    : "Patient",
  };

  const items = buildNav(roles, { t, lang, badges });
  const totalAlerts = badges.prescriptions + badges.stock;

  const handleLogout = async () => {
    await signOutAndReset(qc);
    setLocation("/sign-in");
  };

  // Sidebar role pill — primary role + count of extras
  const extraRoles = roles.filter(r => r !== role);

  const SidebarContent = () => (
    <>
      <div className={cn("flex items-center gap-2.5 px-5 h-16 border-b border-border shrink-0", isRTL && "flex-row-reverse")}>
        <div className="relative shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center overflow-hidden">
            {logoBase64 ? (
              <img src={logoBase64} alt="logo" className="w-full h-full object-cover" />
            ) : (
              <Stethoscope className="w-4 h-4 text-primary-foreground" />
            )}
          </div>
          {totalAlerts > 0 && (
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-destructive border-2 border-sidebar animate-pulse" />
          )}
        </div>
        <span className="font-bold text-lg tracking-tight text-sidebar-foreground">{clinicName}</span>
      </div>

      <div className="px-3 pt-3 pb-1 space-y-1">
        {/* Primary role badge */}
        <div className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium",
          ROLE_BADGE[role] ?? "bg-slate-100 text-slate-600", isRTL && "flex-row-reverse"
        )}>
          <span className={cn("w-2 h-2 rounded-full shrink-0", ROLE_DOT[role] ?? "bg-slate-400")} />
          {ROLE_LABELS[role] ?? role}
        </div>
        {/* Extra role tags — shown if user has multiple roles */}
        {extraRoles.length > 0 && (
          <div className={cn("flex flex-wrap gap-1 px-3", isRTL && "flex-row-reverse")}>
            {extraRoles.map(r => (
              <span
                key={r}
                className={cn(
                  "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                  ROLE_BADGE[r] ?? "bg-slate-100 text-slate-600"
                )}
              >
                {ROLE_SHORT[r] ?? r}
              </span>
            ))}
          </div>
        )}

        {/* ── Doctor profile card ── */}
        {doctorProfile && (
          <div className="mx-3 mt-2 rounded-lg border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/30 dark:border-emerald-800 p-3 space-y-1.5">
            {/* Name row */}
            {editingName ? (
              <div className="space-y-1">
                <div className="flex gap-1">
                  <Input
                    value={firstNameInput}
                    onChange={e => setFirstNameInput(e.target.value)}
                    placeholder="First"
                    className="h-6 text-xs px-1.5 flex-1 min-w-0"
                    autoFocus
                    onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                  />
                  <Input
                    value={lastNameInput}
                    onChange={e => setLastNameInput(e.target.value)}
                    placeholder="Last"
                    className="h-6 text-xs px-1.5 flex-1 min-w-0"
                    onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                  />
                </div>
                <div className="flex gap-1">
                  <button onClick={saveName} disabled={nameMutation.isPending} className="text-[10px] flex items-center gap-0.5 text-emerald-600 hover:text-emerald-700 font-medium">
                    <Check className="w-3 h-3" /> Save
                  </button>
                  <button onClick={() => setEditingName(false)} className="text-[10px] flex items-center gap-0.5 text-muted-foreground hover:text-foreground ml-2">
                    <X className="w-3 h-3" /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className={cn("flex items-center gap-1 group", isRTL && "flex-row-reverse")}>
                <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300 truncate flex-1">
                  Dr. {doctorProfile.firstName} {doctorProfile.lastName}
                </p>
                <button
                  onClick={startEditName}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground shrink-0"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </div>
            )}
            <p className={cn("text-[11px] text-muted-foreground truncate", isRTL && "text-right")}>
              {doctorProfile.specialization}
            </p>
          </div>
        )}
      </div>

      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
        {items.map(({ href, label, icon: Icon, badge, badgeVariant }) => {
          const active = href === "/" ? location === "/" : location.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isRTL && "flex-row-reverse",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1 min-w-0 truncate">{label}</span>
              <NavBadge count={badge} variant={badgeVariant} />
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-3 pt-2 space-y-1 border-t border-border">
        {user && (
          <div className={cn("flex items-center gap-2 px-2 py-2 rounded-lg bg-muted/30 mb-1", isRTL && "flex-row-reverse")}>
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 relative">
              <User className="w-3.5 h-3.5 text-primary" />
              <span className={cn("absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-sidebar", ROLE_DOT[role] ?? "bg-slate-400")} />
            </div>
            <div className={cn("flex-1 min-w-0", isRTL && "text-right")}>
              <p className="text-xs font-semibold truncate text-sidebar-foreground">{user.name}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
          </div>
        )}

        <button
          onClick={() => setLang(lang === "en" ? "ar" : "en")}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:bg-sidebar-accent/50 transition-colors",
            isRTL && "flex-row-reverse"
          )}
        >
          <Globe className="w-3.5 h-3.5 shrink-0" />
          {lang === "en" ? "العربية" : "English"}
        </button>

        <button
          onClick={handleLogout}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors",
            isRTL && "flex-row-reverse"
          )}
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" />
          {t("logout")}
        </button>
      </div>

      <div className={cn("px-4 py-2 text-xs text-muted-foreground border-t border-border", isRTL && "text-right")}>
        {t("version")}
      </div>
    </>
  );

  return (
    <div className={cn("flex h-screen overflow-hidden bg-background", isRTL && "font-arabic")} dir={isRTL ? "rtl" : "ltr"}>
      <aside className="hidden md:flex flex-col w-64 border-r border-border bg-sidebar shrink-0">
        <SidebarContent />
      </aside>

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <header className="h-14 border-b border-border bg-background flex items-center justify-between px-4 shrink-0 md:hidden">
          <div className={cn("flex items-center gap-2", isRTL && "flex-row-reverse")}>
            <div className="relative">
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                <Stethoscope className="w-3.5 h-3.5 text-primary-foreground" />
              </div>
              {totalAlerts > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-destructive border-2 border-background animate-pulse" />
              )}
            </div>
            <span className="font-bold text-base">{t("appName")}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setLang(lang === "en" ? "ar" : "en")} className="text-xs px-2">
              {lang === "en" ? "ع" : "EN"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleLogout} className="gap-1 text-xs">
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          </div>
        </header>

        <div className="md:hidden border-b border-border bg-background overflow-x-auto">
          <nav className="flex px-2 py-1.5 gap-0.5">
            {items.map(({ href, label, icon: Icon, badge, badgeVariant }) => {
              const active = href === "/" ? location === "/" : location.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors",
                    active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                  {badge > 0 && (
                    <span className={cn(
                      "min-w-[1rem] h-4 px-0.5 rounded-full text-[9px] font-bold flex items-center justify-center",
                      badgeVariant === "amber" ? "bg-amber-500 text-white" : "bg-destructive text-destructive-foreground"
                    )}>
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
