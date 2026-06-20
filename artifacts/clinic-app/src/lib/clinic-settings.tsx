import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";

export interface ClinicSettings {
  clinicName: string;
  logoBase64: string | null;
  // Physical address
  address: string | null;
  city: string | null;
  country: string | null;
  // GPS coordinates — null until configured; ready to pass into Google Maps / embed links
  latitude: number | null;
  longitude: number | null;
  // Currency code used for all monetary displays (e.g. "AED", "SAR", "USD")
  currency: string;
}

const DEFAULTS: ClinicSettings = {
  clinicName: "HealthNexus Medical Center",
  logoBase64: null,
  address: null,
  city: null,
  country: null,
  latitude: null,
  longitude: null,
  currency: "AED",
};

export const CLINIC_SETTINGS_QUERY_KEY = ["clinic-settings"] as const;

export function useClinicSettings(): ClinicSettings & { isLoading: boolean } {
  const { data, isLoading } = useQuery<ClinicSettings>({
    queryKey: CLINIC_SETTINGS_QUERY_KEY,
    queryFn: () => apiFetch<ClinicSettings>("/settings"),
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  return { ...(data ?? DEFAULTS), isLoading };
}
