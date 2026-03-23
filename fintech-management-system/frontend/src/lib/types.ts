export type UserRole = "owner" | "admin" | "business_manager" | "branch_manager";

export type AuthUser = {
  user_id: string;
  name: string;
  email: string;
  role: UserRole;
  company_id: string | null;
  business_id: string | null;
  branch_id: string | null;
};

export type LoginResponse = {
  access_token: string;
  token_type: "bearer";
};

export type DashboardSummary = {
  total_revenue: string;
  gross_profit: string;
  total_costs: string;
  net_income: string;
  gross_profit_margin: string;
  net_margin: string;
};

export type RevenueTrendPoint = {
  month: string;
  revenue: string;
  gross_profit: string;
};

export type CostBreakdownPoint = {
  category: string;
  amount: string;
};

export type BusinessPerformancePoint = {
  business_id: string;
  business_name: string;
  revenue: string;
  gross_profit: string;
  total_costs: string;
  net_income: string;
  gross_profit_margin: string;
};

export type Invoice = {
  invoice_id: string;
  invoice_number: string;
  customer_id: string;
  invoice_date: string;
  sales_amount: string;
  gross_profit: string;
  cogs: string;
  remarks: string | null;
  status: "DRAFT" | "FINALIZED" | "VOID";
};

export type Customer = {
  customer_id: string;
  customer_name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  payment_terms: string | null;
  status: "active" | "inactive";
};

export type Vendor = {
  vendor_id: string;
  vendor_name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  bank_details: string | null;
  status: "active" | "inactive";
};

export type Payment = {
  payment_id: string;
  invoice_id: string;
  payment_date: string;
  payment_method: "cash" | "paynow" | "bank_transfer" | "credit_card";
  amount: string;
  reference_number: string | null;
};

export type VendorPayment = {
  vendor_payment_id: string;
  vendor_id: string;
  bill_number: string | null;
  amount: string;
  payment_date: string;
  payment_method: "cash" | "paynow" | "bank_transfer" | "credit_card";
};

export type FixedCost = {
  fixed_cost_id: string;
  category: string;
  amount: string;
  date: string;
  description: string | null;
};

export type VariableCost = {
  variable_cost_id: string;
  category: string;
  amount: string;
  date: string;
  description: string | null;
};

export type FailureCost = {
  failure_cost_id: string;
  failure_type: string;
  amount: string;
  date: string;
  root_cause: string | null;
};

export type CostsResponse = {
  fixed: FixedCost[];
  variable: VariableCost[];
  failure: FailureCost[];
};

export type IncomeStatement = {
  total_revenue: string;
  total_gross_profit: string;
  total_fixed_costs: string;
  total_variable_costs: string;
  total_failure_costs: string;
  net_income: string;
};

export type RevenueSummaryItem = {
  month: string;
  total_revenue: string;
  total_gross_profit: string;
  gross_margin: string;
};

export type CashFlowReport = {
  opening_balance: string;
  cash_received: string;
  cash_paid: string;
  closing_balance: string;
};

export type Branch = {
  branch_id: string;
  business_id: string | null;
  branch_name: string;
  location: string | null;
};

export type Company = {
  company_id: string;
  company_name: string;
};

export type Business = {
  business_id: string;
  company_id: string;
  business_name: string;
};

export type AuditLog = {
  audit_id: string;
  timestamp: string;
  user_id: string;
  branch_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
};
