import { Link, useLocation } from "wouter";
import { useRole, type Role } from "@/lib/role";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  CalendarClock,
  FileText,
  Pill,
  Package,
  Stethoscope,
  ChevronDown,
  LogOut,
  Globe,
  User,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const ROLE_COLORS: Record<Role, string> = {
  doctor: "bg-primary text-primary-foreground",
  patient: "bg-blue-600 text-white",
  pharmacy: "bg-purple-600 text-white",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  const { role, setRole } = useRole();
  const { user, logout } = useAuth();
  const { t, lang, setLang, isRTL } = useI18n();
  const [location] = useLocation();

  const ROLE_LABELS: Record<Role, string> = {
    doctor: t("doctorView"),
    patient: t("patientView"),
    pharmacy: t("pharmacyView"),
  };

  function navItems(r: Role) {
    if (r === "doctor") {
      return [
        { href: "/", label: t("dashboard"), icon: LayoutDashboard },
        { href: "/patients", label: t("patients"), icon: Users },
        { href: "/queue", label: t("todaysQueue"), icon: CalendarClock },
        { href: "/consultations", label: t("consultations"), icon: Stethoscope },
        { href: "/prescriptions", label: t("prescriptions"), icon: FileText },
      ];
    }
    if (r === "patient") {
      return [
        { href: "/", label: t("dashboard"), icon: LayoutDashboard },
        { href: "/appointments", label: t("myAppointments"), icon: CalendarClock },
        { href: "/prescriptions", label: t("myPrescriptions"), icon: FileText },
      ];
    }
    return [
      { href: "/", label: t("dashboard"), icon: LayoutDashboard },
      { href: "/prescriptions", label: t("pendingRx"), icon: Pill },
      { href: "/stock", label: t("stock"), icon: Package },
    ];
  }

  const items = navItems(role);

  const SidebarContent = () => (
    <>
      <div className={cn("flex items-center gap-2 px-5 h-16 border-b border-border", isRTL && "flex-row-reverse")}>
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
          <Stethoscope className="w-4 h-4 text-primary-foreground" />
        </div>
        <span className="font-bold text-lg tracking-tight text-sidebar-foreground">{t("appName")}</span>
      </div>

      <div className="px-3 py-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                ROLE_COLORS[role],
                isRTL && "flex-row-reverse"
              )}
            >
              <span>{ROLE_LABELS[role]}</span>
              <ChevronDown className="w-4 h-4 opacity-70" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48">
            {(["doctor", "patient", "pharmacy"] as Role[]).map((r) => (
              <DropdownMenuItem key={r} onClick={() => setRole(r)}>
                {ROLE_LABELS[r]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <nav className="flex-1 px-3 pb-4 space-y-0.5">
        {items.map(({ href, label, icon: Icon }) => {
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
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-3 space-y-1 border-t border-border pt-3">
        {/* User info */}
        {user && (
          <div className={cn("flex items-center gap-2 px-2 py-1.5 mb-1", isRTL && "flex-row-reverse")}>
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <User className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className={cn("flex-1 min-w-0", isRTL && "text-right")}>
              <p className="text-xs font-medium truncate text-sidebar-foreground">{user.name}</p>
              <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
            </div>
          </div>
        )}

        {/* Language switcher */}
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

        {/* Logout */}
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
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <Stethoscope className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="font-bold text-base">{t("appName")}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLang(lang === "en" ? "ar" : "en")}
              className="text-xs px-2"
            >
              {lang === "en" ? "ع" : "EN"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  {ROLE_LABELS[role]}
                  <ChevronDown className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {(["doctor", "patient", "pharmacy"] as Role[]).map((r) => (
                  <DropdownMenuItem key={r} onClick={() => setRole(r)}>
                    {ROLE_LABELS[r]}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="text-destructive">
                  <LogOut className="w-3.5 h-3.5 mr-2" />
                  {t("logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Mobile nav tabs */}
        <div className="md:hidden border-b border-border bg-background overflow-x-auto">
          <nav className="flex px-2 py-1.5 gap-0.5">
            {items.map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? location === "/" : location.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
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
