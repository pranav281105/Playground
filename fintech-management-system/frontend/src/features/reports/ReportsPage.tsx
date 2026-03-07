import { useEffect, useState } from "react";

import { api } from "../../lib/api";

type IncomeStatement = {
  total_revenue: string;
  total_gross_profit: string;
  total_fixed_costs: string;
  total_variable_costs: string;
  total_failure_costs: string;
  net_income: string;
};

export function ReportsPage() {
  const [report, setReport] = useState<IncomeStatement | null>(null);

  useEffect(() => {
    api.get<IncomeStatement>("/reports/income-statement").then((response) => setReport(response.data));
  }, []);

  return (
    <div className="card">
      <h3>Income Statement</h3>
      {!report ? <p>Loading...</p> : null}
      {report ? (
        <ul>
          <li>Total Revenue: S$ {report.total_revenue}</li>
          <li>Gross Profit: S$ {report.total_gross_profit}</li>
          <li>Fixed Costs: S$ {report.total_fixed_costs}</li>
          <li>Variable Costs: S$ {report.total_variable_costs}</li>
          <li>Failure Costs: S$ {report.total_failure_costs}</li>
          <li>Net Income: S$ {report.net_income}</li>
        </ul>
      ) : null}
    </div>
  );
}
