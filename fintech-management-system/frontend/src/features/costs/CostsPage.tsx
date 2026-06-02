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

  const failureTotal = useMemo(
    () => filteredFailure.reduce((accumulator, item) => accumulator + (Number(item.amount) || 0), 0),
    [filteredFailure],
  );

  return (
    <div className="stack">
      <div className="pg-head">
        <div>
          <div className="pg-title">Costs</div>
          <div className="pg-meta">{`Branch ID: ${user?.branch_id ?? "Unassigned"} · Phase 1 financial operations console.`}</div>
        </div>
        <div className="yr-ctrl">
          <span className="yr-lbl">Year</span>
          <select className="yr-sel" id="cost-year" value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
            {availableYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? <div className="fmsg err show">{error}</div> : null}
      {success ? <div className="fmsg ok show">{success}</div> : null}

      <section className="cost-section">
        <div className="section-label">
          <div className="section-title">{`Fixed Costs - Year ${selectedYear}`}</div>
          <div className="section-sub">(Rent, Insurance, Fees, Licenses, Utilities, etc.)</div>
        </div>

        <div className="form-card">
          <div className="form-card-body">
            {canCreateCostEntry ? (
              <form className="form-row" onSubmit={submitFixed}>
                <input
                  className="fi fw-date"
                  type={fixedDate ? "date" : "text"}
                  placeholder="dd/mm/yyyy"
                  value={fixedDate}
                  onFocus={(event) => {
                    event.currentTarget.type = "date";
                  }}
                  onBlur={(event) => {
                    if (!event.currentTarget.value) {
                      event.currentTarget.type = "text";
                    }
                  }}
                  onChange={(event) => setFixedDate(event.target.value)}
                  required
                />
                <select className="fs fw-type" value={fixedCategory} onChange={(event) => setFixedCategory(event.target.value)}>
                  {FIXED_COST_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                  <option value={OTHER_OPTION}>Other...</option>
                </select>
                {fixedCategory === OTHER_OPTION ? (
                  <input
                    className="fi fw-type"
                    placeholder="Custom Description"
                    value={fixedCustomDescription}
                    onChange={(event) => setFixedCustomDescription(event.target.value)}
                    required
                  />
                ) : null}
                <input
                  className="fi fw-amount"
                  placeholder="Amount (S$)"
                  inputMode="decimal"
                  value={fixedAmount}
                  onChange={(event) => setFixedAmount(event.target.value)}
                  required
                />
                <input className="fi fw-remark" placeholder="Remarks" value={fixedRemarks} onChange={(event) => setFixedRemarks(event.target.value)} />
                <button className="btn-cost" type="submit">
                  Add Fixed Cost
                </button>
              </form>
            ) : (
              <div className="form-hint">Cost entry creation is disabled for users without a branch assignment.</div>
            )}
          </div>
        </div>

        <div className="tbl-row">
          <div className="tbl-card fixed">
            <div className="tbl-card-hd">
              <div className="tbl-card-title">Fixed Cost Entries</div>
              <div className="tbl-card-meta">{`${filteredFixed.length} entr${filteredFixed.length === 1 ? "y" : "ies"}`}</div>
            </div>
            <div className="tscroll">
              <table>
                <thead>
                  <tr>
                    <th className="l">S.No</th>
                    <th className="l">Invoice Date</th>
                    <th className="l">Description</th>
                    <th>Amount (S$)</th>
                    <th className="l">Remarks</th>
                    <th className="l">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFixed.length === 0 ? (
                    <tr className="empty">
                      <td className="l" colSpan={6}>
                        No entries yet.
                      </td>
                    </tr>
                  ) : (
                    filteredFixed.map((item, index) => (
                      <tr key={item.fixed_cost_id} className="on">
                        <td className="l">{index + 1}</td>
                        <td className="l">{formatDate(item.date)}</td>
                        <td className="l hi">{item.category}</td>
                        <td>{formatCurrency(item.amount)}</td>
                        <td className="l">{item.description ?? "-"}</td>
                        <td className="l">-</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="tbl-card">
            <div className="tbl-card-hd">
              <div className="tbl-card-title">By Month</div>
            </div>
            <div className="tscroll">
              <table className="mon-tbl">
                <thead>
                  <tr>
                    <th className="l">Month</th>
                    <th>Expenses (S$)</th>
                  </tr>
                </thead>
                <tbody>
                  {MONTHS.map((month, index) => {
                    const value = fixedMonthlyTotals[index] ?? 0;
                    return (
                      <tr key={month} className={value > 0 ? "on" : undefined}>
                        <td className="l">{month}</td>
                        <td>{value > 0 ? formatCurrency(value) : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="l">Total</td>
                    <td>{sum(fixedMonthlyTotals) > 0 ? formatCurrency(sum(fixedMonthlyTotals)) : "-"}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section className="cost-section">
        <div className="section-label">
          <div className="section-title">{`Variable Costs - Year ${selectedYear}`}</div>
          <div className="section-sub">(Payroll, Shipping, Equipment, Marketing, Other expenses, etc.)</div>
        </div>

        <div className="form-card">
          <div className="form-card-body">
            {canCreateCostEntry ? (
              <form className="form-row" onSubmit={submitVariable}>
                <input
                  className="fi fw-date"
                  type={variableDate ? "date" : "text"}
                  placeholder="dd/mm/yyyy"
                  value={variableDate}
                  onFocus={(event) => {
                    event.currentTarget.type = "date";
                  }}
                  onBlur={(event) => {
                    if (!event.currentTarget.value) {
                      event.currentTarget.type = "text";
                    }
                  }}
                  onChange={(event) => setVariableDate(event.target.value)}
                  required
                />
                <select className="fs fw-type" value={variableCategory} onChange={(event) => setVariableCategory(event.target.value)}>
                  {VARIABLE_COST_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                  <option value={OTHER_OPTION}>Other...</option>
                </select>
                {variableCategory === OTHER_OPTION ? (
                  <input
                    className="fi fw-type"
                    placeholder="Custom Description"
                    value={variableCustomDescription}
                    onChange={(event) => setVariableCustomDescription(event.target.value)}
                    required
                  />
                ) : null}
                <input
                  className="fi fw-amount"
                  placeholder="Amount (S$)"
                  inputMode="decimal"
                  value={variableAmount}
                  onChange={(event) => setVariableAmount(event.target.value)}
                  required
                />
                <input className="fi fw-remark" placeholder="Remarks" value={variableRemarks} onChange={(event) => setVariableRemarks(event.target.value)} />
                <button className="btn-cost amber" type="submit">
                  Add Variable Cost
                </button>
              </form>
            ) : (
              <div className="form-hint">Cost entry creation is disabled for users without a branch assignment.</div>
            )}
          </div>
        </div>

        <div className="tbl-row">
          <div className="tbl-card variable">
            <div className="tbl-card-hd">
              <div className="tbl-card-title">Variable Cost Entries</div>
              <div className="tbl-card-meta">{`${filteredVariable.length} entr${filteredVariable.length === 1 ? "y" : "ies"}`}</div>
            </div>
            <div className="tscroll">
              <table>
                <thead>
                  <tr>
                    <th className="l">S.No</th>
                    <th className="l">Invoice Date</th>
                    <th className="l">Description</th>
                    <th>Amount (S$)</th>
                    <th className="l">Remarks</th>
                    <th className="l">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVariable.length === 0 ? (
                    <tr className="empty">
                      <td className="l" colSpan={6}>
                        No entries yet.
                      </td>
                    </tr>
                  ) : (
                    filteredVariable.map((item, index) => (
                      <tr key={item.variable_cost_id} className="on">
                        <td className="l">{index + 1}</td>
                        <td className="l">{formatDate(item.date)}</td>
                        <td className="l hi">{item.category}</td>
                        <td>{formatCurrency(item.amount)}</td>
                        <td className="l">{item.description ?? "-"}</td>
                        <td className="l">-</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="tbl-card">
            <div className="tbl-card-hd">
              <div className="tbl-card-title">By Month</div>
            </div>
            <div className="tscroll">
              <table className="mon-tbl">
                <thead>
                  <tr>
                    <th className="l">Month</th>
                    <th>Expenses (S$)</th>
                  </tr>
                </thead>
                <tbody>
                  {MONTHS.map((month, index) => {
                    const value = variableMonthlyTotals[index] ?? 0;
                    return (
                      <tr key={month} className={value > 0 ? "on" : undefined}>
                        <td className="l">{month}</td>
                        <td>{value > 0 ? formatCurrency(value) : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="l">Total</td>
                    <td>{sum(variableMonthlyTotals) > 0 ? formatCurrency(sum(variableMonthlyTotals)) : "-"}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section className="cost-section">
        <div className="section-label">
          <div className="section-title">{`Failure Costs - Year ${selectedYear}`}</div>
          <div className="section-sub">(Defects, Returns, Rework, Customer complaints, etc.)</div>
        </div>

        <div className="form-card">
          <div className="form-card-body">
            {canCreateCostEntry ? (
              <form className="form-row" onSubmit={submitFailure}>
                <select className="fs fw-type" value={failureType} onChange={(event) => setFailureType(event.target.value as FailureType)}>
                  {FAILURE_TYPE_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <input
                  className="fi fw-date"
                  type={failureDate ? "date" : "text"}
                  placeholder="dd/mm/yyyy"
                  value={failureDate}
                  onFocus={(event) => {
                    event.currentTarget.type = "date";
                  }}
                  onBlur={(event) => {
                    if (!event.currentTarget.value) {
                      event.currentTarget.type = "text";
                    }
                  }}
                  onChange={(event) => setFailureDate(event.target.value)}
                  required
                />
                <input
                  className="fi fw-amount"
                  placeholder="Amount (S$)"
                  inputMode="decimal"
                  value={failureAmount}
                  onChange={(event) => setFailureAmount(event.target.value)}
                  required
                />
                <input className="fi fw-root" placeholder="Root Cause" value={failureRootCause} onChange={(event) => setFailureRootCause(event.target.value)} />
                <button className="btn-cost red" type="submit">
                  Add Failure Cost
                </button>
              </form>
            ) : (
              <div className="form-hint">Cost entry creation is disabled for users without a branch assignment.</div>
            )}
          </div>
        </div>

        <div className="tbl-card failure">
          <div className="tbl-card-hd">
            <div className="tbl-card-title">Failure Cost Entries</div>
            <div className="tbl-card-meta">{`${filteredFailure.length} entr${filteredFailure.length === 1 ? "y" : "ies"}`}</div>
          </div>
          <div className="tscroll">
            <table>
              <thead>
                <tr>
                  <th className="l">Date</th>
                  <th className="l">Failure Type</th>
                  <th>Amount (S$)</th>
                  <th className="l">Root Cause</th>
                  <th className="l">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredFailure.length === 0 ? (
                  <tr className="empty">
                    <td className="l" colSpan={5}>
                      No failure costs yet.
                    </td>
                  </tr>
                ) : (
                  filteredFailure.map((item) => (
                    <tr key={item.failure_cost_id} className="on">
                      <td className="l">{formatDate(item.date)}</td>
                      <td className="l hi">{item.failure_type}</td>
                      <td className="neg">{formatCurrency(item.amount)}</td>
                      <td className="l">{item.root_cause ?? "-"}</td>
                      <td className="l">-</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td className="l">Total</td>
                  <td />
                  <td className="neg">{failureTotal > 0 ? formatCurrency(failureTotal) : "-"}</td>
                  <td />
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
