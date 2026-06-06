import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";

export interface ClinicSettings {
  clinicName: string;
  logoBase64: string | null;
}

const DEFAULTS: ClinicSettings = {
  clinicName: "HealthNexus Medical Center",
  logoBase64: null,
};

export const CLINIC_SETTINGS_QUERY_KEY = ["clinic-settings"] as const;

export function useClinicSettings(): ClinicSettings & { isLoading: boolean } {
  const { data, isLoading } = useQuery<ClinicSettings>({
    queryKey: CLINIC_SETTINGS_QUERY_KEY,
    queryFn: () => apiFetch<ClinicSettings>("/settings"),
    staleTime: 5 * 60 * 1000,
    retry: 1,
    // Fetch even if not authenticated — GET /settings is public
    refetchOnWindowFocus: false,
  });
  return { ...(data ?? DEFAULTS), isLoading };
}
