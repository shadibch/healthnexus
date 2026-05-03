import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

interface DashboardStats {
  prescriptionsPending: number;
  appointmentsPending: number;
  lowStockAlerts: number;
}

export interface NavBadges {
  prescriptions: number;
  queue: number;
  stock: number;
}

export function useNavBadges(): NavBadges {
  const { data } = useQuery<DashboardStats>({
    queryKey: ["dashboard-stats"],
    queryFn: () => apiFetch("/dashboard/stats"),
    refetchInterval: 20_000,
    staleTime: 10_000,
  });

  return {
    prescriptions: data?.prescriptionsPending ?? 0,
    queue: data?.appointmentsPending ?? 0,
    stock: data?.lowStockAlerts ?? 0,
  };
}
