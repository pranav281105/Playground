import { useState } from "react";

import { AuthProvider } from "../features/auth/AuthContext";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { InvoicesPage } from "../features/invoices/InvoicesPage";
import { ReportsPage } from "../features/reports/ReportsPage";

type View = "dashboard" | "invoices" | "reports";

export function App() {
  return (
    <AuthProvider>
      <RootLayout />
    </AuthProvider>
  );
}

function RootLayout() {
  const [view, setView] = useState<View>("dashboard");

  return (
    <main className="container">
      <h1>FinTech Management System</h1>
      <p>Phase 1 MVP console for branch finance operations.</p>

      <nav className="nav">
        <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>Dashboard</button>
        <button className={view === "invoices" ? "active" : ""} onClick={() => setView("invoices")}>Invoices</button>
        <button className={view === "reports" ? "active" : ""} onClick={() => setView("reports")}>Reports</button>
      </nav>

      {view === "dashboard" ? <DashboardPage /> : null}
      {view === "invoices" ? <InvoicesPage /> : null}
      {view === "reports" ? <ReportsPage /> : null}
    </main>
  );
}
