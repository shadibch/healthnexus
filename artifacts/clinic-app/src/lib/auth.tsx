import { createContext, useContext, type ReactNode } from "react";
import { useUser } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";

export type AppRole = "admin" | "doctor" | "patient" | "pharmacist" | "pharmacy" | "receptionist" | "pending";

export interface AuthUser {
  userId: number;
  clerkId: string;
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
  mustChangePassword: boolean;
}

type AuthContextType = {
  user: AuthUser | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextType>({ user: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isLoaded: clerkLoaded, isSignedIn } = useUser();

  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["auth-me"],
    queryFn: () => apiFetch<AuthUser>("/auth/me"),
    enabled: clerkLoaded && !!isSignedIn,
    retry: false,
    staleTime: 30_000,
  });

  const loading = !clerkLoaded || (!!isSignedIn && isLoading);

  return (
    <AuthContext.Provider value={{ user: user ?? null, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
