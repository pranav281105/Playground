export type DashboardSummary = {
  total_revenue: string;
  gross_profit: string;
  total_costs: string;
  net_income: string;
  gross_profit_margin: string;
  net_margin: string;
};

export type Invoice = {
  invoice_id: string;
  invoice_number: string;
  customer_id: string;
  invoice_date: string;
  sales_amount: string;
  gross_profit: string;
  cogs: string;
  status: "DRAFT" | "FINALIZED" | "VOID";
};
