import { useEffect, useState } from "react";

import { api } from "../../lib/api";
import { DashboardSummary } from "../../lib/types";

const empty: DashboardSummary = {
  total_revenue: "0.00",
  gross_profit: "0.00",
  total_costs: "0.00",
  net_income: "0.00",
  gross_profit_margin: "0.00",
  net_margin: "0.00",
};

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary>(empty);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<DashboardSummary>("/dashboard/summary")
      .then((response) => setSummary(response.data))
      .catch(() => setError("Failed to load dashboard summary"));
  }, []);

  return (
    <div className="grid">
      {error ? <div className="card">{error}</div> : null}
      <MetricCard label="Total Revenue" value={`S$ ${summary.total_revenue}`} />
      <MetricCard label="Gross Profit" value={`S$ ${summary.gross_profit}`} />
      <MetricCard label="Total Costs" value={`S$ ${summary.total_costs}`} />
      <MetricCard label="Net Income" value={`S$ ${summary.net_income}`} />
      <MetricCard label="GP Margin" value={`${summary.gross_profit_margin}%`} />
      <MetricCard label="Net Margin" value={`${summary.net_margin}%`} />
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <section className="card">
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
    </section>
  );
}
