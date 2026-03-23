import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/apiError";
import { formatCurrency } from "../../lib/format";
import type {
  Branch,
  Business,
  BusinessPerformancePoint,
  CostsResponse,
  Payment,
  RevenueTrendPoint,
  VendorPayment,
} from "../../lib/types";
import { useAuth } from "../auth/AuthContext";

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

function toRatio(numerator: number, denominator: number): string {
  if (denominator <= 0) {
    return "0.0%";
  }
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function buildTrendSeries(trend: RevenueTrendPoint[], selectedYear: number, metric: "revenue" | "gross_profit"): number[] {
  const values = Array<number>(12).fill(0);
  for (const point of trend) {
    const parsed = extractYearMonth(point.month);
    if (!parsed || parsed.year !== selectedYear) {
      continue;
    }
    values[parsed.month - 1] += parseAmount(point[metric]);
  }
  return values;
}

function buildCostSeries(rows: Array<{ amount: string; date: string }>, selectedYear: number): number[] {
  const values = Array<number>(12).fill(0);
  for (const row of rows) {
    const parsed = extractYearMonth(row.date);
    if (!parsed || parsed.year !== selectedYear) {
      continue;
    }
    values[parsed.month - 1] += parseAmount(row.amount);
  }
  return values;
}

function buildPaymentSeries(rows: Array<{ amount: string; payment_date: string }>, selectedYear: number): number[] {
  const values = Array<number>(12).fill(0);
  for (const row of rows) {
    const parsed = extractYearMonth(row.payment_date);
    if (!parsed || parsed.year !== selectedYear) {
      continue;
    }
    values[parsed.month - 1] += parseAmount(row.amount);
  }
  return values;
}

function toDashMoney(value: number): string {
  if (value === 0) {
    return "-";
  }
  return formatCurrency(value);
}

function branchOptionLabel(branch: Branch): string {
  const shortId = branch.branch_id.slice(0, 8);
  return `${branch.branch_name} (${shortId})`;
}

export function DashboardPage() {
  const { user } = useAuth();
  const [trend, setTrend] = useState<RevenueTrendPoint[]>([]);
  const [costs, setCosts] = useState<CostsResponse>(EMPTY_COSTS);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [vendorPayments, setVendorPayments] = useState<VendorPayment[]>([]);
  const [businessPerformance, setBusinessPerformance] = useState<BusinessPerformancePoint[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string>("");
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [error, setError] = useState<string | null>(null);

  const canFilterByBusiness = user?.role === "owner" || user?.role === "admin";
  const canFilterByBranch = canFilterByBusiness || user?.role === "business_manager";

  useEffect(() => {
    if (!user) {
      return;
    }

    if (user.role === "business_manager" && user.business_id) {
      setSelectedBusinessId(user.business_id);
    } else if (!canFilterByBusiness) {
      setSelectedBusinessId("");
    }

    const requests: Array<Promise<unknown>> = [];
    if (canFilterByBusiness) {
      requests.push(api.get<Business[]>("/businesses"));
    }
    if (canFilterByBranch) {
      requests.push(api.get<Branch[]>("/branches"));
    }

    if (requests.length === 0) {
      setBusinesses([]);
      setBranches([]);
      return;
    }

    Promise.all(requests)
      .then((responses) => {
        let responseIndex = 0;
        if (canFilterByBusiness) {
          const businessResponse = responses[responseIndex] as { data: Business[] };
          setBusinesses(businessResponse.data);
          responseIndex += 1;
        } else {
          setBusinesses([]);
        }

        if (canFilterByBranch) {
          const branchResponse = responses[responseIndex] as { data: Branch[] };
          setBranches(branchResponse.data);
        } else {
          setBranches([]);
        }
      })
      .catch((requestError: unknown) =>
        setError(getApiErrorMessage(requestError, "Failed to load dashboard filters")),
      );
  }, [user, canFilterByBusiness, canFilterByBranch]);

  const visibleBranches = useMemo(
    () =>
      selectedBusinessId
        ? branches.filter((branch) => branch.business_id === selectedBusinessId)
        : branches,
    [branches, selectedBusinessId],
  );

  useEffect(() => {
    if (selectedBranchId && !visibleBranches.some((branch) => branch.branch_id === selectedBranchId)) {
      setSelectedBranchId("");
    }
  }, [selectedBranchId, visibleBranches]);

  useEffect(() => {
    const scopeParams = {
      business_id: selectedBusinessId || undefined,
      branch_id: selectedBranchId || undefined,
    };
    Promise.all([
      api.get<RevenueTrendPoint[]>("/dashboard/revenue-trend", { params: { months: 24, ...scopeParams } }),
      api.get<CostsResponse>("/costs", { params: scopeParams }),
      api.get<Payment[]>("/payments", { params: scopeParams }),
      api.get<VendorPayment[]>("/vendor-payments", { params: scopeParams }),
      api.get<BusinessPerformancePoint[]>("/dashboard/business-performance", { params: { year: selectedYear, ...scopeParams } }),
    ])
      .then(([trendResponse, costResponse, paymentResponse, vendorPaymentResponse, businessPerformanceResponse]) => {
        setTrend(trendResponse.data);
        setCosts(costResponse.data);
        setPayments(paymentResponse.data);
        setVendorPayments(vendorPaymentResponse.data);
        setBusinessPerformance(businessPerformanceResponse.data);
      })
      .catch((requestError: unknown) => setError(getApiErrorMessage(requestError, "Failed to load dashboard data")));
  }, [selectedBusinessId, selectedBranchId, selectedYear]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    const addYearFromValue = (value: string) => {
      const parsed = extractYearMonth(value);
      if (parsed) {
        years.add(parsed.year);
      }
    };

    trend.forEach((row) => addYearFromValue(row.month));
    costs.fixed.forEach((row) => addYearFromValue(row.date));
    costs.variable.forEach((row) => addYearFromValue(row.date));
    costs.failure.forEach((row) => addYearFromValue(row.date));
    payments.forEach((row) => addYearFromValue(row.payment_date));
    vendorPayments.forEach((row) => addYearFromValue(row.payment_date));

    if (years.size === 0) {
      years.add(new Date().getFullYear());
    }

    return Array.from(years).sort((left, right) => right - left);
  }, [trend, costs, payments, vendorPayments]);

  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears, selectedYear]);

  const revenueByMonth = useMemo(
    () => buildTrendSeries(trend, selectedYear, "revenue"),
    [trend, selectedYear],
  );
  const grossProfitByMonth = useMemo(
    () => buildTrendSeries(trend, selectedYear, "gross_profit"),
    [trend, selectedYear],
  );
  const fixedByMonth = useMemo(
    () => buildCostSeries(costs.fixed, selectedYear),
    [costs.fixed, selectedYear],
  );
  const variableByMonth = useMemo(
    () => buildCostSeries(costs.variable, selectedYear),
    [costs.variable, selectedYear],
  );
  const failureByMonth = useMemo(
    () => buildCostSeries(costs.failure, selectedYear),
    [costs.failure, selectedYear],
  );
  const netIncomeByMonth = useMemo(
    () =>
      MONTH_LABELS.map(
        (_, index) =>
          (grossProfitByMonth[index] ?? 0) -
          (fixedByMonth[index] ?? 0) -
          (variableByMonth[index] ?? 0) -
          (failureByMonth[index] ?? 0),
      ),
    [grossProfitByMonth, fixedByMonth, variableByMonth, failureByMonth],
  );
  const receivedByMonth = useMemo(
    () => buildPaymentSeries(payments, selectedYear),
    [payments, selectedYear],
  );
  const paidByMonth = useMemo(
    () => buildPaymentSeries(vendorPayments, selectedYear),
    [vendorPayments, selectedYear],
  );
  const cashNetByMonth = useMemo(
    () => MONTH_LABELS.map((_, index) => (receivedByMonth[index] ?? 0) - (paidByMonth[index] ?? 0)),
    [receivedByMonth, paidByMonth],
  );

  const revenueTotal = sum(revenueByMonth);
  const grossProfitTotal = sum(grossProfitByMonth);
  const netIncomeTotal = sum(netIncomeByMonth);
  const fixedTotal = sum(fixedByMonth);
  const variableTotal = sum(variableByMonth);
  const failureTotal = sum(failureByMonth);
  const receivedTotal = sum(receivedByMonth);
  const paidTotal = sum(paidByMonth);
  const cashNetTotal = sum(cashNetByMonth);
  const totalCosts = fixedTotal + variableTotal + failureTotal;

  const chartData = useMemo(
    () =>
      MONTH_LABELS.map((month, index) => ({
        month,
        revenue: revenueByMonth[index] ?? 0,
        grossProfit: grossProfitByMonth[index] ?? 0,
      })),
    [revenueByMonth, grossProfitByMonth],
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

  const currentYear = new Date().getFullYear();
  const fixedPct = totalCosts > 0 ? Math.max(4, (fixedTotal / totalCosts) * 100) : 0;
  const variablePct = totalCosts > 0 ? Math.max(4, (variableTotal / totalCosts) * 100) : 0;
  const failurePct = totalCosts > 0 ? Math.max(2, (failureTotal / totalCosts) * 100) : 0;

  return (
    <div className="stack">
      <div className="page-top">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-meta">{`Role: ${user?.role ?? "unknown"} · Branch ID: ${user?.branch_id ?? "Unassigned"}`}</div>
        </div>
        <div className="ctrl-row">
          {canFilterByBusiness ? (
            <>
              <span className="yr-lbl">Business</span>
              <select
                className="ctrl-select"
                value={selectedBusinessId}
                onChange={(event) => setSelectedBusinessId(event.target.value)}
              >
                <option value="">All businesses</option>
                {businesses.map((business) => (
                  <option key={business.business_id} value={business.business_id}>
                    {business.business_name}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          {canFilterByBranch ? (
            <>
              <span className="yr-lbl">Branch</span>
              <select
                className="ctrl-select"
                value={selectedBranchId}
                onChange={(event) => setSelectedBranchId(event.target.value)}
              >
                <option value="">All branches</option>
                {visibleBranches.map((branch) => (
                  <option key={branch.branch_id} value={branch.branch_id}>
                    {branchOptionLabel(branch)}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          <span className="yr-lbl">Year</span>
          <select
            className="ctrl-select"
            id="dashboard-year"
            value={selectedYear}
            onChange={(event) => setSelectedYear(Number(event.target.value))}
          >
            {availableYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="ctrl-btn"
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
          </button>
        </div>
      </div>

      {error ? <div className="sheet error">{error}</div> : null}

      <section className="kpi-grid">
        <article className="kpi">
          <div className="kpi-label">Revenue</div>
          <div className="kpi-value">{formatCurrency(revenueTotal)}</div>
          <div className="kpi-sub">{`Gross Profit: ${formatCurrency(grossProfitTotal)}\nMargin: ${toRatio(grossProfitTotal, revenueTotal)}`}</div>
          <div className="kpi-pill up">Active YTD</div>
        </article>
        <article className="kpi">
          <div className="kpi-label">Net Income</div>
          <div className="kpi-value">{formatCurrency(netIncomeTotal)}</div>
          <div className="kpi-sub">{`Net Margin: ${toRatio(netIncomeTotal, revenueTotal)}`}</div>
          <div className="kpi-pill up">{netIncomeTotal >= 0 ? "Positive" : "Negative"}</div>
        </article>
        <article className="kpi">
          <div className="kpi-label">Total Costs</div>
          <div className="kpi-value">{formatCurrency(totalCosts)}</div>
          <div className="kpi-sub">{`Fixed ${formatCurrency(fixedTotal)} · Variable ${formatCurrency(variableTotal)}\nFailure ${formatCurrency(failureTotal)}`}</div>
          <div className="kpi-pill warn">Monitor</div>
        </article>
        <article className="kpi">
          <div className="kpi-label">Cash Balance</div>
          <div className="kpi-value">{formatCurrency(cashNetTotal)}</div>
          <div className="kpi-sub">{`Received ${formatCurrency(receivedTotal)} · Paid ${formatCurrency(paidTotal)}`}</div>
          <div className="kpi-pill neu">{cashNetTotal >= 0 ? "Healthy" : "Review"}</div>
        </article>
      </section>

      {businessPerformance.length > 0 ? (
        <section className="card">
          <div className="card-hd">
            <div>
              <div className="card-title">Business Performance</div>
              <div className="card-desc">{`Consolidated by business · Year ${selectedYear}`}</div>
            </div>
          </div>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Revenue (S$)</th>
                  <th>Gross Profit (S$)</th>
                  <th>Total Costs (S$)</th>
                  <th>Net Income (S$)</th>
                  <th>GP Margin</th>
                </tr>
              </thead>
              <tbody>
                {businessPerformance.map((row) => (
                  <tr key={row.business_id}>
                    <td>{row.business_name}</td>
                    <td>{formatCurrency(row.revenue)}</td>
                    <td>{formatCurrency(row.gross_profit)}</td>
                    <td>{formatCurrency(row.total_costs)}</td>
                    <td className={Number(row.net_income) >= 0 ? "col-pos" : undefined}>{formatCurrency(row.net_income)}</td>
                    <td>{`${row.gross_profit_margin}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div className="two-col">
        <section className="card">
          <div className="card-hd">
            <div>
              <div className="card-title">Revenue &amp; Gross Profit</div>
              <div className="card-desc">{`Monthly breakdown · Year ${selectedYear}`}</div>
            </div>
          </div>
          <div className="chart-body">
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 6, right: 6, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
                  <XAxis dataKey="month" tick={{ fill: "var(--t3)", fontSize: 10.5 }} tickLine={false} axisLine={false} />
                  <YAxis
                    tick={{ fill: "var(--t3)", fontSize: 10.5 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => (value === 0 ? "0" : `S$${value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}`)}
                  />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{ background: "var(--s2)", border: "1px solid var(--line2)", borderRadius: "8px" }}
                    labelStyle={{ color: "var(--t2)" }}
                    itemStyle={{ color: "var(--t1)" }}
                  />
                  <Bar dataKey="revenue" fill="rgba(79,142,247,0.65)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="grossProfit" fill="rgba(34,197,94,0.55)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="chart-legend">
            <div className="leg">
              <div className="leg-dot" style={{ background: "var(--blue)" }} />
              Revenue
            </div>
            <div className="leg">
              <div className="leg-dot" style={{ background: "var(--green)" }} />
              Gross Profit
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-hd">
            <div>
              <div className="card-title">Cost Distribution</div>
              <div className="card-desc">{`Year ${selectedYear}`}</div>
            </div>
          </div>

          <div className="cost-item">
            <div className="cost-lhs">
              <div className="cost-indicator" style={{ background: "var(--blue)" }} />
              <span className="cost-name">Fixed Costs</span>
            </div>
            <div className="cost-rhs">
              <div className="cost-bar-bg">
                <div className="cost-bar-fill" style={{ width: `${fixedPct}%`, background: "var(--blue)" }} />
              </div>
              <span className="cost-amount">{formatCurrency(fixedTotal)}</span>
            </div>
          </div>

          <div className="cost-item">
            <div className="cost-lhs">
              <div className="cost-indicator" style={{ background: "var(--amber)" }} />
              <span className="cost-name">Variable Costs</span>
            </div>
            <div className="cost-rhs">
              <div className="cost-bar-bg">
                <div className="cost-bar-fill" style={{ width: `${variablePct}%`, background: "var(--amber)" }} />
              </div>
              <span className="cost-amount">{formatCurrency(variableTotal)}</span>
            </div>
          </div>

          <div className="cost-item">
            <div className="cost-lhs">
              <div className="cost-indicator" style={{ background: "var(--red)" }} />
              <span className="cost-name">Failure Costs</span>
            </div>
            <div className="cost-rhs">
              <div className="cost-bar-bg">
                <div className="cost-bar-fill" style={{ width: `${failurePct}%`, background: "var(--red)" }} />
              </div>
              <span className="cost-amount neg">{formatCurrency(failureTotal)}</span>
            </div>
          </div>

          <div className="cost-footer">
            <span className="cost-footer-label">Total Costs</span>
            <span className="cost-footer-val">{formatCurrency(totalCosts)}</span>
          </div>

          <div className="cashflow">
            <div className="cf-head">{`Cash Flow · ${selectedYear}`}</div>
            <div className="cf-row">
              <span className="cf-label">Cash Received</span>
              <span className="cf-val pos">{formatCurrency(receivedTotal)}</span>
            </div>
            <div className="cf-row">
              <span className="cf-label">Cash Paid</span>
              <span className="cf-val neg">{formatCurrency(paidTotal)}</span>
            </div>
            <div className="cf-divider" />
            <div className="cf-row">
              <span className="cf-total-label">Closing Balance</span>
              <span className="cf-total-val">{formatCurrency(cashNetTotal)}</span>
            </div>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-hd">
          <div>
            <div className="card-title">Monthly Financial Summary</div>
            <div className="card-desc">{`Revenue · Gross Profit · Total Costs · Net Income · Year ${selectedYear}`}</div>
          </div>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Revenue (S$)</th>
                <th>Gross Profit (S$)</th>
                <th>Total Costs (S$)</th>
                <th>Net Income (S$)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {monthlyRows.map((row) => {
                const active = row.revenue > 0;
                return (
                  <tr key={row.month} className={active ? "row-active" : undefined}>
                    <td>{row.month}</td>
                    <td>{toDashMoney(row.revenue)}</td>
                    <td>{toDashMoney(row.grossProfit)}</td>
                    <td>{toDashMoney(row.costsTotal)}</td>
                    <td className={row.netIncome > 0 ? "col-pos" : undefined}>{toDashMoney(row.netIncome)}</td>
                    <td>
                      <span className={active ? "tag tag-blue" : "tag tag-gray"}>{active ? "Active" : "No data"}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td>{formatCurrency(revenueTotal)}</td>
                <td>{formatCurrency(grossProfitTotal)}</td>
                <td>{formatCurrency(totalCosts)}</td>
                <td className="col-pos">{formatCurrency(netIncomeTotal)}</td>
                <td>
                  <span className="tag tag-green">YTD</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
