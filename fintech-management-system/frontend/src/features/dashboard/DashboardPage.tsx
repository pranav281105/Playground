import { useEffect, useMemo, useState } from "react";

import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/apiError";
import { formatCurrency } from "../../lib/format";
import type { CostsResponse, Payment, RevenueTrendPoint, VendorPayment } from "../../lib/types";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const EMPTY_COSTS: CostsResponse = { fixed: [], variable: [], failure: [] };

type MonthRow = {
  month: string;
  values: number[];
};

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

function toQuarterTotals(values: number[]): number[] {
  return [0, 1, 2, 3].map((quarterIndex) => {
    const start = quarterIndex * 3;
    return sum(values.slice(start, start + 3));
  });
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

function buildCostSeries(
  rows: Array<{
    amount: string;
    date: string;
  }>,
  selectedYear: number,
): number[] {
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

function buildPaymentSeries(
  rows: Array<{
    amount: string;
    payment_date: string;
  }>,
  selectedYear: number,
): number[] {
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

function toMonthRows(columns: number[][]): MonthRow[] {
  return MONTH_LABELS.map((month, index) => ({
    month,
    values: columns.map((column) => column[index] ?? 0),
  }));
}

export function DashboardPage() {
  const [trend, setTrend] = useState<RevenueTrendPoint[]>([]);
  const [costs, setCosts] = useState<CostsResponse>(EMPTY_COSTS);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [vendorPayments, setVendorPayments] = useState<VendorPayment[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<RevenueTrendPoint[]>("/dashboard/revenue-trend", { params: { months: 24 } }),
      api.get<CostsResponse>("/costs"),
      api.get<Payment[]>("/payments"),
      api.get<VendorPayment[]>("/vendor-payments"),
    ])
      .then(([trendResponse, costResponse, paymentResponse, vendorPaymentResponse]) => {
        setTrend(trendResponse.data);
        setCosts(costResponse.data);
        setPayments(paymentResponse.data);
        setVendorPayments(vendorPaymentResponse.data);
      })
      .catch((requestError: unknown) => setError(getApiErrorMessage(requestError, "Failed to load dashboard data")));
  }, []);

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

  return (
    <div className="dashboard-sheet">
      {error ? <div className="card error">{error}</div> : null}

      <section className="card">
        <div className="dashboard-toolbar">
          <h2>Dashboard</h2>
          <div className="dashboard-controls">
            <label htmlFor="dashboard-year">Year</label>
            <select
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
            <button type="button" onClick={() => setSelectedYear(new Date().getFullYear())}>
              Reset
            </button>
          </div>
        </div>
      </section>

      <div className="financial-grid">
        <section className="financial-panel revenue">
          <h3>Revenue</h3>
          <div className="financial-panel-body">
            <SummaryTile
              year={selectedYear}
              total={revenueTotal}
              lines={[`Gross Profit: ${formatCurrency(grossProfitTotal)}`, `Margin: ${toRatio(grossProfitTotal, revenueTotal)}`]}
            />
            <QuarterTable values={toQuarterTotals(revenueByMonth)} header="Revenue (S$)" />
            <MonthTable
              headers={["Revenue (S$)", "Gross Profit (S$)"]}
              rows={toMonthRows([revenueByMonth, grossProfitByMonth])}
            />
          </div>
        </section>

        <section className="financial-panel net-income">
          <h3>Net Income</h3>
          <div className="financial-panel-body">
            <SummaryTile
              year={selectedYear}
              total={netIncomeTotal}
              lines={[`Net Margin: ${toRatio(netIncomeTotal, revenueTotal)}`]}
            />
            <QuarterTable values={toQuarterTotals(netIncomeByMonth)} header="Net Income (S$)" />
            <MonthTable headers={["Net Income (S$)"]} rows={toMonthRows([netIncomeByMonth])} />
          </div>
        </section>

        <section className="financial-panel fixed-cost">
          <h3>Fixed Cost</h3>
          <div className="financial-panel-body">
            <SummaryTile year={selectedYear} total={fixedTotal} />
            <QuarterTable values={toQuarterTotals(fixedByMonth)} header="Fixed Cost (S$)" />
            <MonthTable headers={["Amount (S$)"]} rows={toMonthRows([fixedByMonth])} />
          </div>
        </section>

        <section className="financial-panel variable-cost">
          <h3>Variable Cost</h3>
          <div className="financial-panel-body">
            <SummaryTile year={selectedYear} total={variableTotal} />
            <QuarterTable values={toQuarterTotals(variableByMonth)} header="Variable Cost (S$)" />
            <MonthTable headers={["Amount (S$)"]} rows={toMonthRows([variableByMonth])} />
          </div>
        </section>

        <section className="financial-panel failure-cost">
          <h3>Failure Cost</h3>
          <div className="financial-panel-body">
            <SummaryTile year={selectedYear} total={failureTotal} />
            <QuarterTable values={toQuarterTotals(failureByMonth)} header="Failure Cost (S$)" />
            <MonthTable headers={["Amount (S$)"]} rows={toMonthRows([failureByMonth])} />
          </div>
        </section>

        <section className="financial-panel history">
          <h3>History</h3>
          <div className="financial-panel-body">
            <SummaryTile
              year={selectedYear}
              total={cashNetTotal}
              lines={[`Received: ${formatCurrency(receivedTotal)}`, `Paid: ${formatCurrency(paidTotal)}`]}
            />
            <QuarterTable values={toQuarterTotals(cashNetByMonth)} header="Net Cash (S$)" />
            <MonthTable
              headers={["Received (S$)", "Paid (S$)", "Net (S$)"]}
              rows={toMonthRows([receivedByMonth, paidByMonth, cashNetByMonth])}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function SummaryTile({ year, total, lines = [] }: { year: number; total: number; lines?: string[] }) {
  return (
    <article className="summary-tile">
      <p className="summary-year">Year {year}</p>
      <p className="summary-value">{formatCurrency(total)}</p>
      {lines.map((line) => (
        <p key={line} className="summary-line">
          {line}
        </p>
      ))}
    </article>
  );
}

function QuarterTable({ values, header }: { values: number[]; header: string }) {
  return (
    <article className="mini-table-wrap">
      <table className="mini-table">
        <thead>
          <tr>
            <th>Quarter</th>
            <th>{header}</th>
          </tr>
        </thead>
        <tbody>
          {values.map((value, index) => (
            <tr key={`q-${index + 1}`}>
              <td>{`Q${index + 1}`}</td>
              <td className="align-right">{formatCurrency(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}

function MonthTable({ headers, rows }: { headers: string[]; rows: MonthRow[] }) {
  return (
    <article className="mini-table-wrap">
      <table className="mini-table">
        <thead>
          <tr>
            <th>Month</th>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.month}>
              <td>{row.month}</td>
              {row.values.map((value, valueIndex) => (
                <td key={`${row.month}-${valueIndex}`} className="align-right">
                  {formatCurrency(value)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}
