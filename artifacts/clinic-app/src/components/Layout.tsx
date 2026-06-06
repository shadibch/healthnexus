import { Link, useLocation } from "wouter";
import { useRole, type Role } from "@/lib/role";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useNavBadges } from "@/hooks/use-badges";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";

const ROLE_DOT: Record<Role, string> = {
  doctor:       "bg-emerald-500",
  patient:      "bg-blue-500",
  pharmacy:     "bg-purple-500",
  receptionist: "bg-orange-500",
};

const ROLE_BADGE: Record<Role, string> = {
  doctor:       "bg-emerald-100 text-emerald-800",
  patient:      "bg-blue-100 text-blue-800",
  pharmacy:     "bg-purple-100 text-purple-800",
  receptionist: "bg-orange-100 text-orange-800",
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

export default function Layout({ children }: { children: React.ReactNode }) {
  const { role } = useRole();
  const { user, logout } = useAuth();
  const { t, lang, setLang, isRTL } = useI18n();
  const [location] = useLocation();
  const badges = useNavBadges();

  const ROLE_LABELS: Record<Role, string> = {
    doctor:       t("doctorView"),
    patient:      t("patientView"),
    pharmacy:     t("pharmacyView"),
    receptionist: t("receptionView"),
  };

  function navItems(r: Role) {
    if (r === "receptionist") {
      return [
        { href: "/",             label: t("dashboard"),       icon: LayoutDashboard, badge: 0,            badgeVariant: "red"   as const },
        { href: "/patients",     label: t("patients"),        icon: Users,           badge: 0,            badgeVariant: "red"   as const },
        { href: "/appointments", label: t("appointments"),    icon: CalendarClock,   badge: badges.queue, badgeVariant: "amber" as const },
        { href: "/queue",        label: t("todaysQueue"),     icon: FileText,        badge: badges.queue, badgeVariant: "amber" as const },
        { href: "/billing",      label: t("billing"),         icon: ShieldCheck,     badge: 0,            badgeVariant: "red"   as const },
      ];
    }
    if (r === "doctor") {
      return [
        { href: "/",              label: t("dashboard"),    icon: LayoutDashboard, badge: 0,              badgeVariant: "red"   as const },
        { href: "/patients",      label: t("patients"),     icon: Users,           badge: 0,              badgeVariant: "red"   as const },
        { href: "/queue",         label: t("todaysQueue"),  icon: CalendarClock,   badge: badges.queue,   badgeVariant: "amber" as const },
        { href: "/consultations", label: t("consultations"),icon: Stethoscope,     badge: 0,              badgeVariant: "red"   as const },
        { href: "/prescriptions", label: t("prescriptions"),icon: FileText,        badge: badges.prescriptions, badgeVariant: "amber" as const },
        { href: "/medications",   label: t("medications"),  icon: FlaskConical,    badge: 0,              badgeVariant: "red"   as const },
        { href: "/billing",       label: t("billing"),      icon: ShieldCheck,     badge: 0,              badgeVariant: "red"   as const },
        { href: "/reports",       label: lang === "ar" ? "التقارير" : "Reports", icon: BarChart2, badge: 0, badgeVariant: "red" as const },
      ];
    }
    if (r === "patient") {
      return [
        { href: "/",              label: t("dashboard"),       icon: LayoutDashboard, badge: 0,                    badgeVariant: "red"   as const },
        { href: "/appointments",  label: t("myAppointments"),  icon: CalendarClock,   badge: 0,                    badgeVariant: "red"   as const },
        { href: "/prescriptions", label: t("myPrescriptions"), icon: FileText,        badge: badges.prescriptions, badgeVariant: "amber" as const },
        { href: "/map",           label: t("findNearby"),      icon: Map,             badge: 0,                    badgeVariant: "red"   as const },
      ];
    }
    return [
      { href: "/",              label: t("dashboard"), icon: LayoutDashboard, badge: 0,                 badgeVariant: "red"   as const },
      { href: "/prescriptions", label: t("pendingRx"), icon: Pill,            badge: badges.prescriptions, badgeVariant: "amber" as const },
      { href: "/stock",         label: t("stock"),     icon: Package,         badge: badges.stock,     badgeVariant: "red"   as const },
    ];
  }

  const items = navItems(role);
  const totalAlerts = badges.prescriptions + badges.stock;

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className={cn("flex items-center gap-2.5 px-5 h-16 border-b border-border shrink-0", isRTL && "flex-row-reverse")}>
        <div className="relative shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Stethoscope className="w-4 h-4 text-primary-foreground" />
          </div>
          {totalAlerts > 0 && (
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-destructive border-2 border-sidebar animate-pulse" />
          )}
        </div>
        <span className="font-bold text-lg tracking-tight text-sidebar-foreground">{t("appName")}</span>
      </div>

      {/* Role badge — read-only, reflects login role */}
      <div className="px-3 pt-3 pb-1">
        <div className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium",
          ROLE_BADGE[role], isRTL && "flex-row-reverse"
        )}>
          <span className={cn("w-2 h-2 rounded-full shrink-0", ROLE_DOT[role])} />
          {ROLE_LABELS[role]}
        </div>
      </div>

      {/* Nav */}
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

      {/* Bottom: user + actions */}
      <div className="px-3 pb-3 pt-2 space-y-1 border-t border-border">
        {user && (
          <div className={cn("flex items-center gap-2 px-2 py-2 rounded-lg bg-muted/30 mb-1", isRTL && "flex-row-reverse")}>
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 relative">
              <User className="w-3.5 h-3.5 text-primary" />
              <span className={cn("absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-sidebar", ROLE_DOT[role])} />
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
          onClick={logout}
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
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border bg-sidebar shrink-0">
        <SidebarContent />
      </aside>

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Mobile header */}
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
            <Button variant="outline" size="sm" onClick={logout} className="gap-1 text-xs">
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          </div>
        </header>

        {/* Mobile nav tabs */}
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
