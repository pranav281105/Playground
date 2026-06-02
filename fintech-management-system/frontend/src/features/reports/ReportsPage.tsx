import { useEffect, useMemo, useState } from "react";

import { api } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import type { CashFlowReport, IncomeStatement, RevenueSummaryItem } from "../../lib/types";

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

export function ReportsPage() {
  const [incomeStatement, setIncomeStatement] = useState<IncomeStatement | null>(null);
  const [revenueSummary, setRevenueSummary] = useState<RevenueSummaryItem[]>([]);
  const [cashFlow, setCashFlow] = useState<CashFlowReport | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<IncomeStatement>("/reports/income-statement"),
      api.get<RevenueSummaryItem[]>("/reports/revenue-summary", { params: { months: 24 } }),
      api.get<CashFlowReport>("/reports/cash-flow", { params: { opening_balance: "0.00" } }),
    ])
      .then(([incomeResponse, summaryResponse, cashResponse]) => {
        setIncomeStatement(incomeResponse.data);
        setRevenueSummary(summaryResponse.data);
        setCashFlow(cashResponse.data);
      })
      .catch(() => setError("Failed to load report data"));
  }, []);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const row of revenueSummary) {
      const year = parseYear(row.month);
      if (year) {
        years.add(year);
      }
    }
    if (years.size === 0) {
      years.add(new Date().getFullYear());
    }
    return Array.from(years).sort((left, right) => right - left);
  }, [revenueSummary]);

  useEffect(() => {
    if (!availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears, selectedYear]);

  const filteredSummary = useMemo(
    () =>
      revenueSummary.filter((row) => {
        const year = parseYear(row.month);
        return year === selectedYear;
      }),
    [revenueSummary, selectedYear],
  );

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

  return (
    <div className="stack">
      <div className="pg-head">
        <div>
          <div className="pg-title">Reports</div>
          <div className="pg-meta">Income statement, monthly revenue summary, and cash flow exports.</div>
        </div>
        <div className="yr-ctrl">
          <span className="yr-lbl">Year</span>
          <select className="yr-sel" value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
            {availableYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? <div className="card error">{error}</div> : null}

      <section className="card rcard">
        <div className="rcard-hd">
          <div>
            <div className="rcard-title">Income Statement</div>
            <div className="rcard-meta">All available data</div>
          </div>
          <button className="btn-export" onClick={() => void downloadCsv("/reports/income-statement/export", "income_statement.csv")}>Export CSV</button>
        </div>

        {incomeStatement ? (
          <div className="income-body">
            <div className="income-section">
              <div className="income-section-label">Revenue</div>
              <div className="income-row">
                <span className="income-label">Total Revenue</span>
                <span className="income-value pos">{formatCurrency(incomeStatement.total_revenue)}</span>
              </div>
              <div className="income-row">
                <span className="income-label">Total Gross Profit</span>
                <span className="income-value pos">{formatCurrency(incomeStatement.total_gross_profit)}</span>
              </div>
            </div>

            <div className="income-section">
              <div className="income-section-label">Operating Costs</div>
              <div className="income-row">
                <span className="income-label">Total Fixed Costs</span>
                <span className="income-value neg">{formatCurrency(incomeStatement.total_fixed_costs)}</span>
              </div>
              <div className="income-row">
                <span className="income-label">Total Variable Costs</span>
                <span className="income-value neg">{formatCurrency(incomeStatement.total_variable_costs)}</span>
              </div>
              <div className="income-row">
                <span className="income-label">Total Failure Costs</span>
                <span className="income-value neg">{formatCurrency(incomeStatement.total_failure_costs)}</span>
              </div>
            </div>

            <div className="income-section">
              <div className="income-row net">
                <span className="income-label">Net Income</span>
                <span className="income-value">{formatCurrency(incomeStatement.net_income)}</span>
              </div>
            </div>
          </div>
        ) : (
          <p className="card-body">Loading...</p>
        )}
      </section>

      <section className="card rcard">
        <div className="rcard-hd">
          <div>
            <div className="rcard-title">Revenue Summary</div>
            <div className="rcard-meta">{`Monthly breakdown · Year ${selectedYear}`}</div>
          </div>
          <button
            className="btn-export"
            onClick={() => void downloadCsv("/reports/revenue-summary/export?months=24", "revenue_summary.csv")}
          >
            Export CSV
          </button>
        </div>

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Revenue</th>
                <th>Gross Profit</th>
                <th>Margin</th>
              </tr>
            </thead>
            <tbody>
              {filteredSummary.map((row) => (
                <tr key={row.month}>
                  <td>{row.month}</td>
                  <td className="align-right">{formatCurrency(row.total_revenue)}</td>
                  <td className="align-right">{formatCurrency(row.total_gross_profit)}</td>
                  <td className="align-right">{row.gross_margin}%</td>
                </tr>
              ))}
              {filteredSummary.length === 0 ? (
                <tr>
                  <td colSpan={4}>No revenue rows for selected year.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card rcard">
        <div className="rcard-hd">
          <div>
            <div className="rcard-title">Cash Flow</div>
            <div className="rcard-meta">All available data</div>
          </div>
          <button className="btn-export" onClick={() => void downloadCsv("/reports/cash-flow/export?opening_balance=0.00", "cash_flow.csv")}>Export CSV</button>
        </div>

        {cashFlow ? (
          <div className="cf-body">
            <div className="cf-row">
              <span className="cf-label">Opening Balance</span>
              <span className="cf-value">{formatCurrency(cashFlow.opening_balance)}</span>
            </div>
            <div className="cf-row">
              <span className="cf-label">Cash Received</span>
              <span className="cf-value pos">{formatCurrency(cashFlow.cash_received)}</span>
            </div>
            <div className="cf-row">
              <span className="cf-label">Cash Paid</span>
              <span className="cf-value neg">{formatCurrency(cashFlow.cash_paid)}</span>
            </div>
            <div className="cf-row total">
              <span className="cf-label">Closing Balance</span>
              <span className="cf-value">{formatCurrency(cashFlow.closing_balance)}</span>
            </div>
          </div>
        ) : (
          <p className="card-body">Loading...</p>
        )}
      </section>
    </div>
  );
}
