import { Link, useLocation } from "wouter";
import { useRole, type Role } from "@/lib/role";
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
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const ROLE_LABELS: Record<Role, string> = {
  doctor: "Doctor",
  patient: "Patient",
  pharmacy: "Pharmacy",
};

const ROLE_COLORS: Record<Role, string> = {
  doctor: "bg-primary text-primary-foreground",
  patient: "bg-blue-600 text-white",
  pharmacy: "bg-purple-600 text-white",
};

function navItems(role: Role) {
  if (role === "doctor") {
    return [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/patients", label: "Patients", icon: Users },
      { href: "/queue", label: "Today's Queue", icon: CalendarClock },
      { href: "/consultations", label: "Consultations", icon: Stethoscope },
      { href: "/prescriptions", label: "Prescriptions", icon: FileText },
    ];
  }
  if (role === "patient") {
    return [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/appointments", label: "My Appointments", icon: CalendarClock },
      { href: "/prescriptions", label: "My Prescriptions", icon: FileText },
    ];
  }
  return [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/prescriptions", label: "Pending Rx", icon: Pill },
    { href: "/stock", label: "Stock", icon: Package },
  ];
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { role, setRole } = useRole();
  const [location] = useLocation();
  const items = navItems(role);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="hidden md:flex flex-col w-60 border-r border-border bg-sidebar shrink-0">
        <div className="flex items-center gap-2 px-5 h-16 border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Stethoscope className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg tracking-tight text-sidebar-foreground">ClinicFlow</span>
        </div>

        <div className="px-3 py-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  ROLE_COLORS[role]
                )}
              >
                <span>{ROLE_LABELS[role]} View</span>
                <ChevronDown className="w-4 h-4 opacity-70" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48">
              {(["doctor", "patient", "pharmacy"] as Role[]).map((r) => (
                <DropdownMenuItem key={r} onClick={() => setRole(r)}>
                  {ROLE_LABELS[r]} View
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

        <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground">
          ClinicFlow v1.0 · MEA Edition
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <header className="h-14 border-b border-border bg-background flex items-center justify-between px-4 shrink-0 md:hidden">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <Stethoscope className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="font-bold text-base">ClinicFlow</span>
          </div>
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
                  {ROLE_LABELS[r]} View
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

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
