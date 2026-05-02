import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RoleProvider } from "@/lib/role";
import Layout from "@/components/Layout";
import DashboardPage from "@/pages/dashboard";
import PatientsPage from "@/pages/patients";
import QueuePage from "@/pages/queue";
import ConsultationsPage from "@/pages/consultations";
import PrescriptionsPage from "@/pages/prescriptions";
import StockPage from "@/pages/stock";
import AppointmentsPage from "@/pages/appointments";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
    },
  },
});

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/patients" component={PatientsPage} />
        <Route path="/queue" component={QueuePage} />
        <Route path="/consultations" component={ConsultationsPage} />
        <Route path="/prescriptions" component={PrescriptionsPage} />
        <Route path="/stock" component={StockPage} />
        <Route path="/appointments" component={AppointmentsPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RoleProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </RoleProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
