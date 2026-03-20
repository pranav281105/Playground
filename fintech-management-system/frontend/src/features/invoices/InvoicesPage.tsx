import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/apiError";
import { formatCurrency, formatDate } from "../../lib/format";
import type { Customer, Invoice } from "../../lib/types";

type ImportSummary = {
  total: number;
  success: number;
  failed: number;
  errors: string[];
};

type MonthlyProfitRow = {
  month: string;
  sales: number;
  grossProfit: number;
  cogs: number;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const COLUMN_ALIASES = {
  invoiceNumber: ["invoiceno", "invoicenumber", "invoice"],
  invoiceDate: ["invoicedate", "date"],
  customerName: ["nameofcustomer", "customername", "customer"],
  salesAmount: ["salesamountexcludinggsts", "salesamountexcludinggst", "salesamount", "sales"],
  grossProfit: ["grossprofits", "grossprofit", "gp"],
  remarks: ["remarks", "remark", "notes", "note"],
};

function formatMargin(grossProfit: string | number, salesAmount: string | number): string {
  const gross = Number(grossProfit);
  const sales = Number(salesAmount);
  if (!Number.isFinite(gross) || !Number.isFinite(sales) || sales <= 0) {
    return "#DIV/0!";
  }
  return `${((gross / sales) * 100).toFixed(1)}%`;
}

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

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findValue(row: Record<string, unknown>, aliases: string[]): unknown {
  for (const [key, value] of Object.entries(row)) {
    if (aliases.includes(normalizeHeader(key))) {
      return value;
    }
  }
  return undefined;
}

function toText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function parseMoney(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toFixed(2);
  }

  const text = toText(value);
  if (!text) {
    return null;
  }

  let cleaned = text.replace(/[^0-9().-]/g, "");
  if (cleaned.startsWith("(") && cleaned.endsWith(")")) {
    cleaned = `-${cleaned.slice(1, -1)}`;
  }

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed.toFixed(2);
}

function formatIsoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function parseDateToIso(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) {
      return null;
    }
    return formatIsoDate(parsed.y, parsed.m, parsed.d);
  }

  const text = toText(value);
  if (!text) {
    return null;
  }

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    return formatIsoDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const month = Number(slashMatch[1]);
    const day = Number(slashMatch[2]);
    const year = slashMatch[3].length === 2 ? 2000 + Number(slashMatch[3]) : Number(slashMatch[3]);
    return formatIsoDate(year, month, day);
  }

  const native = new Date(text);
  if (!Number.isNaN(native.getTime())) {
    return native.toISOString().slice(0, 10);
  }

  return null;
}

export function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [salesAmount, setSalesAmount] = useState("");
  const [grossProfit, setGrossProfit] = useState("");
  const [remarks, setRemarks] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadData = () => {
    Promise.all([api.get<Invoice[]>("/invoices"), api.get<Customer[]>("/customers")])
      .then(([invoiceResponse, customerResponse]) => {
        setInvoices(invoiceResponse.data);
        setCustomers(customerResponse.data);
        if (!customerId && customerResponse.data.length > 0) {
          setCustomerId(customerResponse.data[0].customer_id);
        }
      })
      .catch((requestError: unknown) => setError(getApiErrorMessage(requestError, "Failed to load invoices")));
  };

  useEffect(() => {
    loadData();
  }, []);

  const customersById = useMemo(
    () => new Map(customers.map((customer) => [customer.customer_id, customer.customer_name])),
    [customers],
  );

  const availableYears = useMemo(() => {
    const years: number[] = [];
    for (const invoice of invoices) {
      const parsed = extractYearMonth(invoice.invoice_date);
      if (parsed) {
        years.push(parsed.year);
      }
    }
    return buildSelectableYears(years);
  }, [invoices]);

  useEffect(() => {
    const currentYear = new Date().getFullYear();
    if (!availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears.includes(currentYear) ? currentYear : availableYears[0]);
    }
  }, [availableYears, selectedYear]);

  const filteredInvoices = useMemo(
    () =>
      invoices.filter((invoice) => {
        const parsed = extractYearMonth(invoice.invoice_date);
        return parsed?.year === selectedYear;
      }),
    [invoices, selectedYear],
  );

  const monthlyProfitRows = useMemo(() => {
    const buckets = Array.from({ length: 12 }, (_, index) => ({
      month: MONTHS[index],
      sales: 0,
      grossProfit: 0,
      cogs: 0,
    }));

    for (const invoice of filteredInvoices) {
      const parsed = extractYearMonth(invoice.invoice_date);
      if (!parsed) {
        continue;
      }
      buckets[parsed.monthIndex].sales += Number(invoice.sales_amount) || 0;
      buckets[parsed.monthIndex].grossProfit += Number(invoice.gross_profit) || 0;
      buckets[parsed.monthIndex].cogs += Number(invoice.cogs) || 0;
    }

    return buckets;
  }, [filteredInvoices]);

  const monthlyTotals = useMemo(
    () =>
      monthlyProfitRows.reduce(
        (accumulator, row) => ({
          sales: accumulator.sales + row.sales,
          grossProfit: accumulator.grossProfit + row.grossProfit,
          cogs: accumulator.cogs + row.cogs,
        }),
        { sales: 0, grossProfit: 0, cogs: 0 },
      ),
    [monthlyProfitRows],
  );

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setImportSummary(null);
    setSubmitting(true);

    try {
      await api.post("/invoices", {
        invoice_number: invoiceNumber,
        customer_id: customerId,
        invoice_date: invoiceDate,
        sales_amount: salesAmount,
        gross_profit: grossProfit,
        remarks: remarks || undefined,
      });

      setInvoiceNumber("");
      setInvoiceDate("");
      setSalesAmount("");
      setGrossProfit("");
      setRemarks("");
      setSuccess("Invoice saved successfully.");
      loadData();
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError, "Failed to create invoice"));
    } finally {
      setSubmitting(false);
    }
  };

  const onImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setError(null);
    setSuccess(null);
    setImportSummary(null);
    setImporting(true);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        setError("File has no worksheet.");
        return;
      }

      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
        raw: true,
      });

      if (rows.length === 0) {
        setError("No data rows found in file.");
        return;
      }

      const customerLookup = new Map<string, string[]>();
      for (const customer of customers) {
        const key = customer.customer_name.trim().toLowerCase();
        const existing = customerLookup.get(key) ?? [];
        existing.push(customer.customer_id);
        customerLookup.set(key, existing);
      }

      let successCount = 0;
      const rowErrors: string[] = [];

      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const rowNo = index + 2;

        const invoiceNumberText = toText(findValue(row, COLUMN_ALIASES.invoiceNumber));
        const customerNameText = toText(findValue(row, COLUMN_ALIASES.customerName));
        const invoiceDateText = findValue(row, COLUMN_ALIASES.invoiceDate);
        const salesAmountText = findValue(row, COLUMN_ALIASES.salesAmount);
        const grossProfitText = findValue(row, COLUMN_ALIASES.grossProfit);
        const remarksText = toText(findValue(row, COLUMN_ALIASES.remarks));

        if (!invoiceNumberText || !customerNameText || invoiceDateText === undefined || salesAmountText === undefined || grossProfitText === undefined) {
          rowErrors.push(`Row ${rowNo}: Missing required columns or values.`);
          continue;
        }

        const customerMatches = customerLookup.get(customerNameText.toLowerCase());
        if (!customerMatches || customerMatches.length === 0) {
          rowErrors.push(`Row ${rowNo}: Customer "${customerNameText}" not found.`);
          continue;
        }
        if (customerMatches.length > 1) {
          rowErrors.push(`Row ${rowNo}: Customer "${customerNameText}" is ambiguous.`);
          continue;
        }

        const parsedDate = parseDateToIso(invoiceDateText);
        if (!parsedDate) {
          rowErrors.push(`Row ${rowNo}: Invalid invoice date.`);
          continue;
        }

        const parsedSalesAmount = parseMoney(salesAmountText);
        if (!parsedSalesAmount) {
          rowErrors.push(`Row ${rowNo}: Invalid sales amount.`);
          continue;
        }

        const parsedGrossProfit = parseMoney(grossProfitText);
        if (!parsedGrossProfit) {
          rowErrors.push(`Row ${rowNo}: Invalid gross profit.`);
          continue;
        }

        try {
          await api.post("/invoices", {
            invoice_number: invoiceNumberText,
            customer_id: customerMatches[0],
            invoice_date: parsedDate,
            sales_amount: parsedSalesAmount,
            gross_profit: parsedGrossProfit,
            remarks: remarksText || undefined,
          });
          successCount += 1;
        } catch (requestError: unknown) {
          rowErrors.push(`Row ${rowNo}: ${getApiErrorMessage(requestError, "Failed to create invoice")}`);
        }
      }

      const failedCount = rows.length - successCount;
      setImportSummary({
        total: rows.length,
        success: successCount,
        failed: failedCount,
        errors: rowErrors,
      });

      if (successCount > 0) {
        loadData();
      }
      if (failedCount === 0) {
        setSuccess(`Imported ${successCount} invoice(s) successfully.`);
      }
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError, "Failed to import file"));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="stack">
      <section className="card">
        <h3>Add Invoice</h3>
        <form className="inline-form" onSubmit={onSubmit}>
          <input
            placeholder="Invoice No."
            value={invoiceNumber}
            onChange={(event) => setInvoiceNumber(event.target.value)}
            required
          />
          <input type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} required />
          <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} required>
            <option value="">Select Customer</option>
            {customers.map((customer) => (
              <option key={customer.customer_id} value={customer.customer_id}>
                {customer.customer_name}
              </option>
            ))}
          </select>
          <input
            placeholder="Sales Amount Excluding GST (S$)"
            inputMode="decimal"
            value={salesAmount}
            onChange={(event) => setSalesAmount(event.target.value)}
            required
          />
          <input
            placeholder="Gross Profit (S$)"
            inputMode="decimal"
            value={grossProfit}
            onChange={(event) => setGrossProfit(event.target.value)}
            required
          />
          <input placeholder="Remarks" value={remarks} onChange={(event) => setRemarks(event.target.value)} />
          <button type="submit" disabled={submitting}>
            {submitting ? "Saving..." : "Add Invoice"}
          </button>
        </form>
        {error ? <p className="error">{error}</p> : null}
        {success ? <p>{success}</p> : null}
      </section>

      <section className="card">
        <h3>Import Invoices (CSV / Excel)</h3>
        <p>Required columns: Invoice No., Invoice Date, Name of Customer, Sales Amount Excluding GST, Gross Profit.</p>
        <input type="file" accept=".csv,.xlsx,.xls" onChange={(event) => void onImportFile(event)} disabled={importing} />
        {importing ? <p>Import in progress...</p> : null}
        {importSummary ? (
          <div className="stack">
            <p>
              Processed {importSummary.total} rows. Success: {importSummary.success}. Failed: {importSummary.failed}.
            </p>
            {importSummary.errors.length > 0 ? (
              <div>
                <p className="error">Import errors:</p>
                {importSummary.errors.slice(0, 20).map((item) => (
                  <p key={item} className="error">
                    {item}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="card">
        <div className="invoice-profit-header">
          <h3>{`POS Sales Order Profit - Year ${selectedYear}`}</h3>
          <div className="invoice-profit-controls">
            <label htmlFor="invoice-year">Year</label>
            <select id="invoice-year" value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="invoice-profit-layout">
          <div className="table-scroll">
            <table className="data-table invoice-table">
              <thead>
                <tr>
                  <th>S.No</th>
                  <th>Invoice No.</th>
                  <th>Invoice Date</th>
                  <th>Name of Customer</th>
                  <th>Sales Amount Excluding GST (S$)</th>
                  <th>Gross Profit (S$)</th>
                  <th>Cost of Goods Sold in S$</th>
                  <th>Gross Profit Margin</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((invoice, index) => (
                  <tr key={invoice.invoice_id}>
                    <td>{index + 1}</td>
                    <td>{invoice.invoice_number}</td>
                    <td>{formatDate(invoice.invoice_date)}</td>
                    <td>{customersById.get(invoice.customer_id) ?? invoice.customer_id}</td>
                    <td className="align-right">{formatCurrency(invoice.sales_amount)}</td>
                    <td className="align-right">{formatCurrency(invoice.gross_profit)}</td>
                    <td className="align-right">{formatCurrency(invoice.cogs)}</td>
                    <td className="align-right">{formatMargin(invoice.gross_profit, invoice.sales_amount)}</td>
                    <td>{invoice.remarks ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="table-scroll">
            <h4>POS Sales Order Profit by Month</h4>
            <table className="data-table monthly-profit-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Sales Amount Excluding GST (S$)</th>
                  <th>Gross Profit (S$)</th>
                  <th>Cost of Goods Sold in S$</th>
                  <th>Gross Profit Margin</th>
                </tr>
              </thead>
              <tbody>
                {monthlyProfitRows.map((row) => (
                  <tr key={row.month}>
                    <td>{row.month}</td>
                    <td className="align-right">{formatCurrency(row.sales)}</td>
                    <td className="align-right">{formatCurrency(row.grossProfit)}</td>
                    <td className="align-right">{formatCurrency(row.cogs)}</td>
                    <td className="align-right">{formatMargin(row.grossProfit, row.sales)}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td>Total</td>
                  <td className="align-right">{formatCurrency(monthlyTotals.sales)}</td>
                  <td className="align-right">{formatCurrency(monthlyTotals.grossProfit)}</td>
                  <td className="align-right">{formatCurrency(monthlyTotals.cogs)}</td>
                  <td className="align-right">{formatMargin(monthlyTotals.grossProfit, monthlyTotals.sales)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
