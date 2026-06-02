import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  AuditLog,
  Branch,
  Business,
  BusinessPerformancePoint,
  CashFlowReport,
  Company,
  DashboardSummary,
  CostsResponse,
  IncomeStatement,
  AuthUser,
  Payment,
  ReceivableStatus,
  RevenueSummaryItem,
  RevenueTrendPoint,
  Vendor,
  VendorPayment,
} from "@/lib/types";

export function useBusinesses(enabled: boolean) {
  return useQuery({
    queryKey: ["businesses"],
    queryFn: async () => (await api.get<Business[]>("/businesses")).data,
    enabled,
  });
}

export function useBranches(enabled: boolean) {
  return useQuery({
    queryKey: ["branches"],
    queryFn: async () => (await api.get<Branch[]>("/branches")).data,
    enabled,
  });
}

export function useDashboardSummary(params: { businessId?: string; branchId?: string }) {
  return useQuery({
    queryKey: ["dashboard", "summary", params],
    queryFn: async () => (await api.get<DashboardSummary>("/dashboard/summary", { params: toScopeParams(params) })).data,
  });
}

export function useDashboardRevenueTrend(params: { businessId?: string; branchId?: string }) {
  return useQuery({
    queryKey: ["dashboard", "revenue-trend", params],
    queryFn: async () =>
      (await api.get<RevenueTrendPoint[]>("/dashboard/revenue-trend", { params: { months: 24, ...toScopeParams(params) } }))
        .data,
  });
}

export function useCosts(params: { businessId?: string; branchId?: string }) {
  return useQuery({
    queryKey: ["costs", params],
    queryFn: async () => (await api.get<CostsResponse>("/costs", { params: toScopeParams(params) })).data,
  });
}

export function usePayments(params: { businessId?: string; branchId?: string }) {
  return useQuery({
    queryKey: ["payments", params],
    queryFn: async () => (await api.get<Payment[]>("/payments", { params: toScopeParams(params) })).data,
  });
}

export function useVendorPayments(params: { businessId?: string; branchId?: string }) {
  return useQuery({
    queryKey: ["vendor-payments", params],
    queryFn: async () => (await api.get<VendorPayment[]>("/vendor-payments", { params: toScopeParams(params) })).data,
  });
}

export function useBusinessPerformance(params: { businessId?: string; branchId?: string; year: number }) {
  return useQuery({
    queryKey: ["dashboard", "business-performance", params],
    queryFn: async () =>
      (await api.get<BusinessPerformancePoint[]>("/dashboard/business-performance", { params: { year: params.year, ...toScopeParams(params) } }))
        .data,
  });
}

export function useVendors() {
  return useQuery({
    queryKey: ["vendors"],
    queryFn: async () => (await api.get<Vendor[]>("/vendors")).data,
  });
}

export function useReceivables() {
  return useQuery({
    queryKey: ["payments", "receivables"],
    queryFn: async () => (await api.get<ReceivableStatus[]>("/payments/receivables")).data,
  });
}

export function useIncomeStatement() {
  return useQuery({
    queryKey: ["reports", "income-statement"],
    queryFn: async () => (await api.get<IncomeStatement>("/reports/income-statement")).data,
  });
}

export function useRevenueSummary(params: { months: number }) {
  return useQuery({
    queryKey: ["reports", "revenue-summary", params],
    queryFn: async () => (await api.get<RevenueSummaryItem[]>("/reports/revenue-summary", { params })).data,
  });
}

export function useCashFlow(params: { opening_balance: string }) {
  return useQuery({
    queryKey: ["reports", "cash-flow", params],
    queryFn: async () => (await api.get<CashFlowReport>("/reports/cash-flow", { params })).data,
  });
}

type AdminData = {
  companies: Company[];
  businesses: Business[];
  branches: Branch[];
  users: AuthUser[];
  auditLogs: AuditLog[];
};

export function useAdminData() {
  return useQuery({
    queryKey: ["admin", "data"],
    queryFn: async (): Promise<AdminData> => {
      const [companies, businesses, branches, users, auditLogs] = await Promise.all([
        api.get<Company[]>("/companies").then((res) => res.data),
        api.get<Business[]>("/businesses").then((res) => res.data),
        api.get<Branch[]>("/branches").then((res) => res.data),
        api.get<AuthUser[]>("/users").then((res) => res.data),
        api.get<AuditLog[]>("/audit-logs").then((res) => res.data),
      ]);

      return { companies, businesses, branches, users, auditLogs };
    },
  });
}

function toScopeParams(input: { businessId?: string; branchId?: string }) {
  return {
    business_id: input.businessId || undefined,
    branch_id: input.branchId || undefined,
  };
}
