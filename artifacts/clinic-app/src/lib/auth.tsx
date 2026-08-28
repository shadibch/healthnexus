import { createContext, useContext, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";

export type AppRole = "admin" | "doctor" | "patient" | "pharmacist" | "pharmacy" | "receptionist" | "pending";

export interface AuthUser {
  userId: number;
  /** Primary (highest-priority) role — for display */
  role: AppRole;
  /** All roles this user holds */
  roles: AppRole[];
  name: string;
  email: string;
  onboardingComplete: boolean;
  medicalCenterId: number | null;
  doctorDbId: number | null;
  patientDbId: number | null;
  aiAssistantEnabled: boolean;
  subscriptionPlan: string;
  emailVerified: boolean;
  mustChangePassword: boolean;
  deactivated: boolean;
}

type AuthContextType = {
  user: AuthUser | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextType>({ user: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["auth-me"],
    queryFn: async () => {
      try {
        return await apiFetch<AuthUser>("/auth/me");
      } catch {
        // 401 → not signed in
        return null;
      }
    },
    staleTime: 30_000,
  });

  return (
    <AuthContext.Provider value={{ user: user ?? null, loading: isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

/** Sign out on the server and reset all cached queries */
export async function signOutAndReset(qc: ReturnType<typeof useQueryClient>): Promise<void> {
  try {
    await apiFetch("/auth/logout", { method: "POST" });
  } catch {
    // already logged out or network error — proceed with local reset
  }
  qc.clear();
}
