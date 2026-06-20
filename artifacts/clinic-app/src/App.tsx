import { useEffect, useRef } from "react";
import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RoleProvider } from "@/lib/role";
import { AuthProvider, useAuth } from "@/lib/auth";
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
import AdminPage from "@/pages/admin";
import ChangePasswordPage from "@/pages/change-password";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: 1 } },
});

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || "/" : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
    socialButtonsPlacement: "bottom" as const,
  },
  variables: {
    colorPrimary: "hsl(165, 75%, 35%)",
    colorForeground: "hsl(160, 30%, 15%)",
    colorMutedForeground: "hsl(160, 15%, 45%)",
    colorDanger: "hsl(0, 84%, 60%)",
    colorBackground: "hsl(160, 20%, 99%)",
    colorInput: "hsl(160, 15%, 90%)",
    colorInputForeground: "hsl(160, 30%, 15%)",
    colorNeutral: "hsl(160, 15%, 70%)",
    fontFamily: "'Inter', sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden shadow-lg",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-slate-900 font-bold",
    headerSubtitle: "text-slate-500",
    socialButtonsBlockButtonText: "text-slate-700 font-medium",
    formFieldLabel: "text-slate-700 font-medium",
    footerActionLink: "text-emerald-600 font-medium hover:text-emerald-700",
    footerActionText: "text-slate-500",
    dividerText: "text-slate-400",
    identityPreviewEditButton: "text-emerald-600",
    formFieldSuccessText: "text-emerald-600",
    alertText: "text-slate-700",
    logoBox: "mb-2",
    logoImage: "h-10",
    socialButtonsBlockButton: "border border-slate-200 hover:bg-slate-50",
    formButtonPrimary: "bg-emerald-600 hover:bg-emerald-700 text-white font-medium",
    formFieldInput: "border-slate-200 focus:border-emerald-500 focus:ring-emerald-500",
    footerAction: "border-t border-slate-100",
    dividerLine: "bg-slate-200",
    alert: "bg-red-50 border border-red-200",
    otpCodeFieldInput: "border-slate-200 focus:border-emerald-500",
    formFieldRow: "mb-3",
    main: "p-6",
  },
};

function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function rootPage(roles: string[]) {
  const has = (...rs: string[]) => rs.some(r => roles.includes(r));
  // Pure receptionist (not also a doctor) → reception-focused home
  if (has("receptionist") && !has("doctor", "admin")) return <ReceptionPage />;
  // Pure admin (not also a doctor) → admin home
  if (has("admin") && !has("doctor")) return <AdminPage />;
  // Everyone else (doctor, patient, multi-role with doctor) → dashboard
  return <DashboardPage />;
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 animate-pulse" />
          <p className="text-sm text-muted-foreground">Authenticating...</p>
        </div>
      </div>
    );
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
          <Route path="/admin" component={AdminPage} />
          <Route component={NotFound} />
        </Switch>
      </Layout>
    </RoleProvider>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome to HealthNexus",
            subtitle: "Sign in to access your clinic dashboard",
          },
        },
        signUp: {
          start: {
            title: "Join HealthNexus",
            subtitle: "Create your account to get started",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <I18nProvider>
            <Switch>
              <Route path="/sign-in/*?" component={SignInPage} />
              <Route path="/sign-up/*?" component={SignUpPage} />
              <Route component={HomeRedirect} />
            </Switch>
            <Toaster />
          </I18nProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
