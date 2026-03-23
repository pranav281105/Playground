import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AdminPage } from "../features/admin/AdminPage";
import { AuthProvider } from "../features/auth/AuthContext";
import { LoginPage } from "../features/auth/LoginPage";
import { CostsPage } from "../features/costs/CostsPage";
import { CustomersPage } from "../features/customers/CustomersPage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { InvoicesPage } from "../features/invoices/InvoicesPage";
import { PaymentsPage } from "../features/payments/PaymentsPage";
import { ReportsPage } from "../features/reports/ReportsPage";
import { VendorsPage } from "../features/vendors/VendorsPage";
import { AppShell } from "./AppShell";
import { ProtectedRoute } from "./ProtectedRoute";
import { RoleGuard } from "./RoleGuard";

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/invoices" element={<InvoicesPage />} />
              <Route path="/costs" element={<CostsPage />} />
              <Route path="/payments" element={<PaymentsPage />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/vendors" element={<VendorsPage />} />
              <Route path="/reports" element={<ReportsPage />} />

              <Route element={<RoleGuard roles={["admin", "owner"]} />}>
                <Route path="/admin" element={<AdminPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
