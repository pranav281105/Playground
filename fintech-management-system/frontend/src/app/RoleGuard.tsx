import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "../features/auth/AuthContext";

export function RoleGuard({ role }: { role: "admin" | "branch_manager" }) {
  const { user } = useAuth();
  if (!user || user.role !== role) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
}
