import { createContext, useContext, type ReactNode } from "react";
import { useAuth, type AppRole } from "./auth";

export type Role = AppRole;

const RoleContext = createContext<{ role: Role }>({ role: "pending" });

export function RoleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const role: Role = user?.role ?? "pending";
  return <RoleContext.Provider value={{ role }}>{children}</RoleContext.Provider>;
}

export function useRole() {
  return useContext(RoleContext);
}
