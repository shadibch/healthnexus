import { createContext, useContext, useState, type ReactNode } from "react";

export type Role = "doctor" | "patient" | "pharmacy" | "receptionist";

const RoleContext = createContext<{
  role: Role;
  setRole: (r: Role) => void;
}>({ role: "doctor", setRole: () => {} });

export function RoleProvider({ children, initialRole }: { children: ReactNode; initialRole?: Role }) {
  const [role, setRole] = useState<Role>(initialRole ?? "doctor");
  return <RoleContext.Provider value={{ role, setRole }}>{children}</RoleContext.Provider>;
}

export function useRole() {
  return useContext(RoleContext);
}
