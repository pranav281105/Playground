import { NavLink, Outlet } from "react-router-dom";

import { useAuth } from "../features/auth/AuthContext";

function navClassName({ isActive }: { isActive: boolean }) {
  return isActive ? "active" : "";
}

export function ProtectedLayout() {
  const { user, logout } = useAuth();

  return (
    <main className="container">
      <header className="app-header">
        <div>
          <h1>FinTech Management System</h1>
          <p>Protected operations console for branch finance workflows.</p>
        </div>
        <div className="session-card">
          <p>{user?.name}</p>
          <p>{user?.email}</p>
          <p>{user?.role === "admin" ? "Admin" : "Branch Manager"}</p>
          <button type="button" onClick={logout}>Sign out</button>
        </div>
      </header>

      <nav className="nav">
        <NavLink className={navClassName} to="/dashboard">Dashboard</NavLink>
        <NavLink className={navClassName} to="/invoices">Invoices</NavLink>
        <NavLink className={navClassName} to="/reports">Reports</NavLink>
      </nav>

      <Outlet />
    </main>
  );
}
