import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "../features/auth/AuthContext";
import { LoginPage } from "../features/auth/LoginPage";
import { ProtectedRoute } from "../features/auth/ProtectedRoute";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { InvoicesPage } from "../features/invoices/InvoicesPage";
import { ReportsPage } from "../features/reports/ReportsPage";
import { ProtectedLayout } from "./ProtectedLayout";

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<ProtectedLayout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/invoices" element={<InvoicesPage />} />
              <Route path="/reports" element={<ReportsPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
