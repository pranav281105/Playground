import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipProps } from "recharts";

import { PageHeader } from "@/components/layout/PageHeader";
import { DashboardSkeleton } from "@/components/state/DashboardSkeleton";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/features/auth/AuthContext";
import { formatCurrency } from "@/lib/format";
import {
  useBranches,
  useBusinessPerformance,
  useBusinesses,
  useCosts,
  useDashboardRevenueTrend,
  useDashboardSummary,
  usePayments,
  useVendorPayments,
} from "@/lib/queries";
import type { Branch, Business, BusinessPerformancePoint, CostsResponse, Payment, RevenueTrendPoint, VendorPayment } from "@/lib/types";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LABELS_FULL = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const EMPTY_COSTS: CostsResponse = { fixed: [], variable: [], failure: [] };
const EMPTY_BUSINESSES: Business[] = [];
const EMPTY_BRANCHES: Branch[] = [];
const EMPTY_TREND: RevenueTrendPoint[] = [];
const EMPTY_PAYMENTS: Payment[] = [];
const EMPTY_VENDOR_PAYMENTS: VendorPayment[] = [];
const EMPTY_PERFORMANCE: BusinessPerformancePoint[] = [];

function parseAmount(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function extractYearMonth(value: string): { year: number; month: number } | null {
  const monthMatch = value.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const year = Number(monthMatch[1]);
    const month = Number(monthMatch[2]);
    if (Number.isFinite(year) && Number.isFinite(month) && month >= 1 && month <= 12) {
      return { year, month };
    }
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
  };
}

function sum(values: number[]): number {
  return values.reduce((accumulator, value) => accumulator + value, 0);
}

function buildTrendSeries(trend: RevenueTrendPoint[], selectedYear: number, metric: "revenue" | "gross_profit"): number[] {
  const values = Array<number>(12).fill(0);
  for (const point of trend) {
    const parsed = extractYearMonth(point.month);
    if (!parsed || parsed.year !== selectedYear) continue;
    values[parsed.month - 1] += parseAmount(point[metric]);
  }
  return values;
}

function buildCostSeries(rows: Array<{ amount: string; date: string }>, selectedYear: number): number[] {
  const values = Array<number>(12).fill(0);
  for (const row of rows) {
    const parsed = extractYearMonth(row.date);
    if (!parsed || parsed.year !== selectedYear) continue;
    values[parsed.month - 1] += parseAmount(row.amount);
  }
  return values;
}

function buildPaymentSeries(rows: Array<{ amount: string; payment_date: string }>, selectedYear: number): number[] {
  const values = Array<number>(12).fill(0);
  for (const row of rows) {
    const parsed = extractYearMonth(row.payment_date);
    if (!parsed || parsed.year !== selectedYear) continue;
    values[parsed.month - 1] += parseAmount(row.amount);
  }
  return values;
}

function toDashMoney(value: number): string {
  return value === 0 ? "-" : formatCurrency(value);
}

function branchOptionLabel(branch: Branch): string {
  return `${branch.branch_name} (${branch.branch_id.slice(0, 8)})`;
}

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const labelText = typeof label === "string" ? label : String(label ?? "");

  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow-md">
      <div className="mb-1 text-xs font-medium text-muted-foreground">{labelText}</div>
      <div className="space-y-1">
        {payload.map((item, index) => {
          const dataKey = String(item.dataKey ?? item.name ?? index);
          const displayName =
            dataKey === "grossProfit"
              ? "Gross Profit"
              : dataKey === "netIncome"
                ? "Net Income"
                : dataKey === "fixed"
                  ? "Fixed Costs"
                  : dataKey === "variable"
                    ? "Variable Costs"
                    : dataKey === "failure"
                      ? "Failure Costs"
                      : dataKey === "revenue"
                        ? "Revenue"
                        : dataKey;

          const rawValue = typeof item.value === "number" ? item.value : Number(item.value);
          const formatted = Number.isFinite(rawValue) ? formatCurrency(rawValue) : "-";

          return (
            <div key={`${dataKey}-${index}`} className="flex items-center justify-between gap-6 text-sm">
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: item.color ?? "hsl(var(--foreground))" }}
                />
                <span className="truncate">{displayName}</span>
              </div>
              <span className="font-medium tabular-nums">{formatted}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const canFilterByBusiness = user?.role === "owner" || user?.role === "admin";
  const canFilterByBranch = canFilterByBusiness || user?.role === "business_manager";

  const [selectedBusinessId, setSelectedBusinessId] = useState<string>("");
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  useEffect(() => {
    if (!user) return;
    if (user.role === "business_manager" && user.business_id) {
      setSelectedBusinessId(user.business_id);
    } else if (!canFilterByBusiness) {
      setSelectedBusinessId("");
    }
  }, [user, canFilterByBusiness]);

  const scope = useMemo(
    () => ({
      businessId: selectedBusinessId || undefined,
      branchId: selectedBranchId || undefined,
    }),
    [selectedBusinessId, selectedBranchId],
  );

  const businessesQuery = useBusinesses(canFilterByBusiness);
  const branchesQuery = useBranches(canFilterByBranch);
  const summaryQuery = useDashboardSummary(scope);
  const trendQuery = useDashboardRevenueTrend(scope);
  const costsQuery = useCosts(scope);
  const paymentsQuery = usePayments(scope);
  const vendorPaymentsQuery = useVendorPayments(scope);
  const businessPerformanceQuery = useBusinessPerformance({ ...scope, year: selectedYear });

  const businesses = businessesQuery.data ?? EMPTY_BUSINESSES;
  const branches = branchesQuery.data ?? EMPTY_BRANCHES;
  const trend = trendQuery.data ?? EMPTY_TREND;
  const costs = costsQuery.data ?? EMPTY_COSTS;
  const payments = paymentsQuery.data ?? EMPTY_PAYMENTS;
  const vendorPayments = vendorPaymentsQuery.data ?? EMPTY_VENDOR_PAYMENTS;
  const businessPerformance = businessPerformanceQuery.data ?? EMPTY_PERFORMANCE;

  const visibleBranches = useMemo(
    () => (selectedBusinessId ? branches.filter((branch) => branch.business_id === selectedBusinessId) : branches),
    [branches, selectedBusinessId],
  );

  useEffect(() => {
    if (!selectedBranchId) return;
    if (!visibleBranches.some((branch) => branch.branch_id === selectedBranchId)) {
      setSelectedBranchId("");
    }
  }, [selectedBranchId, visibleBranches]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    const addYear = (value: string) => {
      const parsed = extractYearMonth(value);
      if (parsed) years.add(parsed.year);
    };

    trend.forEach((row) => addYear(row.month));
    costs.fixed.forEach((row) => addYear(row.date));
    costs.variable.forEach((row) => addYear(row.date));
    costs.failure.forEach((row) => addYear(row.date));
    payments.forEach((row) => addYear(row.payment_date));
    vendorPayments.forEach((row) => addYear(row.payment_date));

    if (years.size === 0) years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [trend, costs, payments, vendorPayments]);

  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears, selectedYear]);

  const revenueByMonth = useMemo(() => buildTrendSeries(trend, selectedYear, "revenue"), [trend, selectedYear]);
  const grossProfitByMonth = useMemo(() => buildTrendSeries(trend, selectedYear, "gross_profit"), [trend, selectedYear]);
  const fixedByMonth = useMemo(() => buildCostSeries(costs.fixed, selectedYear), [costs.fixed, selectedYear]);
  const variableByMonth = useMemo(() => buildCostSeries(costs.variable, selectedYear), [costs.variable, selectedYear]);
  const failureByMonth = useMemo(() => buildCostSeries(costs.failure, selectedYear), [costs.failure, selectedYear]);
  const receivedByMonth = useMemo(() => buildPaymentSeries(payments, selectedYear), [payments, selectedYear]);
  const paidByMonth = useMemo(() => buildPaymentSeries(vendorPayments, selectedYear), [vendorPayments, selectedYear]);

  const netIncomeByMonth = useMemo(
    () =>
      MONTH_LABELS.map((_, index) => {
        return (
          (grossProfitByMonth[index] ?? 0) -
          (fixedByMonth[index] ?? 0) -
          (variableByMonth[index] ?? 0) -
          (failureByMonth[index] ?? 0)
        );
      }),
    [grossProfitByMonth, fixedByMonth, variableByMonth, failureByMonth],
  );

  const fixedTotal = sum(fixedByMonth);
  const variableTotal = sum(variableByMonth);
  const failureTotal = sum(failureByMonth);
  const receivedTotal = sum(receivedByMonth);
  const paidTotal = sum(paidByMonth);
  const cashNetTotal = receivedTotal - paidTotal;

  const revenueChartData = useMemo(
    () =>
      MONTH_LABELS.map((month, index) => ({
        month,
        revenue: revenueByMonth[index] ?? 0,
        grossProfit: grossProfitByMonth[index] ?? 0,
      })),
    [revenueByMonth, grossProfitByMonth],
  );

  const costChartData = useMemo(
    () =>
      MONTH_LABELS.map((month, index) => ({
        month,
        fixed: fixedByMonth[index] ?? 0,
        variable: variableByMonth[index] ?? 0,
        failure: failureByMonth[index] ?? 0,
      })),
    [fixedByMonth, variableByMonth, failureByMonth],
  );

  const monthlyRows = useMemo(
    () =>
      MONTH_LABELS_FULL.map((month, index) => {
        const revenue = revenueByMonth[index] ?? 0;
        const grossProfit = grossProfitByMonth[index] ?? 0;
        const costsTotal = (fixedByMonth[index] ?? 0) + (variableByMonth[index] ?? 0) + (failureByMonth[index] ?? 0);
        const netIncome = netIncomeByMonth[index] ?? 0;
        return { month, revenue, grossProfit, costsTotal, netIncome };
      }),
    [revenueByMonth, grossProfitByMonth, fixedByMonth, variableByMonth, failureByMonth, netIncomeByMonth],
  );

  const branchComparisonData = useMemo(
    () =>
      businessPerformance.map((row) => ({
        name: row.business_name,
        revenue: parseAmount(row.revenue),
        netIncome: parseAmount(row.net_income),
      })),
    [businessPerformance],
  );

  const isLoading =
    summaryQuery.isLoading ||
    trendQuery.isLoading ||
    costsQuery.isLoading ||
    paymentsQuery.isLoading ||
    vendorPaymentsQuery.isLoading ||
    businessPerformanceQuery.isLoading ||
    (canFilterByBusiness && businessesQuery.isLoading) ||
    (canFilterByBranch && branchesQuery.isLoading);

  const anyError =
    summaryQuery.error ||
    trendQuery.error ||
    costsQuery.error ||
    paymentsQuery.error ||
    vendorPaymentsQuery.error ||
    businessPerformanceQuery.error ||
    (canFilterByBusiness && businessesQuery.error) ||
    (canFilterByBranch && branchesQuery.error);

  const revenueChartHasData = trend.length > 0;
  const costChartHasData = costs.fixed.length > 0 || costs.variable.length > 0 || costs.failure.length > 0;
  const branchChartHasData = businessPerformance.length > 0;

  if (isLoading) return <DashboardSkeleton />;
  if (anyError) return <ErrorState message="Failed to load dashboard. Please try again." />;

  const currentYear = new Date().getFullYear();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Key financial performance and trends."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canFilterByBusiness ? (
              <Select value={selectedBusinessId || "__all__"} onValueChange={(value) => setSelectedBusinessId(value === "__all__" ? "" : value)}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="All businesses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All businesses</SelectItem>
                  {businesses.map((business) => (
                    <SelectItem key={business.business_id} value={business.business_id}>
                      {business.business_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            {canFilterByBranch ? (
              <Select value={selectedBranchId || "__all__"} onValueChange={(value) => setSelectedBranchId(value === "__all__" ? "" : value)}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="All branches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All branches</SelectItem>
                  {visibleBranches.map((branch) => (
                    <SelectItem key={branch.branch_id} value={branch.branch_id}>
                      {branchOptionLabel(branch)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            <Select value={String(selectedYear)} onValueChange={(value) => setSelectedYear(Number(value))}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              className="border-border/70 bg-background text-foreground"
              onClick={() => {
                setSelectedYear(currentYear);
                setSelectedBranchId("");
                if (user?.role === "business_manager") {
                  setSelectedBusinessId(user.business_id ?? "");
                } else {
                  setSelectedBusinessId("");
                }
              }}
            >
              Reset
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="space-y-1">
            <CardDescription>Revenue</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(summaryQuery.data?.total_revenue ?? "0")}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              GP {formatCurrency(summaryQuery.data?.gross_profit ?? "0")} · {summaryQuery.data?.gross_profit_margin ?? "0.00"}%
            </div>
            <Badge variant="secondary">YTD</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-1">
            <CardDescription>Total Costs</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(summaryQuery.data?.total_costs ?? "0")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Fixed {toDashMoney(fixedTotal)} · Variable {toDashMoney(variableTotal)} · Failure {toDashMoney(failureTotal)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-1">
            <CardDescription>Net Income</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(summaryQuery.data?.net_income ?? "0")}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">Net margin {summaryQuery.data?.net_margin ?? "0.00"}%</div>
            <Badge variant="secondary">{Number(summaryQuery.data?.net_income ?? "0") >= 0 ? "Positive" : "Negative"}</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-1">
            <CardDescription>Payments (Net Cash)</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(cashNetTotal)}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Received {toDashMoney(receivedTotal)} · Paid {toDashMoney(paidTotal)}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Revenue Trend</CardTitle>
            <CardDescription>Revenue and gross profit by month.</CardDescription>
          </CardHeader>
          <CardContent>
            {revenueChartHasData ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={revenueChartData} margin={{ top: 10, right: 14, left: -6, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => (value === 0 ? "0" : `S$${value}`)} />
                    <Tooltip content={<ChartTooltip />} cursor={{ stroke: "hsl(var(--border))" }} />
                    <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="grossProfit" stroke="hsl(142.1 76.2% 36.3%)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState title="No revenue trend data available" description="Create invoices to populate this chart." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cost Trend</CardTitle>
            <CardDescription>Costs by month.</CardDescription>
          </CardHeader>
          <CardContent>
            {costChartHasData ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={costChartData} margin={{ top: 10, right: 14, left: -6, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => (value === 0 ? "0" : `S$${value}`)} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.25 }} />
                    <Bar dataKey="fixed" stackId="a" fill="hsl(var(--primary))" />
                    <Bar dataKey="variable" stackId="a" fill="hsl(38 92% 50%)" />
                    <Bar dataKey="failure" stackId="a" fill="hsl(var(--destructive))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState title="No cost data available" description="Add fixed, variable, or failure costs to see a trend." />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Branch Comparison</CardTitle>
          <CardDescription>Revenue and net income by business.</CardDescription>
        </CardHeader>
        <CardContent>
          {branchChartHasData ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={branchComparisonData} margin={{ top: 10, right: 14, left: -6, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => (value === 0 ? "0" : `S$${value}`)} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.25 }} />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="netIncome" fill="hsl(142.1 76.2% 36.3%)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No comparison data available" description="Create businesses and invoices to compare performance." />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Monthly Financial Summary</CardTitle>
          <CardDescription>{`Revenue · Gross Profit · Total Costs · Net Income · Year ${selectedYear}`}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="h-10 px-2 text-left font-medium">Month</th>
                <th className="h-10 px-2 text-left font-medium">Revenue</th>
                <th className="h-10 px-2 text-left font-medium">Gross Profit</th>
                <th className="h-10 px-2 text-left font-medium">Total Costs</th>
                <th className="h-10 px-2 text-left font-medium">Net Income</th>
                <th className="h-10 px-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {monthlyRows.map((row) => {
                const active = row.revenue > 0 || row.costsTotal > 0;
                return (
                  <tr key={row.month} className="border-b hover:bg-muted/50">
                    <td className="px-2 py-2">{row.month}</td>
                    <td className="px-2 py-2">{toDashMoney(row.revenue)}</td>
                    <td className="px-2 py-2">{toDashMoney(row.grossProfit)}</td>
                    <td className="px-2 py-2">{toDashMoney(row.costsTotal)}</td>
                    <td className="px-2 py-2">{toDashMoney(row.netIncome)}</td>
                    <td className="px-2 py-2">
                      <Badge variant={active ? "secondary" : "outline"}>{active ? "Active" : "No data"}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
