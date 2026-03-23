import { NavLink, Outlet } from "react-router-dom";

import { useAuth } from "../features/auth/AuthContext";

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive ? "nav-a on" : "nav-a";
}

function initials(name: string | undefined): string {
  if (!name) {
    return "U";
  }
  const chunks = name.trim().split(/\s+/).filter(Boolean);
  if (chunks.length === 0) {
    return "U";
  }
  return chunks
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() ?? "")
    .join("");
}

export function AppShell() {
  const { user, logout } = useAuth();
  const branchLabel = user?.branch_id ?? "Unassigned";
  const roleLabel =
    user?.role === "owner"
      ? "Owner"
      : user?.role === "admin"
        ? "Admin"
        : user?.role === "business_manager"
          ? "Business Manager"
          : "Branch Manager";

  return (
    <main className="app-shell">
      <header className="hdr">
        <NavLink className="hdr-logo" to="/dashboard" title="FinTech Management System">
          <div className="hdr-mark">
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
              <path d="M2 6h8M6 2v8" />
            </svg>
          </div>
          <div>
            <span className="hdr-ns">FinTech MS</span>
            <span className="hdr-sub">Phase 1 Console</span>
          </div>
        </NavLink>

        <nav className="hdr-nav">
          <NavLink to="/dashboard" className={navClass}>Dashboard</NavLink>
          <NavLink to="/invoices" className={navClass}>Invoices</NavLink>
          <NavLink to="/costs" className={navClass}>Costs</NavLink>
          <NavLink to="/payments" className={navClass}>Payments</NavLink>
          <NavLink to="/customers" className={navClass}>Customers</NavLink>
          <NavLink to="/vendors" className={navClass}>Vendors</NavLink>
          <NavLink to="/reports" className={navClass}>Reports</NavLink>
          {user?.role === "admin" || user?.role === "owner" ? <NavLink to="/admin" className={navClass}>Admin</NavLink> : null}
        </nav>

        <div className="hdr-r">
          <div className="hdr-user">
            <div className="av">{initials(user?.name)}</div>
            <div>
              <span className="hdr-uname">{user?.name ?? "User"}</span>
              <span className="hdr-umeta">{`${roleLabel} · ${branchLabel}`}</span>
            </div>
          </div>
          <div className="hdr-sep" />
          <button type="button" className="hdr-out" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      <div className="page">
        <Outlet />
      </div>
    </main>
  );
}
