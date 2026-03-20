import { FormEvent, useEffect, useMemo, useState } from "react";

import { useAuth } from "../auth/AuthContext";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/apiError";
import { formatCurrency, formatDate } from "../../lib/format";
import type { Customer, Invoice, Payment, Vendor, VendorPayment } from "../../lib/types";

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

  const [payments, setPayments] = useState<Payment[]>([]);
  const [vendorPayments, setVendorPayments] = useState<VendorPayment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

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

  const canCreateVendorPayment = Boolean(user?.branch_id);

  const loadData = () => {
    Promise.all([
      api.get<Payment[]>("/payments"),
      api.get<VendorPayment[]>("/vendor-payments"),
      api.get<Invoice[]>("/invoices"),
      api.get<Vendor[]>("/vendors"),
      api.get<Customer[]>("/customers"),
    ])
      .then(([paymentsResponse, vendorPaymentsResponse, invoicesResponse, vendorsResponse, customersResponse]) => {
        setPayments(paymentsResponse.data);
        setVendorPayments(vendorPaymentsResponse.data);
        setInvoices(invoicesResponse.data);
        setVendors(vendorsResponse.data);
        setCustomers(customersResponse.data);
      })
      .catch((requestError: unknown) => setError(getApiErrorMessage(requestError, "Failed to load payments")));
  };

  useEffect(() => {
    loadData();
  }, []);

  const invoicesById = useMemo(
    () => new Map(invoices.map((invoice) => [invoice.invoice_id, invoice])),
    [invoices],
  );
  const vendorsById = useMemo(
    () => new Map(vendors.map((vendor) => [vendor.vendor_id, vendor])),
    [vendors],
  );
  const customersById = useMemo(
    () => new Map(customers.map((customer) => [customer.customer_id, customer.customer_name])),
    [customers],
  );

  const paidInvoiceIds = useMemo(() => new Set(payments.map((payment) => payment.invoice_id)), [payments]);
  const receivableInvoices = useMemo(
    () => invoices.filter((invoice) => invoice.status === "FINALIZED" && !paidInvoiceIds.has(invoice.invoice_id)),
    [invoices, paidInvoiceIds],
  );

  const availableYears = useMemo(() => {
    const years: number[] = [];

    for (const invoice of invoices) {
      const parsed = extractYearMonth(invoice.invoice_date);
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
  }, [invoices, vendorPayments]);

  useEffect(() => {
    const currentYear = new Date().getFullYear();
    if (!availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears.includes(currentYear) ? currentYear : availableYears[0]);
    }
  }, [availableYears, selectedYear]);

  const filteredFinalizedInvoices = useMemo(
    () =>
      invoices.filter((invoice) => {
        if (invoice.status !== "FINALIZED") {
          return false;
        }
        const parsed = extractYearMonth(invoice.invoice_date);
        return parsed?.year === selectedYear;
      }),
    [invoices, selectedYear],
  );

  const receivedRows = useMemo(() => {
    return payments
      .map((payment) => {
        const invoice = invoicesById.get(payment.invoice_id);
        if (!invoice) {
          return null;
        }
        const parsed = extractYearMonth(invoice.invoice_date);
        if (!parsed || parsed.year !== selectedYear) {
          return null;
        }
        return {
          payment,
          invoice,
          monthIndex: parsed.monthIndex,
        };
      })
      .filter((row): row is { payment: Payment; invoice: Invoice; monthIndex: number } => Boolean(row))
      .sort((left, right) => left.invoice.invoice_date.localeCompare(right.invoice.invoice_date));
  }, [payments, invoicesById, selectedYear]);

  const receivedMonthlyRows = useMemo<ReceivedMonthlyRow[]>(() => {
    const buckets = MONTHS.map((month) => ({ month, invoiceAmount: 0, paid: 0, notPaid: 0 }));

    for (const invoice of filteredFinalizedInvoices) {
      const parsed = extractYearMonth(invoice.invoice_date);
      if (!parsed) {
        continue;
      }
      buckets[parsed.monthIndex].invoiceAmount += Number(invoice.sales_amount) || 0;
    }

    for (const row of receivedRows) {
      buckets[row.monthIndex].paid += Number(row.payment.amount) || 0;
    }

    for (const bucket of buckets) {
      bucket.notPaid = Math.max(bucket.invoiceAmount - bucket.paid, 0);
    }

    return buckets;
  }, [filteredFinalizedInvoices, receivedRows]);

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
    const selectedInvoice = invoicesById.get(selectedInvoiceId);
    setInvoiceAmount(selectedInvoice?.sales_amount ?? "");
  };

  const submitReceivable = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

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
      loadData();
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError, "Failed to record payment received"));
    }
  };

  const submitPayable = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

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
      loadData();
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError, "Failed to record payment paid"));
    }
  };

  return (
    <div className="stack">
      <section className="card payment-page-header">
        <div>
          <h3>Payments</h3>
          <p>Track payments received and payments paid.</p>
        </div>
        <div className="payment-page-controls">
          <label htmlFor="payment-year">Year</label>
          <select id="payment-year" value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
            {availableYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
      </section>

      {error ? <div className="card error">{error}</div> : null}

      <section className="card payment-sheet received">
        <h3>{`Payments Received - Year ${selectedYear}`}</h3>
        <form className="inline-form" onSubmit={submitReceivable}>
          <select value={invoiceId} onChange={(event) => selectReceivableInvoice(event.target.value)} required>
            <option value="">Select Finalized Invoice</option>
            {receivableInvoices.map((invoice) => (
              <option key={invoice.invoice_id} value={invoice.invoice_id}>
                {invoice.invoice_number} ({formatCurrency(invoice.sales_amount)})
              </option>
            ))}
          </select>
          <input placeholder="Invoice Amount (S$)" value={invoiceAmount} readOnly required />
          <select value={receivableMethod} onChange={(event) => setReceivableMethod(event.target.value as PaymentMethod)}>
            {PAYMENT_METHOD_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <input type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} required />
          <input
            placeholder="Remarks / Ref"
            value={receivableReference}
            onChange={(event) => setReceivableReference(event.target.value)}
          />
          <button type="submit" disabled={receivableInvoices.length === 0}>
            Record Received
          </button>
        </form>
        {receivableInvoices.length === 0 ? <p>All finalized invoices are already paid.</p> : null}

        <div className="payment-sheet-layout">
          <div className="table-scroll">
            <table className="data-table payment-ledger-table">
              <thead>
                <tr>
                  <th>S.No</th>
                  <th>Invoice No.</th>
                  <th>Invoice Date</th>
                  <th>Customer</th>
                  <th>Invoice Amount (S$)</th>
                  <th>MOP</th>
                  <th>Payment Received Date</th>
                  <th>Status</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {receivedRows.map((row, index) => (
                  <tr key={row.payment.payment_id}>
                    <td>{index + 1}</td>
                    <td>{row.invoice.invoice_number}</td>
                    <td>{formatDate(row.invoice.invoice_date)}</td>
                    <td>{customersById.get(row.invoice.customer_id) ?? "-"}</td>
                    <td className="align-right">{formatCurrency(row.invoice.sales_amount)}</td>
                    <td>{paymentMethodLabel(row.payment.payment_method)}</td>
                    <td>{formatDate(row.payment.payment_date)}</td>
                    <td>Paid</td>
                    <td>{row.payment.reference_number ?? row.invoice.remarks ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="table-scroll">
            <h4>Payments by Month</h4>
            <table className="data-table payment-summary-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Invoice Amount (S$)</th>
                  <th>Paid (S$)</th>
                  <th>Not Paid (S$)</th>
                </tr>
              </thead>
              <tbody>
                {receivedMonthlyRows.map((row) => (
                  <tr key={row.month}>
                    <td>{row.month}</td>
                    <td className="align-right">{formatCurrency(row.invoiceAmount)}</td>
                    <td className="align-right">{formatCurrency(row.paid)}</td>
                    <td className="align-right">{formatCurrency(row.notPaid)}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td>Total</td>
                  <td className="align-right">{formatCurrency(receivedTotals.invoiceAmount)}</td>
                  <td className="align-right">{formatCurrency(receivedTotals.paid)}</td>
                  <td className="align-right">{formatCurrency(receivedTotals.notPaid)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="card payment-sheet paid">
        <h3>{`Payments Paid - Year ${selectedYear}`}</h3>
        {canCreateVendorPayment ? (
          <form className="inline-form" onSubmit={submitPayable}>
            <select value={vendorId} onChange={(event) => setVendorId(event.target.value)} required>
              <option value="">Select Vendor</option>
              {vendors.map((vendor) => (
                <option key={vendor.vendor_id} value={vendor.vendor_id}>
                  {vendor.vendor_name}
                </option>
              ))}
            </select>
            <input
              placeholder="Amount (S$)"
              inputMode="decimal"
              value={vendorAmount}
              onChange={(event) => setVendorAmount(event.target.value)}
              required
            />
            <select value={vendorMethod} onChange={(event) => setVendorMethod(event.target.value as PaymentMethod)}>
              {PAYMENT_METHOD_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <input type="date" value={vendorDate} onChange={(event) => setVendorDate(event.target.value)} required />
            <input
              placeholder="Bill No. / Remarks"
              value={vendorBillNumber}
              onChange={(event) => setVendorBillNumber(event.target.value)}
            />
            <button type="submit">Record Paid</button>
          </form>
        ) : (
          <p>Payments paid recording is disabled for users without a branch assignment.</p>
        )}

        <div className="payment-sheet-layout">
          <div className="table-scroll">
            <table className="data-table payment-ledger-table">
              <thead>
                <tr>
                  <th>S.No</th>
                  <th>Vendor</th>
                  <th>Payment Date</th>
                  <th>Amount (S$)</th>
                  <th>MOP</th>
                  <th>Status</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {filteredVendorPayments.map((item, index) => (
                  <tr key={item.vendor_payment_id}>
                    <td>{index + 1}</td>
                    <td>{vendorsById.get(item.vendor_id)?.vendor_name ?? "-"}</td>
                    <td>{formatDate(item.payment_date)}</td>
                    <td className="align-right">{formatCurrency(item.amount)}</td>
                    <td>{paymentMethodLabel(item.payment_method)}</td>
                    <td>Paid</td>
                    <td>{item.bill_number ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="table-scroll">
            <h4>Payments by Month</h4>
            <table className="data-table payment-summary-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Paid (S$)</th>
                </tr>
              </thead>
              <tbody>
                {MONTHS.map((month, index) => (
                  <tr key={month}>
                    <td>{month}</td>
                    <td className="align-right">{formatCurrency(paidMonthlyTotals[index] ?? 0)}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td>Total</td>
                  <td className="align-right">{formatCurrency(sum(paidMonthlyTotals))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
