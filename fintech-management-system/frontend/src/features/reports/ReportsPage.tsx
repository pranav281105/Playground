import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipProps } from "recharts";
import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { TableSkeleton } from "@/components/state/TableSkeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { useCashFlow, useIncomeStatement, useRevenueSummary } from "@/lib/queries";

function parseYear(value: string): number | null {
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }
  return year;
}

function monthLabel(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) return value;
  const month = Number(match[2]);
  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  if (month >= 1 && month <= 12) return labels[month - 1];
  return value;
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
            dataKey === "grossProfit" ? "Gross Profit" : dataKey === "revenue" ? "Revenue" : dataKey === "value" ? "Amount" : dataKey;

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

export function ReportsPage() {
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const incomeQuery = useIncomeStatement();
  const revenueQuery = useRevenueSummary({ months: 24 });
  const cashFlowQuery = useCashFlow({ opening_balance: "0.00" });

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const row of revenueQuery.data ?? []) {
      const year = parseYear(row.month);
      if (year) {
        years.add(year);
      }
    }
    if (years.size === 0) {
      years.add(new Date().getFullYear());
    }
    return Array.from(years).sort((left, right) => right - left);
  }, [revenueQuery.data]);

  useEffect(() => {
    if (!availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears, selectedYear]);

  const filteredSummary = useMemo(
    () =>
      (revenueQuery.data ?? []).filter((row) => {
        const year = parseYear(row.month);
        return year === selectedYear;
      }),
    [revenueQuery.data, selectedYear],
  );

  const revenueChartData = useMemo(
    () =>
      filteredSummary.map((row) => ({
        month: monthLabel(row.month),
        revenue: Number(row.total_revenue) || 0,
        grossProfit: Number(row.total_gross_profit) || 0,
      })),
    [filteredSummary],
  );

  const revenueChartHasData = revenueChartData.some((p) => p.revenue > 0 || p.grossProfit > 0);

  const cashFlowChartData = useMemo(() => {
    const cash = cashFlowQuery.data;
    if (!cash) return [];
    return [
      { label: "Opening", value: Number(cash.opening_balance) || 0 },
      { label: "Received", value: Number(cash.cash_received) || 0 },
      { label: "Paid", value: Number(cash.cash_paid) || 0 },
      { label: "Closing", value: Number(cash.closing_balance) || 0 },
    ];
  }, [cashFlowQuery.data]);

  const downloadCsv = async (url: string, fileName: string) => {
    const response = await api.get(url, { responseType: "blob" });
    const blob = new Blob([response.data], { type: "text/csv" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(href);
  };

  const isLoading = incomeQuery.isLoading || revenueQuery.isLoading || cashFlowQuery.isLoading;
  const anyError = incomeQuery.error || revenueQuery.error || cashFlowQuery.error;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" description="Income statement, revenue summary, and cash flow exports." />
        <TableSkeleton cols={5} />
      </div>
    );
  }

  if (anyError) {
    return <ErrorState message="Failed to load report data." />;
  }

  const income = incomeQuery.data;
  const cash = cashFlowQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Income statement, revenue summary, and cash flow exports."
        actions={
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
        }
      />

      <Card>
        <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle>Income Statement</CardTitle>
            <CardDescription>All available data</CardDescription>
          </div>
          <Button variant="outline" onClick={() => void downloadCsv("/reports/income-statement/export", "income_statement.csv")}>
            Export CSV
          </Button>
        </CardHeader>
        <CardContent>
          {income ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardHeader className="space-y-1">
                  <CardDescription>Total Revenue</CardDescription>
                  <CardTitle className="text-2xl">{formatCurrency(income.total_revenue)}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="space-y-1">
                  <CardDescription>Gross Profit</CardDescription>
                  <CardTitle className="text-2xl">{formatCurrency(income.total_gross_profit)}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="space-y-1">
                  <CardDescription>Total Costs</CardDescription>
                  <CardTitle className="text-2xl">
                    {formatCurrency(
                      (Number(income.total_fixed_costs) + Number(income.total_variable_costs) + Number(income.total_failure_costs)).toFixed(2),
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Fixed {formatCurrency(income.total_fixed_costs)} · Variable {formatCurrency(income.total_variable_costs)} · Failure {formatCurrency(income.total_failure_costs)}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="space-y-1">
                  <CardDescription>Net Income</CardDescription>
                  <CardTitle className="text-2xl">{formatCurrency(income.net_income)}</CardTitle>
                </CardHeader>
              </Card>
            </div>
          ) : (
            <EmptyState title="No income statement data available" description="Create invoices, costs, and payments to populate this report." />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <CardTitle>Revenue Summary</CardTitle>
              <CardDescription>{`Monthly breakdown · Year ${selectedYear}`}</CardDescription>
            </div>
            <Button variant="outline" onClick={() => void downloadCsv("/reports/revenue-summary/export?months=24", "revenue_summary.csv")}>
              Export CSV
            </Button>
          </CardHeader>
          <CardContent>
            {revenueChartHasData ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={revenueChartData} margin={{ top: 10, right: 14, left: -6, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => (v === 0 ? "0" : `S$${v}`)} />
                    <Tooltip content={<ChartTooltip />} cursor={{ stroke: "hsl(var(--border))" }} />
                    <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="grossProfit" stroke="hsl(142.1 76.2% 36.3%)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState title="No revenue summary data available" description="Create invoices to populate this section." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <CardTitle>Cash Flow</CardTitle>
              <CardDescription>All available data</CardDescription>
            </div>
            <Button variant="outline" onClick={() => void downloadCsv("/reports/cash-flow/export?opening_balance=0.00", "cash_flow.csv")}>
              Export CSV
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {cash ? (
              <>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Opening Balance</span>
                    <span>{formatCurrency(cash.opening_balance)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Cash Received</span>
                    <span>{formatCurrency(cash.cash_received)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Cash Paid</span>
                    <span>{formatCurrency(cash.cash_paid)}</span>
                  </div>
                  <div className="flex items-center justify-between font-medium">
                    <span>Closing Balance</span>
                    <span>{formatCurrency(cash.closing_balance)}</span>
                  </div>
                </div>

                {cashFlowChartData.some((p) => p.value !== 0) ? (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={cashFlowChartData} margin={{ top: 10, right: 10, left: -8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} />
                        <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => (v === 0 ? "0" : `S$${v}`)} />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.25 }} />
                        <Bar dataKey="value" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <EmptyState title="No cash flow chart data" description="Record payments to populate cash flow." />
                )}
              </>
            ) : (
              <EmptyState title="No cash flow data available" description="Record payments to populate cash flow." />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Revenue Summary Table</CardTitle>
          <CardDescription>{`Year ${selectedYear}`}</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredSummary.length === 0 ? (
            <EmptyState title="No report data available" description="No revenue rows found for the selected year." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Gross Profit</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSummary.map((row) => (
                  <TableRow key={row.month}>
                    <TableCell>{row.month}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.total_revenue)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.total_gross_profit)}</TableCell>
                    <TableCell className="text-right">{row.gross_margin}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
