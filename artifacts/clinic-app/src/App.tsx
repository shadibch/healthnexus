import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RoleProvider } from "@/lib/role";
import { AuthProvider, useAuth } from "@/lib/auth";
import { I18nProvider } from "@/lib/i18n";
import Layout from "@/components/Layout";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import PatientsPage from "@/pages/patients";
import QueuePage from "@/pages/queue";
import ConsultationsPage from "@/pages/consultations";
import PrescriptionsPage from "@/pages/prescriptions";
import StockPage from "@/pages/stock";
import AppointmentsPage from "@/pages/appointments";
import EncounterPage from "@/pages/encounter";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
    },
  },
});

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
    return <LoginPage />;
  }

  return (
    <RoleProvider initialRole={user.role}>
      <Layout>
        <Switch>
          <Route path="/" component={DashboardPage} />
          <Route path="/patients" component={PatientsPage} />
          <Route path="/queue" component={QueuePage} />
          <Route path="/encounter/:appointmentId" component={EncounterPage} />
          <Route path="/consultations" component={ConsultationsPage} />
          <Route path="/prescriptions" component={PrescriptionsPage} />
          <Route path="/stock" component={StockPage} />
          <Route path="/appointments" component={AppointmentsPage} />
          <Route component={NotFound} />
        </Switch>
      </Layout>
    </RoleProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <I18nProvider>
          <AuthProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <AppRoutes />
            </WouterRouter>
            <Toaster />
          </AuthProvider>
        </I18nProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
