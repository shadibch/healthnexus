import { createContext, useContext, useCallback, type ReactNode } from "react";
import { useAuth, type AppRole } from "./auth";

export type Role = AppRole;

type RoleContextType = {
  role: Role;
  roles: AppRole[];
  hasRole: (...rs: AppRole[]) => boolean;
};

const RoleContext = createContext<RoleContextType>({
  role: "pending",
  roles: [],
  hasRole: () => false,
});

export function RoleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const roles: AppRole[] = user?.roles ?? [];
  const role: Role = user?.role ?? "pending";

  const hasRole = useCallback(
    (...rs: AppRole[]) => rs.some(r => roles.includes(r)),
    [roles],
  );

  return (
    <RoleContext.Provider value={{ role, roles, hasRole }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  return useContext(RoleContext);
}
