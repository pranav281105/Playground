import { useEffect, useState } from "react";

import { api } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import type { CashFlowReport, IncomeStatement, RevenueSummaryItem } from "../../lib/types";

export function ReportsPage() {
  const [incomeStatement, setIncomeStatement] = useState<IncomeStatement | null>(null);
  const [revenueSummary, setRevenueSummary] = useState<RevenueSummaryItem[]>([]);
  const [cashFlow, setCashFlow] = useState<CashFlowReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<IncomeStatement>("/reports/income-statement"),
      api.get<RevenueSummaryItem[]>("/reports/revenue-summary", { params: { months: 6 } }),
      api.get<CashFlowReport>("/reports/cash-flow", { params: { opening_balance: "0.00" } }),
    ])
      .then(([incomeResponse, summaryResponse, cashResponse]) => {
        setIncomeStatement(incomeResponse.data);
        setRevenueSummary(summaryResponse.data);
        setCashFlow(cashResponse.data);
      })
      .catch(() => setError("Failed to load report data"));
  }, []);

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
      {error ? <div className="card error">{error}</div> : null}

      <section className="card">
        <h3>Income Statement</h3>
        <button onClick={() => void downloadCsv("/reports/income-statement/export", "income_statement.csv")}>Export CSV</button>
        {incomeStatement ? (
          <ul className="report-list">
            <li>Total Revenue: {formatCurrency(incomeStatement.total_revenue)}</li>
            <li>Total Gross Profit: {formatCurrency(incomeStatement.total_gross_profit)}</li>
            <li>Total Fixed Costs: {formatCurrency(incomeStatement.total_fixed_costs)}</li>
            <li>Total Variable Costs: {formatCurrency(incomeStatement.total_variable_costs)}</li>
            <li>Total Failure Costs: {formatCurrency(incomeStatement.total_failure_costs)}</li>
            <li>Net Income: {formatCurrency(incomeStatement.net_income)}</li>
          </ul>
        ) : (
          <p>Loading...</p>
        )}
      </section>

      <section className="card">
        <h3>Revenue Summary</h3>
        <button onClick={() => void downloadCsv("/reports/revenue-summary/export?months=6", "revenue_summary.csv")}>Export CSV</button>
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
            {revenueSummary.map((row) => (
              <tr key={row.month}>
                <td>{row.month}</td>
                <td className="align-right">{formatCurrency(row.total_revenue)}</td>
                <td className="align-right">{formatCurrency(row.total_gross_profit)}</td>
                <td className="align-right">{row.gross_margin}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h3>Cash Flow</h3>
        <button onClick={() => void downloadCsv("/reports/cash-flow/export?opening_balance=0.00", "cash_flow.csv")}>Export CSV</button>
        {cashFlow ? (
          <ul className="report-list">
            <li>Opening Balance: {formatCurrency(cashFlow.opening_balance)}</li>
            <li>Cash Received: {formatCurrency(cashFlow.cash_received)}</li>
            <li>Cash Paid: {formatCurrency(cashFlow.cash_paid)}</li>
            <li>Closing Balance: {formatCurrency(cashFlow.closing_balance)}</li>
          </ul>
        ) : (
          <p>Loading...</p>
        )}
      </section>
    </div>
  );
}
