import { FormEvent, useEffect, useMemo, useState } from "react";

import { useAuth } from "../auth/AuthContext";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/apiError";
import { formatCurrency, formatDate } from "../../lib/format";
import type { CostsResponse } from "../../lib/types";

type FailureType = "customer_return" | "damaged_goods" | "quality_defect" | "shipping_error" | "other";

const FAILURE_TYPE_OPTIONS: Array<{ value: FailureType; label: string }> = [
  { value: "customer_return", label: "Customer Return" },
  { value: "damaged_goods", label: "Damaged Goods" },
  { value: "quality_defect", label: "Quality Defect" },
  { value: "shipping_error", label: "Shipping Error" },
  { value: "other", label: "Other" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const OTHER_OPTION = "__other__";

const FIXED_COST_OPTIONS = [
  "Rent",
  "Insurance",
  "Bank Fees",
  "Licenses",
  "Utilities",
  "Internet / Phone",
];

const VARIABLE_COST_OPTIONS = [
  "Sales Commission",
  "Shipping",
  "Payroll",
  "Marketing Spend",
  "Supplies",
  "Transport",
];

function extractYearMonth(value: string): { year: number; monthIndex: number } | null {
  const match = value.match(/^(\d{4})-(\d{2})-\d{2}$/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (Number.isFinite(year) && Number.isFinite(month) && month >= 1 && month <= 12) {
      return { year, monthIndex: month - 1 };
    }
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return { year: date.getFullYear(), monthIndex: date.getMonth() };
}

function monthlyTotalsForRows(rows: Array<{ date: string; amount: string }>): number[] {
  const totals = Array<number>(12).fill(0);
  for (const row of rows) {
    const parsed = extractYearMonth(row.date);
    if (!parsed) {
      continue;
    }
    totals[parsed.monthIndex] += Number(row.amount) || 0;
  }
  return totals;
}

function sum(values: number[]): number {
  return values.reduce((accumulator, value) => accumulator + value, 0);
}

function buildSelectableYears(dataYears: number[]): number[] {
  const now = new Date().getFullYear();
  const years = new Set<number>(dataYears);
  for (let offset = -5; offset <= 5; offset += 1) {
    years.add(now + offset);
  }
  return Array.from(years).sort((left, right) => right - left);
}

export function CostsPage() {
  const { user } = useAuth();
  const canCreateCostEntry = Boolean(user?.branch_id);

  const [costs, setCosts] = useState<CostsResponse>({ fixed: [], variable: [], failure: [] });
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  const [fixedDate, setFixedDate] = useState("");
  const [fixedCategory, setFixedCategory] = useState(FIXED_COST_OPTIONS[0]);
  const [fixedCustomDescription, setFixedCustomDescription] = useState("");
  const [fixedAmount, setFixedAmount] = useState("");
  const [fixedRemarks, setFixedRemarks] = useState("");

  const [variableDate, setVariableDate] = useState("");
  const [variableCategory, setVariableCategory] = useState(VARIABLE_COST_OPTIONS[0]);
  const [variableCustomDescription, setVariableCustomDescription] = useState("");
  const [variableAmount, setVariableAmount] = useState("");
  const [variableRemarks, setVariableRemarks] = useState("");

  const [failureType, setFailureType] = useState<FailureType>("other");
  const [failureAmount, setFailureAmount] = useState("");
  const [failureDate, setFailureDate] = useState("");
  const [failureRootCause, setFailureRootCause] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadCosts = () => {
    api
      .get<CostsResponse>("/costs")
      .then((response) => setCosts(response.data))
      .catch((requestError: unknown) => setError(getApiErrorMessage(requestError, "Failed to load costs")));
  };

  useEffect(() => {
    loadCosts();
  }, []);

  const availableYears = useMemo(() => {
    const years: number[] = [];
    const addYear = (value: string) => {
      const parsed = extractYearMonth(value);
      if (parsed) {
        years.push(parsed.year);
      }
    };

    costs.fixed.forEach((item) => addYear(item.date));
    costs.variable.forEach((item) => addYear(item.date));
    costs.failure.forEach((item) => addYear(item.date));
    return buildSelectableYears(years);
  }, [costs]);

  useEffect(() => {
    const currentYear = new Date().getFullYear();
    if (!availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears.includes(currentYear) ? currentYear : availableYears[0]);
    }
  }, [availableYears, selectedYear]);

  const filteredFixed = useMemo(
    () =>
      costs.fixed.filter((item) => {
        const parsed = extractYearMonth(item.date);
        return parsed?.year === selectedYear;
      }),
    [costs.fixed, selectedYear],
  );
  const filteredVariable = useMemo(
    () =>
      costs.variable.filter((item) => {
        const parsed = extractYearMonth(item.date);
        return parsed?.year === selectedYear;
      }),
    [costs.variable, selectedYear],
  );
  const filteredFailure = useMemo(
    () =>
      costs.failure.filter((item) => {
        const parsed = extractYearMonth(item.date);
        return parsed?.year === selectedYear;
      }),
    [costs.failure, selectedYear],
  );

  const fixedMonthlyTotals = useMemo(() => monthlyTotalsForRows(filteredFixed), [filteredFixed]);
  const variableMonthlyTotals = useMemo(() => monthlyTotalsForRows(filteredVariable), [filteredVariable]);

  const fixedCategoryValue =
    fixedCategory === OTHER_OPTION ? fixedCustomDescription.trim() : fixedCategory;
  const variableCategoryValue =
    variableCategory === OTHER_OPTION ? variableCustomDescription.trim() : variableCategory;

  const submitFixed = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!canCreateCostEntry) {
      setError("Cost entry creation requires a user assigned to a branch.");
      return;
    }
    if (!fixedCategoryValue) {
      setError("Select or enter a fixed cost description.");
      return;
    }

    try {
      await api.post("/costs/fixed", {
        category: fixedCategoryValue,
        amount: fixedAmount,
        date: fixedDate,
        description: fixedRemarks || undefined,
      });
      setFixedDate("");
      setFixedCategory(FIXED_COST_OPTIONS[0]);
      setFixedCustomDescription("");
      setFixedAmount("");
      setFixedRemarks("");
      setSuccess("Fixed cost added.");
      loadCosts();
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError, "Failed to save fixed cost entry"));
    }
  };

  const submitVariable = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!canCreateCostEntry) {
      setError("Cost entry creation requires a user assigned to a branch.");
      return;
    }
    if (!variableCategoryValue) {
      setError("Select or enter a variable cost description.");
      return;
    }

    try {
      await api.post("/costs/variable", {
        category: variableCategoryValue,
        amount: variableAmount,
        date: variableDate,
        description: variableRemarks || undefined,
      });
      setVariableDate("");
      setVariableCategory(VARIABLE_COST_OPTIONS[0]);
      setVariableCustomDescription("");
      setVariableAmount("");
      setVariableRemarks("");
      setSuccess("Variable cost added.");
      loadCosts();
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError, "Failed to save variable cost entry"));
    }
  };

  const submitFailure = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!canCreateCostEntry) {
      setError("Cost entry creation requires a user assigned to a branch.");
      return;
    }

    try {
      await api.post("/costs/failure", {
        failure_type: failureType,
        amount: failureAmount,
        date: failureDate,
        root_cause: failureRootCause || undefined,
      });
      setFailureType("other");
      setFailureAmount("");
      setFailureDate("");
      setFailureRootCause("");
      setSuccess("Failure cost added.");
      loadCosts();
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError, "Failed to save failure cost entry"));
    }
  };

  return (
    <div className="stack">
      <section className="card">
        <div className="cost-page-header">
          <h3>Costs</h3>
          <div className="cost-page-controls">
            <label htmlFor="cost-year">Year</label>
            <select id="cost-year" value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </div>
        {error ? <p className="error">{error}</p> : null}
        {success ? <p>{success}</p> : null}
      </section>

      <section className="card cost-sheet fixed">
        <h3>{`Fixed Costs - Year ${selectedYear}`}</h3>
        <p className="cost-sheet-subtitle">(Rent, Insurance, Fees, Licenses, Utilities, etc.)</p>
        {canCreateCostEntry ? (
          <form className="inline-form" onSubmit={submitFixed}>
            <input type="date" value={fixedDate} onChange={(event) => setFixedDate(event.target.value)} required />
            <select value={fixedCategory} onChange={(event) => setFixedCategory(event.target.value)}>
              {FIXED_COST_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
              <option value={OTHER_OPTION}>Other...</option>
            </select>
            {fixedCategory === OTHER_OPTION ? (
              <input
                placeholder="Custom Description"
                value={fixedCustomDescription}
                onChange={(event) => setFixedCustomDescription(event.target.value)}
                required
              />
            ) : null}
            <input
              placeholder="Amount (S$)"
              inputMode="decimal"
              value={fixedAmount}
              onChange={(event) => setFixedAmount(event.target.value)}
              required
            />
            <input placeholder="Remarks" value={fixedRemarks} onChange={(event) => setFixedRemarks(event.target.value)} />
            <button type="submit">Add Fixed Cost</button>
          </form>
        ) : (
          <p>Cost entry creation is disabled for users without a branch assignment.</p>
        )}

        <div className="cost-sheet-layout">
          <div className="table-scroll">
            <table className="data-table cost-ledger-table">
              <thead>
                <tr>
                  <th>S.No</th>
                  <th>Invoice Date</th>
                  <th>Description</th>
                  <th>Amount (S$)</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {filteredFixed.map((item, index) => (
                  <tr key={item.fixed_cost_id}>
                    <td>{index + 1}</td>
                    <td>{formatDate(item.date)}</td>
                    <td>{item.category}</td>
                    <td className="align-right">{formatCurrency(item.amount)}</td>
                    <td>{item.description ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-scroll">
            <h4>Expenses by Month</h4>
            <table className="data-table cost-monthly-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Expenses in S$</th>
                </tr>
              </thead>
              <tbody>
                {MONTHS.map((month, index) => (
                  <tr key={month}>
                    <td>{month}</td>
                    <td className="align-right">{formatCurrency(fixedMonthlyTotals[index] ?? 0)}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td>Total</td>
                  <td className="align-right">{formatCurrency(sum(fixedMonthlyTotals))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="card cost-sheet variable">
        <h3>{`Variable Costs - Year ${selectedYear}`}</h3>
        <p className="cost-sheet-subtitle">(Payroll, Shipping, Equipment, Marketing, Other expenses, etc.)</p>
        {canCreateCostEntry ? (
          <form className="inline-form" onSubmit={submitVariable}>
            <input type="date" value={variableDate} onChange={(event) => setVariableDate(event.target.value)} required />
            <select value={variableCategory} onChange={(event) => setVariableCategory(event.target.value)}>
              {VARIABLE_COST_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
              <option value={OTHER_OPTION}>Other...</option>
            </select>
            {variableCategory === OTHER_OPTION ? (
              <input
                placeholder="Custom Description"
                value={variableCustomDescription}
                onChange={(event) => setVariableCustomDescription(event.target.value)}
                required
              />
            ) : null}
            <input
              placeholder="Amount (S$)"
              inputMode="decimal"
              value={variableAmount}
              onChange={(event) => setVariableAmount(event.target.value)}
              required
            />
            <input placeholder="Remarks" value={variableRemarks} onChange={(event) => setVariableRemarks(event.target.value)} />
            <button type="submit">Add Variable Cost</button>
          </form>
        ) : (
          <p>Cost entry creation is disabled for users without a branch assignment.</p>
        )}

        <div className="cost-sheet-layout">
          <div className="table-scroll">
            <table className="data-table cost-ledger-table">
              <thead>
                <tr>
                  <th>S.No</th>
                  <th>Invoice Date</th>
                  <th>Description</th>
                  <th>Amount (S$)</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {filteredVariable.map((item, index) => (
                  <tr key={item.variable_cost_id}>
                    <td>{index + 1}</td>
                    <td>{formatDate(item.date)}</td>
                    <td>{item.category}</td>
                    <td className="align-right">{formatCurrency(item.amount)}</td>
                    <td>{item.description ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-scroll">
            <h4>Expenses by Month</h4>
            <table className="data-table cost-monthly-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Expenses in S$</th>
                </tr>
              </thead>
              <tbody>
                {MONTHS.map((month, index) => (
                  <tr key={month}>
                    <td>{month}</td>
                    <td className="align-right">{formatCurrency(variableMonthlyTotals[index] ?? 0)}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td>Total</td>
                  <td className="align-right">{formatCurrency(sum(variableMonthlyTotals))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="card">
        <h3>{`Failure Costs - Year ${selectedYear}`}</h3>
        {canCreateCostEntry ? (
          <form className="inline-form" onSubmit={submitFailure}>
            <select value={failureType} onChange={(event) => setFailureType(event.target.value as FailureType)}>
              {FAILURE_TYPE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <input type="date" value={failureDate} onChange={(event) => setFailureDate(event.target.value)} required />
            <input
              placeholder="Amount (S$)"
              inputMode="decimal"
              value={failureAmount}
              onChange={(event) => setFailureAmount(event.target.value)}
              required
            />
            <input
              placeholder="Root Cause"
              value={failureRootCause}
              onChange={(event) => setFailureRootCause(event.target.value)}
            />
            <button type="submit">Add Failure Cost</button>
          </form>
        ) : null}
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Failure Type</th>
              <th>Amount</th>
              <th>Root Cause</th>
            </tr>
          </thead>
          <tbody>
            {filteredFailure.map((item) => (
              <tr key={item.failure_cost_id}>
                <td>{formatDate(item.date)}</td>
                <td>{item.failure_type}</td>
                <td className="align-right">{formatCurrency(item.amount)}</td>
                <td>{item.root_cause ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
