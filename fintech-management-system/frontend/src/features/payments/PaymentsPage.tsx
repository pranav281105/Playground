import { FormEvent, useEffect, useMemo, useState } from "react";

import { useAuth } from "../auth/AuthContext";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/apiError";
import { formatCurrency, formatDate } from "../../lib/format";
import type { Payment, ReceivableStatus, Vendor, VendorPayment } from "../../lib/types";

type PaymentMethod = Payment["payment_method"];

type ReceivedMonthlyRow = {
  month: string;
  invoiceAmount: number;
  paid: number;
  notPaid: number;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const PAYMENT_METHOD_OPTIONS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "cash", label: "Cash" },
  { value: "paynow", label: "PayNow" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "credit_card", label: "Credit Card" },
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

function buildSelectableYears(dataYears: number[]): number[] {
  const now = new Date().getFullYear();
  const years = new Set<number>(dataYears);
  for (let offset = -5; offset <= 5; offset += 1) {
    years.add(now + offset);
  }
  return Array.from(years).sort((left, right) => right - left);
}

function sum(values: number[]): number {
  return values.reduce((accumulator, value) => accumulator + value, 0);
}

function paymentMethodLabel(value: PaymentMethod): string {
  const found = PAYMENT_METHOD_OPTIONS.find((item) => item.value === value);
  return found?.label ?? value;
}

export function PaymentsPage() {
  const { user } = useAuth();

  const [receivables, setReceivables] = useState<ReceivableStatus[]>([]);
  const [vendorPayments, setVendorPayments] = useState<VendorPayment[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);

  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  const [invoiceId, setInvoiceId] = useState("");
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [receivableMethod, setReceivableMethod] = useState<PaymentMethod>("bank_transfer");
  const [receivableReference, setReceivableReference] = useState("");

  const [vendorId, setVendorId] = useState("");
  const [vendorAmount, setVendorAmount] = useState("");
  const [vendorDate, setVendorDate] = useState("");
  const [vendorMethod, setVendorMethod] = useState<PaymentMethod>("bank_transfer");
  const [vendorBillNumber, setVendorBillNumber] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canCreateVendorPayment = Boolean(user?.branch_id);

  const loadData = () => {
    Promise.all([
      api.get<ReceivableStatus[]>("/payments/receivables"),
      api.get<VendorPayment[]>("/vendor-payments"),
      api.get<Vendor[]>("/vendors"),
    ])
      .then(([receivablesResponse, vendorPaymentsResponse, vendorsResponse]) => {
        setReceivables(receivablesResponse.data);
        setVendorPayments(vendorPaymentsResponse.data);
        setVendors(vendorsResponse.data);
      })
      .catch((requestError: unknown) => setError(getApiErrorMessage(requestError, "Failed to load payments")));
  };

  useEffect(() => {
    loadData();
  }, []);

  const vendorsById = useMemo(
    () => new Map(vendors.map((vendor) => [vendor.vendor_id, vendor])),
    [vendors],
  );
  const receivableInvoices = useMemo(
    () => receivables.filter((item) => item.payment_status !== "Paid"),
    [receivables],
  );

  const availableYears = useMemo(() => {
    const years: number[] = [];

    for (const receivable of receivables) {
      const parsed = extractYearMonth(receivable.invoice_date);
      if (parsed) {
        years.push(parsed.year);
      }
    }

    for (const vendorPayment of vendorPayments) {
      const parsed = extractYearMonth(vendorPayment.payment_date);
      if (parsed) {
        years.push(parsed.year);
      }
    }

    return buildSelectableYears(years);
  }, [receivables, vendorPayments]);

  useEffect(() => {
    const currentYear = new Date().getFullYear();
    if (!availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears.includes(currentYear) ? currentYear : availableYears[0]);
    }
  }, [availableYears, selectedYear]);

  const receivedRows = useMemo(
    () =>
      receivables
        .filter((item) => {
          const parsed = extractYearMonth(item.invoice_date);
          return parsed?.year === selectedYear;
        })
        .sort((left, right) => left.invoice_date.localeCompare(right.invoice_date)),
    [receivables, selectedYear],
  );

  const receivedMonthlyRows = useMemo<ReceivedMonthlyRow[]>(() => {
    const buckets = MONTHS.map((month) => ({ month, invoiceAmount: 0, paid: 0, notPaid: 0 }));
    for (const row of receivedRows) {
      const parsed = extractYearMonth(row.invoice_date);
      if (!parsed) {
        continue;
      }
      buckets[parsed.monthIndex].invoiceAmount += Number(row.sales_amount) || 0;
      buckets[parsed.monthIndex].paid += Number(row.paid_amount) || 0;
      buckets[parsed.monthIndex].notPaid += Number(row.balance_amount) || 0;
    }
    return buckets;
  }, [receivedRows]);

  const receivedTotals = useMemo(
    () =>
      receivedMonthlyRows.reduce(
        (accumulator, row) => ({
          invoiceAmount: accumulator.invoiceAmount + row.invoiceAmount,
          paid: accumulator.paid + row.paid,
          notPaid: accumulator.notPaid + row.notPaid,
        }),
        { invoiceAmount: 0, paid: 0, notPaid: 0 },
      ),
    [receivedMonthlyRows],
  );

  const agingBreakdown = useMemo(() => {
    const totals = {
      bucket0To30: 0,
      bucket31To60: 0,
      bucket61To90: 0,
      bucket90Plus: 0,
    };
    for (const row of receivedRows) {
      if (row.aging_bucket === "0-30") {
        totals.bucket0To30 += Number(row.balance_amount) || 0;
      } else if (row.aging_bucket === "31-60") {
        totals.bucket31To60 += Number(row.balance_amount) || 0;
      } else if (row.aging_bucket === "61-90") {
        totals.bucket61To90 += Number(row.balance_amount) || 0;
      } else if (row.aging_bucket === "90+") {
        totals.bucket90Plus += Number(row.balance_amount) || 0;
      }
    }
    return totals;
  }, [receivedRows]);

  const filteredVendorPayments = useMemo(
    () =>
      vendorPayments
        .filter((item) => {
          const parsed = extractYearMonth(item.payment_date);
          return parsed?.year === selectedYear;
        })
        .sort((left, right) => left.payment_date.localeCompare(right.payment_date)),
    [vendorPayments, selectedYear],
  );

  const paidMonthlyTotals = useMemo(() => {
    const totals = Array<number>(12).fill(0);
    for (const item of filteredVendorPayments) {
      const parsed = extractYearMonth(item.payment_date);
      if (!parsed) {
        continue;
      }
      totals[parsed.monthIndex] += Number(item.amount) || 0;
    }
    return totals;
  }, [filteredVendorPayments]);

  const selectReceivableInvoice = (selectedInvoiceId: string) => {
    setInvoiceId(selectedInvoiceId);
    const selectedInvoice = receivables.find((item) => item.invoice_id === selectedInvoiceId);
    setInvoiceAmount(selectedInvoice?.balance_amount ?? "");
  };

  const submitReceivable = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!invoiceId) {
      setError("Select a finalized invoice to record payment.");
      return;
    }

    try {
      await api.post("/payments", {
        invoice_id: invoiceId,
        payment_date: invoiceDate,
        payment_method: receivableMethod,
        amount: invoiceAmount,
        reference_number: receivableReference || undefined,
      });
      setInvoiceId("");
      setInvoiceAmount("");
      setInvoiceDate("");
      setReceivableMethod("bank_transfer");
      setReceivableReference("");
      setSuccess("Payment received recorded.");
      loadData();
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError, "Failed to record payment received"));
    }
  };

  const submitPayable = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!canCreateVendorPayment) {
      setError("Payments paid recording requires a user assigned to a branch.");
      return;
    }

    try {
      await api.post("/vendor-payments", {
        vendor_id: vendorId,
        bill_number: vendorBillNumber || undefined,
        payment_date: vendorDate,
        payment_method: vendorMethod,
        amount: vendorAmount,
      });
      setVendorId("");
      setVendorAmount("");
      setVendorDate("");
      setVendorMethod("bank_transfer");
      setVendorBillNumber("");
      setSuccess("Payment paid recorded.");
      loadData();
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError, "Failed to record payment paid"));
    }
  };

  const receivedCountLabel = `${receivedRows.length} entr${receivedRows.length === 1 ? "y" : "ies"}`;
  const paidCountLabel = `${filteredVendorPayments.length} entr${filteredVendorPayments.length === 1 ? "y" : "ies"}`;

  return (
    <div className="stack">
      <div className="pg-head">
        <div>
          <div className="pg-title">Payments</div>
          <div className="pg-meta">Track payments received and payments paid.</div>
        </div>
        <div className="yr-ctrl">
          <span className="yr-lbl">Year</span>
          <select className="yr-sel" id="payment-year" value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
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

      <section className="pay-section">
        <div className="section-label">
          <div className="section-title">{`Payments Received - Year ${selectedYear}`}</div>
        </div>

        <div className="form-card">
          <div className="form-body">
            <form className="form-row" onSubmit={submitReceivable}>
              <select
                className="fs"
                style={{ width: "220px" }}
                value={invoiceId}
                onChange={(event) => selectReceivableInvoice(event.target.value)}
                required
              >
                <option value="">Select Finalized Invoice</option>
                {receivableInvoices.map((invoice) => (
                  <option key={invoice.invoice_id} value={invoice.invoice_id}>
                    {`${invoice.invoice_number} • Due ${formatCurrency(invoice.balance_amount)}`}
                  </option>
                ))}
              </select>
              <input
                className="fi"
                style={{ width: "168px" }}
                placeholder="Payment Amount (S$)"
                inputMode="decimal"
                value={invoiceAmount}
                onChange={(event) => setInvoiceAmount(event.target.value)}
                required
              />
              <select
                className="fs"
                style={{ width: "168px" }}
                value={receivableMethod}
                onChange={(event) => setReceivableMethod(event.target.value as PaymentMethod)}
              >
                {PAYMENT_METHOD_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <input
                className="fi"
                style={{ width: "148px" }}
                type={invoiceDate ? "date" : "text"}
                placeholder="dd/mm/yyyy"
                value={invoiceDate}
                onFocus={(event) => {
                  event.currentTarget.type = "date";
                }}
                onBlur={(event) => {
                  if (!event.currentTarget.value) {
                    event.currentTarget.type = "text";
                  }
                }}
                onChange={(event) => setInvoiceDate(event.target.value)}
                required
              />
              <input
                className="fi"
                style={{ flex: 1, minWidth: "120px" }}
                placeholder="Remarks / Ref"
                value={receivableReference}
                onChange={(event) => setReceivableReference(event.target.value)}
              />
              <button className="btn btn-green" type="submit" disabled={receivableInvoices.length === 0}>
                Record Received
              </button>
            </form>
            <div className="form-hint" style={{ marginTop: "10px" }}>
              {receivableInvoices.length === 0
                ? "All finalized invoices are already paid."
                : `${receivableInvoices.length} invoice(s) pending or partial.`}
            </div>
          </div>
        </div>

        <div className="tbl-row received">
          <div className="tbl-pane">
            <div className="pane-hd">
              <div className="pane-title">Receivables Ledger</div>
              <div className="pane-meta">{receivedCountLabel}</div>
            </div>
            <div className="tscroll">
              <table>
                <thead>
                  <tr>
                    <th className="l">S.No</th>
                    <th className="l">Invoice No.</th>
                    <th className="l">Invoice Date</th>
                    <th className="l">Customer</th>
                    <th>Invoice Amount (S$)</th>
                    <th>Paid (S$)</th>
                    <th>Balance (S$)</th>
                    <th className="l">Due Date</th>
                    <th className="l">Aging</th>
                    <th className="l">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {receivedRows.length === 0 ? (
                    <tr className="empty">
                      <td className="l" colSpan={10}>
                        No receivable rows for selected year.
                      </td>
                    </tr>
                  ) : (
                    receivedRows.map((row, index) => (
                      <tr key={row.invoice_id} className="on">
                        <td className="l">{index + 1}</td>
                        <td className="l mono">{row.invoice_number}</td>
                        <td className="l">{formatDate(row.invoice_date)}</td>
                        <td className="l hi">{row.customer_name}</td>
                        <td>{formatCurrency(row.sales_amount)}</td>
                        <td className="pos">{Number(row.paid_amount) > 0 ? formatCurrency(row.paid_amount) : "-"}</td>
                        <td className={Number(row.balance_amount) > 0 ? "neg" : undefined}>
                          {Number(row.balance_amount) > 0 ? formatCurrency(row.balance_amount) : "-"}
                        </td>
                        <td className="l">{formatDate(row.due_date)}</td>
                        <td className="l">{row.aging_bucket}</td>
                        <td className="l">
                          <span className={row.payment_status === "Paid" ? "pill pill-green" : "pill pill-gray"}>
                            {row.payment_status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="tbl-pane">
            <div className="pane-hd">
              <div className="pane-title">Aging and Month Summary</div>
            </div>
            <div className="tscroll">
              <div className="form-hint" style={{ marginBottom: "8px" }}>
                {`Aging Balance: 0-30 ${formatCurrency(agingBreakdown.bucket0To30)} · 31-60 ${formatCurrency(agingBreakdown.bucket31To60)} · 61-90 ${formatCurrency(agingBreakdown.bucket61To90)} · 90+ ${formatCurrency(agingBreakdown.bucket90Plus)}`}
              </div>
              <table>
                <thead>
                  <tr>
                    <th className="l">Month</th>
                    <th>Invoice Amt (S$)</th>
                    <th>Paid (S$)</th>
                    <th>Not Paid (S$)</th>
                  </tr>
                </thead>
                <tbody>
                  {receivedMonthlyRows.map((row) => (
                    <tr key={row.month} className={row.invoiceAmount > 0 ? "on" : undefined}>
                      <td className="l">{row.month}</td>
                      <td>{row.invoiceAmount > 0 ? formatCurrency(row.invoiceAmount) : "-"}</td>
                      <td className={row.paid > 0 ? "pos" : undefined}>{row.paid > 0 ? formatCurrency(row.paid) : "-"}</td>
                      <td className={row.notPaid > 0 ? "neg" : undefined}>{row.notPaid > 0 ? formatCurrency(row.notPaid) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="l">Total</td>
                    <td>{receivedTotals.invoiceAmount > 0 ? formatCurrency(receivedTotals.invoiceAmount) : "-"}</td>
                    <td className="pos">{receivedTotals.paid > 0 ? formatCurrency(receivedTotals.paid) : "-"}</td>
                    <td>{receivedTotals.notPaid > 0 ? formatCurrency(receivedTotals.notPaid) : "-"}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section className="pay-section">
        <div className="section-label">
          <div className="section-title">{`Payments Paid - Year ${selectedYear}`}</div>
        </div>

        <div className="form-card">
          <div className="form-body">
            {canCreateVendorPayment ? (
              <form className="form-row" onSubmit={submitPayable}>
                <select className="fs" style={{ width: "200px" }} value={vendorId} onChange={(event) => setVendorId(event.target.value)} required>
                  <option value="">Select Vendor</option>
                  {vendors.map((vendor) => (
                    <option key={vendor.vendor_id} value={vendor.vendor_id}>
                      {vendor.vendor_name}
                    </option>
                  ))}
                </select>
                <input
                  className="fi"
                  style={{ width: "148px" }}
                  placeholder="Amount (S$)"
                  inputMode="decimal"
                  value={vendorAmount}
                  onChange={(event) => setVendorAmount(event.target.value)}
                  required
                />
                <select
                  className="fs"
                  style={{ width: "168px" }}
                  value={vendorMethod}
                  onChange={(event) => setVendorMethod(event.target.value as PaymentMethod)}
                >
                  {PAYMENT_METHOD_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <input
                  className="fi"
                  style={{ width: "148px" }}
                  type={vendorDate ? "date" : "text"}
                  placeholder="dd/mm/yyyy"
                  value={vendorDate}
                  onFocus={(event) => {
                    event.currentTarget.type = "date";
                  }}
                  onBlur={(event) => {
                    if (!event.currentTarget.value) {
                      event.currentTarget.type = "text";
                    }
                  }}
                  onChange={(event) => setVendorDate(event.target.value)}
                  required
                />
                <input
                  className="fi"
                  style={{ flex: 1, minWidth: "120px" }}
                  placeholder="Bill No. / Remarks"
                  value={vendorBillNumber}
                  onChange={(event) => setVendorBillNumber(event.target.value)}
                />
                <button className="btn btn-blue" type="submit">
                  Record Paid
                </button>
              </form>
            ) : (
              <div className="form-hint">Payments paid recording is disabled for users without a branch assignment.</div>
            )}
          </div>
        </div>

        <div className="tbl-row paid">
          <div className="tbl-pane">
            <div className="pane-hd">
              <div className="pane-title">Paid Entries</div>
              <div className="pane-meta">{paidCountLabel}</div>
            </div>
            <div className="tscroll">
              <table>
                <thead>
                  <tr>
                    <th className="l">S.No</th>
                    <th className="l">Vendor</th>
                    <th className="l">Payment Date</th>
                    <th>Amount (S$)</th>
                    <th className="l">MOP</th>
                    <th className="l">Status</th>
                    <th className="l">Remarks</th>
                    <th className="l">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVendorPayments.length === 0 ? (
                    <tr className="empty">
                      <td className="l" colSpan={8}>
                        No payments recorded yet.
                      </td>
                    </tr>
                  ) : (
                    filteredVendorPayments.map((item, index) => (
                      <tr key={item.vendor_payment_id} className="on">
                        <td className="l">{index + 1}</td>
                        <td className="l hi">{vendorsById.get(item.vendor_id)?.vendor_name ?? "-"}</td>
                        <td className="l">{formatDate(item.payment_date)}</td>
                        <td>{formatCurrency(item.amount)}</td>
                        <td className="l">{paymentMethodLabel(item.payment_method)}</td>
                        <td className="l">
                          <span className="pill pill-green">Paid</span>
                        </td>
                        <td className="l">{item.bill_number ?? "-"}</td>
                        <td className="l">-</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="tbl-pane">
            <div className="pane-hd">
              <div className="pane-title">Payments by Month</div>
            </div>
            <div className="tscroll">
              <table>
                <thead>
                  <tr>
                    <th className="l">Month</th>
                    <th>Paid (S$)</th>
                  </tr>
                </thead>
                <tbody>
                  {MONTHS.map((month, index) => {
                    const value = paidMonthlyTotals[index] ?? 0;
                    return (
                      <tr key={month} className={value > 0 ? "on" : undefined}>
                        <td className="l">{month}</td>
                        <td className={value > 0 ? "neg" : undefined}>{value > 0 ? formatCurrency(value) : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="l">Total</td>
                    <td className="neg">{sum(paidMonthlyTotals) > 0 ? formatCurrency(sum(paidMonthlyTotals)) : "-"}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
