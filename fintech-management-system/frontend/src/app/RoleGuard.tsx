import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "../features/auth/AuthContext";
import type { UserRole } from "../lib/types";

export function RoleGuard({ roles }: { roles: UserRole[] }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
}
