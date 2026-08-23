import { useState } from "react";
import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { RoleProvider } from "@/lib/role";
import { AuthProvider, useAuth, type AuthUser } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { I18nProvider } from "@/lib/i18n";
import Layout from "@/components/Layout";
import OnboardingPage from "@/pages/onboarding";
import DashboardPage from "@/pages/dashboard";
import ReceptionPage from "@/pages/reception";
import PatientsPage from "@/pages/patients";
import QueuePage from "@/pages/queue";
import ConsultationsPage from "@/pages/consultations";
import PrescriptionsPage from "@/pages/prescriptions";
import StockPage from "@/pages/stock";
import AppointmentsPage from "@/pages/appointments";
import EncounterPage from "@/pages/encounter";
import BillingPage from "@/pages/billing";
import MedicationsPage from "@/pages/medications";
import MapPage from "@/pages/map";
import ReportsPage from "@/pages/reports";
import SettingsPage from "@/pages/settings";
import RemindersPage from "@/pages/reminders";
import SearchEncountersPage from "@/pages/search-encounters";
import AdminPage from "@/pages/admin";
import ChangePasswordPage from "@/pages/change-password";
import NotFound from "@/pages/not-found";
import { Stethoscope, Loader2, LogIn, UserPlus, Eye, EyeOff } from "lucide-react";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: 1 } },
});

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function rootPage(roles: string[]) {
  const has = (...rs: string[]) => rs.some(r => roles.includes(r));
  // Pure receptionist (not also a doctor) → reception-focused home
  if (has("receptionist") && !has("doctor", "admin")) return <ReceptionPage />;
  // Pure admin (not also a doctor) → admin home
  if (has("admin") && !has("doctor")) return <AdminPage />;
  // Everyone else (doctor, patient, multi-role with doctor) → dashboard
  return <DashboardPage />;
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 px-4">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mx-auto">
            <Stethoscope className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">HealthNexus</h1>
          <p className="text-sm text-slate-500">Sign in to access your clinic dashboard</p>
        </div>
        {children}
      </div>
    </div>
  );
}

function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className={`pr-10 ${props.className ?? ""}`} />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow(v => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

function SignInPage() {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const user = await apiFetch<AuthUser>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      qc.setQueryData(["auth-me"], user);
      setLocation("/");
    } catch (err: any) {
      setError(err?.message || "Invalid email or password");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell>
      <Card className="shadow-lg">
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@clinic.com"
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <PasswordInput
                id="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Your password"
                required
                autoComplete="current-password"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={!email || !password || pending}>
              {pending
                ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Signing in…</>
                : <><LogIn className="w-4 h-4 mr-2" />Sign In</>}
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="text-center text-sm text-slate-500">
        Don&apos;t have an account?{" "}
        <a href={`${basePath}/sign-up`} className="font-medium text-emerald-600 hover:text-emerald-700">Create one</a>
      </p>
    </AuthShell>
  );
}

function SignUpPage() {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setPending(true);
    try {
      const user = await apiFetch<AuthUser>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ name: name || undefined, email, password }),
      });
      qc.setQueryData(["auth-me"], user);
      setLocation("/");
    } catch (err: any) {
      setError(err?.message || "Failed to create account");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell>
      <Card className="shadow-lg">
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="su-email">Email</Label>
              <Input
                id="su-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@clinic.com"
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="su-password">Password</Label>
              <PasswordInput
                id="su-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                autoComplete="new-password"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={!email || !password || pending}>
              {pending
                ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Creating account…</>
                : <><UserPlus className="w-4 h-4 mr-2" />Create Account</>}
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="text-center text-sm text-slate-500">
        Already have an account?{" "}
        <a href={`${basePath}/sign-in`} className="font-medium text-emerald-600 hover:text-emerald-700">Sign in</a>
      </p>
    </AuthShell>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 animate-pulse" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/sign-in" />;
  }

  // Deactivated account
  if (user.deactivated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center max-w-sm space-y-3">
          <div className="text-5xl">🚫</div>
          <h1 className="text-xl font-bold text-foreground">Account Deactivated</h1>
          <p className="text-sm text-muted-foreground">
            Your account has been deactivated by an administrator. Please contact your clinic admin for assistance.
          </p>
        </div>
      </div>
    );
  }

  // Must change temporary password before accessing anything else
  if (user.mustChangePassword) {
    return <ChangePasswordPage />;
  }

  // Needs onboarding if not complete or no roles assigned yet
  if (!user.onboardingComplete || user.roles.length === 0) {
    return (
      <I18nProvider>
        <OnboardingPage />
      </I18nProvider>
    );
  }

  return (
    <RoleProvider>
      <Layout>
        <Switch>
          <Route path="/">
            {rootPage(user.roles)}
          </Route>
          <Route path="/patients" component={PatientsPage} />
          <Route path="/queue" component={QueuePage} />
          <Route path="/encounter/:appointmentId" component={EncounterPage} />
          <Route path="/consultations" component={ConsultationsPage} />
          <Route path="/prescriptions" component={PrescriptionsPage} />
          <Route path="/stock" component={StockPage} />
          <Route path="/appointments" component={AppointmentsPage} />
          <Route path="/billing" component={BillingPage} />
          <Route path="/medications" component={MedicationsPage} />
          <Route path="/map" component={MapPage} />
          <Route path="/reports" component={ReportsPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route path="/reminders" component={RemindersPage} />
          <Route path="/search-encounters" component={SearchEncountersPage} />
          <Route path="/admin" component={AdminPage} />
          <Route component={NotFound} />
        </Switch>
      </Layout>
    </RoleProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <I18nProvider>
              <Switch>
                <Route path="/sign-in/*?" component={SignInPage} />
                <Route path="/sign-up/*?" component={SignUpPage} />
                <Route component={AppRoutes} />
              </Switch>
              <Toaster />
            </I18nProvider>
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </WouterRouter>
  );
}

export default App;
