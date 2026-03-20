import { NavLink, Outlet } from "react-router-dom";

import { useAuth } from "../features/auth/AuthContext";

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive ? "active" : "";
}

export function AppShell() {
  const { user, logout } = useAuth();
  const branchLabel = user?.branch_id ?? "Unassigned";

  return (
    <main className="container">
      <header className="app-header">
        <div>
          <h1>FinTech Management System</h1>
          <p>Phase 1 financial operations console.</p>
        </div>
        <div className="session-card">
          <p>{user?.name}</p>
          <p>{user?.email}</p>
          <p>{user?.role === "admin" ? "Admin" : "Branch Manager"}</p>
          <p>
            Branch ID: <code>{branchLabel}</code>
          </p>
          <button type="button" onClick={logout}>Sign out</button>
        </div>
      </header>

      <nav className="nav">
        <NavLink to="/dashboard" className={navClass}>Dashboard</NavLink>
        <NavLink to="/invoices" className={navClass}>Invoices</NavLink>
        <NavLink to="/costs" className={navClass}>Costs</NavLink>
        <NavLink to="/payments" className={navClass}>Payments</NavLink>
        <NavLink to="/customers" className={navClass}>Customers</NavLink>
        <NavLink to="/vendors" className={navClass}>Vendors</NavLink>
        <NavLink to="/reports" className={navClass}>Reports</NavLink>
        {user?.role === "admin" ? <NavLink to="/admin" className={navClass}>Admin</NavLink> : null}
      </nav>

      <Outlet />
    </main>
  );
}
