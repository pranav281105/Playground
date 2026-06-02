import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../features/auth/AuthContext";

export function ProtectedRoute() {
  const { token, user, initializing } = useAuth();
  const location = useLocation();

  if (initializing) {
    return (
      <main className="container">
        <div className="sheet outline">Loading session...</div>
      </main>
    );
  }

  if (!token || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
