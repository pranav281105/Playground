import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "./AuthContext";

export function ProtectedRoute() {
  const { token, user, initializing } = useAuth();
  const location = useLocation();

  if (initializing) {
    return <main className="container"><div className="card">Loading session...</div></main>;
  }

  if (!token || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
