import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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

type InvoiceSortField = "date" | "sales" | "gross_profit" | "margin";

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
    return "-";
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
  const [importFileName, setImportFileName] = useState("No file chosen");
  const [actionInvoiceId, setActionInvoiceId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [customerFilterId, setCustomerFilterId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minSalesAmount, setMinSalesAmount] = useState("");
  const [maxSalesAmount, setMaxSalesAmount] = useState("");
  const [minMargin, setMinMargin] = useState("");
  const [maxMargin, setMaxMargin] = useState("");
  const [sortField, setSortField] = useState<InvoiceSortField>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadData = useCallback(() => {
    Promise.all([api.get<Invoice[]>("/invoices"), api.get<Customer[]>("/customers")])
      .then(([invoiceResponse, customerResponse]) => {
        setInvoices(invoiceResponse.data);
        setCustomers(customerResponse.data);
        if (!customerId && customerResponse.data.length > 0) {
          setCustomerId(customerResponse.data[0].customer_id);
        }
      })
      .catch((requestError: unknown) => setError(getApiErrorMessage(requestError, "Failed to load invoices")));
  }, [customerId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  const yearInvoices = useMemo(
    () =>
      invoices.filter((invoice) => {
        const parsed = extractYearMonth(invoice.invoice_date);
        return parsed?.year === selectedYear;
      }),
    [invoices, selectedYear],
  );

  const filteredInvoices = useMemo(() => {
    const query = search.trim().toLowerCase();
    const minSales = minSalesAmount ? Number(minSalesAmount) : null;
    const maxSales = maxSalesAmount ? Number(maxSalesAmount) : null;
    const minMarginValue = minMargin ? Number(minMargin) : null;
    const maxMarginValue = maxMargin ? Number(maxMargin) : null;

    return yearInvoices.filter((invoice) => {
      if (customerFilterId && invoice.customer_id !== customerFilterId) {
        return false;
      }
      if (dateFrom && invoice.invoice_date < dateFrom) {
        return false;
      }
      if (dateTo && invoice.invoice_date > dateTo) {
        return false;
      }

      const sales = Number(invoice.sales_amount);
      if (minSales !== null && Number.isFinite(minSales) && sales < minSales) {
        return false;
      }
      if (maxSales !== null && Number.isFinite(maxSales) && sales > maxSales) {
        return false;
      }

      const gross = Number(invoice.gross_profit);
      const margin = sales > 0 ? (gross / sales) * 100 : 0;
      if (minMarginValue !== null && Number.isFinite(minMarginValue) && margin < minMarginValue) {
        return false;
      }
      if (maxMarginValue !== null && Number.isFinite(maxMarginValue) && margin > maxMarginValue) {
        return false;
      }

      if (!query) {
        return true;
      }
      const customerName = customersById.get(invoice.customer_id) ?? "";
      return [invoice.invoice_number, customerName].join(" ").toLowerCase().includes(query);
    });
  }, [
    yearInvoices,
    search,
    customerFilterId,
    dateFrom,
    dateTo,
    minSalesAmount,
    maxSalesAmount,
    minMargin,
    maxMargin,
    customersById,
  ]);

  const sortedInvoices = useMemo(() => {
    return [...filteredInvoices].sort((left, right) => {
      const leftSales = Number(left.sales_amount);
      const rightSales = Number(right.sales_amount);
      const leftGross = Number(left.gross_profit);
      const rightGross = Number(right.gross_profit);
      const leftMargin = leftSales > 0 ? (leftGross / leftSales) * 100 : 0;
      const rightMargin = rightSales > 0 ? (rightGross / rightSales) * 100 : 0;

      let comparison = 0;
      if (sortField === "date") {
        comparison = left.invoice_date.localeCompare(right.invoice_date);
      } else if (sortField === "sales") {
        comparison = leftSales - rightSales;
      } else if (sortField === "gross_profit") {
        comparison = leftGross - rightGross;
      } else {
        comparison = leftMargin - rightMargin;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [filteredInvoices, sortField, sortDirection]);

  const monthlyProfitRows = useMemo(() => {
    const buckets = Array.from({ length: 12 }, (_, index) => ({
      month: MONTHS[index],
      sales: 0,
      grossProfit: 0,
      cogs: 0,
    }));

    for (const invoice of yearInvoices) {
      const parsed = extractYearMonth(invoice.invoice_date);
      if (!parsed) {
        continue;
      }
      buckets[parsed.monthIndex].sales += Number(invoice.sales_amount) || 0;
      buckets[parsed.monthIndex].grossProfit += Number(invoice.gross_profit) || 0;
      buckets[parsed.monthIndex].cogs += Number(invoice.cogs) || 0;
    }

    return buckets;
  }, [yearInvoices]);

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
        invoice_number: invoiceNumber || undefined,
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
      setImportFileName("No file chosen");
      return;
    }
    setImportFileName(file.name);

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

        if (!customerNameText || invoiceDateText === undefined || salesAmountText === undefined || grossProfitText === undefined) {
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
            invoice_number: invoiceNumberText || undefined,
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

  const onDeleteInvoice = async (invoice: Invoice) => {
    setError(null);
    setSuccess(null);
    setActionInvoiceId(invoice.invoice_id);
    try {
      await api.delete(`/invoices/${invoice.invoice_id}`);
      setSuccess(`Invoice ${invoice.invoice_number} deleted.`);
      loadData();
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError, "Failed to delete invoice"));
    } finally {
      setActionInvoiceId(null);
    }
  };

  const onFinalizeInvoice = async (invoice: Invoice) => {
    setError(null);
    setSuccess(null);
    setActionInvoiceId(invoice.invoice_id);
    try {
      await api.post(`/invoices/${invoice.invoice_id}/finalize`, {});
      setSuccess(`Invoice ${invoice.invoice_number} finalized.`);
      loadData();
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError, "Failed to finalize invoice"));
    } finally {
      setActionInvoiceId(null);
    }
  };

  const invoiceCountLabel = `${sortedInvoices.length} invoice${sortedInvoices.length === 1 ? "" : "s"}`;

  return (
    <div className="stack">
      <div>
        <div className="pg-title">Invoices</div>
        <div className="pg-meta">POS sales order entry, import, and monthly profitability view.</div>
      </div>

      <section className="card">
        <div className="card-hd">
          <div>
            <div className="card-title">Add Invoice</div>
            <div className="card-desc">Create a new POS sales order invoice</div>
          </div>
        </div>
        <div className="card-body">
          <form className="form-row invoice-form" onSubmit={onSubmit}>
            <input
              className="fi"
              placeholder="Invoice No. (optional, auto-generated if blank)"
              value={invoiceNumber}
              onChange={(event) => setInvoiceNumber(event.target.value)}
            />
            <input
              className="fi"
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
            <select className="fs" value={customerId} onChange={(event) => setCustomerId(event.target.value)} required>
              <option value="">Name of Customer</option>
              {customers.map((customer) => (
                <option key={customer.customer_id} value={customer.customer_id}>
                  {customer.customer_name}
                </option>
              ))}
            </select>
            <input
              className="fi"
              placeholder="Sales Amount Excl. GST (S$)"
              inputMode="decimal"
              value={salesAmount}
              onChange={(event) => setSalesAmount(event.target.value)}
              required
            />
            <input
              className="fi"
              placeholder="Gross Profit (S$)"
              inputMode="decimal"
              value={grossProfit}
              onChange={(event) => setGrossProfit(event.target.value)}
              required
            />
            <input className="fi" placeholder="Remarks" value={remarks} onChange={(event) => setRemarks(event.target.value)} />
            <button className="btn-add" type="submit" disabled={submitting}>
              {submitting ? "Saving..." : "Add Invoice"}
            </button>
          </form>
          {success ? <div className="fmsg ok show">{success}</div> : null}
          {error ? <div className="fmsg err show">{error}</div> : null}
        </div>
      </section>

      <section className="card">
        <div className="card-hd">
          <div>
            <div className="card-title">Import Invoices (CSV / Excel)</div>
            <div className="card-desc">Bulk upload — required columns below</div>
          </div>
        </div>
        <div className="card-body">
          <div className="import-desc">
            Required columns: <b>Invoice Date</b>, <b>Name of Customer</b>, <b>Sales Amount Excluding GST</b>, <b>Gross Profit</b>.
            Optional columns: <b>Invoice No.</b>, <b>Remarks</b>.
          </div>
          <div className="file-row">
            <label className="file-lbl" htmlFor="invoice-file-input">
              Choose file
            </label>
            <input
              className="file-inp"
              id="invoice-file-input"
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(event) => void onImportFile(event)}
              disabled={importing}
            />
            <span className="file-disp">{importing ? "Import in progress..." : importFileName}</span>
          </div>
          {importSummary ? (
            <div className="import-summary">
              <p>
                Processed {importSummary.total} rows. Success: {importSummary.success}. Failed: {importSummary.failed}.
              </p>
              {importSummary.errors.length > 0
                ? importSummary.errors.slice(0, 20).map((item) => (
                    <p key={item} className="fmsg err show">
                      {item}
                    </p>
                  ))
                : null}
            </div>
          ) : null}
        </div>
      </section>

      <section>
        <div className="sec-hd">
          <div>
            <div className="sec-title">{`POS Sales Order Profit - Year ${selectedYear}`}</div>
          </div>
          <div className="yr-ctrl">
            <span className="yr-lbl">Year</span>
            <select className="yr-sel" id="invoice-year" value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="tbl-stack">
          <div className="tbl-card">
            <div className="tbl-card-hd">
              <div className="tbl-card-title">Invoice List</div>
              <div className="tbl-card-meta">{invoiceCountLabel}</div>
            </div>
            <div className="toolbar">
              <div className="search-wrap">
                <input
                  className="search-inp"
                  placeholder="Search by invoice no or customer..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <select value={customerFilterId} onChange={(event) => setCustomerFilterId(event.target.value)}>
                <option value="">All customers</option>
                {customers.map((customer) => (
                  <option key={customer.customer_id} value={customer.customer_id}>
                    {customer.customer_name}
                  </option>
                ))}
              </select>
              <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
              <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
              <input
                type="number"
                min="0"
                placeholder="Min Sales"
                value={minSalesAmount}
                onChange={(event) => setMinSalesAmount(event.target.value)}
              />
              <input
                type="number"
                min="0"
                placeholder="Max Sales"
                value={maxSalesAmount}
                onChange={(event) => setMaxSalesAmount(event.target.value)}
              />
              <input
                type="number"
                min="0"
                placeholder="Min Margin %"
                value={minMargin}
                onChange={(event) => setMinMargin(event.target.value)}
              />
              <input
                type="number"
                min="0"
                placeholder="Max Margin %"
                value={maxMargin}
                onChange={(event) => setMaxMargin(event.target.value)}
              />
              <select value={sortField} onChange={(event) => setSortField(event.target.value as InvoiceSortField)}>
                <option value="date">Sort: Date</option>
                <option value="sales">Sort: Sales</option>
                <option value="gross_profit">Sort: Gross Profit</option>
                <option value="margin">Sort: Margin</option>
              </select>
              <button
                type="button"
                className="filter-btn"
                onClick={() => setSortDirection((value) => (value === "asc" ? "desc" : "asc"))}
              >
                {sortDirection === "asc" ? "Asc" : "Desc"}
              </button>
            </div>
            <div className="tbl-scroll">
              <table>
                <thead>
                  <tr>
                    <th className="l">S.No</th>
                    <th className="l">Invoice No.</th>
                    <th className="l">Invoice Date</th>
                    <th className="l">Name of Customer</th>
                    <th>Sales Amount Excl. GST (S$)</th>
                    <th>Gross Profit (S$)</th>
                    <th>Cost of Goods Sold (S$)</th>
                    <th>Gross Profit Margin</th>
                    <th className="l">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedInvoices.length === 0 ? (
                    <tr className="empty">
                      <td className="l" colSpan={9}>
                        No invoices match selected filters.
                      </td>
                    </tr>
                  ) : (
                    sortedInvoices.map((invoice, index) => (
                      <tr key={invoice.invoice_id} className="on">
                        <td className="l">{index + 1}</td>
                        <td className="l mono">{invoice.invoice_number}</td>
                        <td className="l">{formatDate(invoice.invoice_date)}</td>
                        <td className="l hi">{customersById.get(invoice.customer_id) ?? invoice.customer_id}</td>
                        <td>{formatCurrency(invoice.sales_amount)}</td>
                        <td>{formatCurrency(invoice.gross_profit)}</td>
                        <td>{formatCurrency(invoice.cogs)}</td>
                        <td className="pos">{formatMargin(invoice.gross_profit, invoice.sales_amount)}</td>
                        <td className="l">
                          {invoice.status === "DRAFT" ? (
                            <div className="action-row">
                              <button
                                className="del finalize"
                                type="button"
                                onClick={() => void onFinalizeInvoice(invoice)}
                                disabled={actionInvoiceId === invoice.invoice_id}
                              >
                                {actionInvoiceId === invoice.invoice_id ? "..." : "Finalize"}
                              </button>
                              <button
                                className="del"
                                type="button"
                                onClick={() => void onDeleteInvoice(invoice)}
                                disabled={actionInvoiceId === invoice.invoice_id}
                                title="Delete invoice"
                              >
                                Delete
                              </button>
                            </div>
                          ) : (
                            <span className={invoice.status === "FINALIZED" ? "pos" : undefined}>{invoice.status}</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="tbl-card">
            <div className="tbl-card-hd">
              <div className="tbl-card-title">POS Sales Order Profit by Month</div>
              <div className="tbl-card-meta">{`Year ${selectedYear}`}</div>
            </div>
            <div className="tbl-scroll">
              <table>
                <thead>
                  <tr>
                    <th className="l">Month</th>
                    <th>Sales Amount Excl. GST (S$)</th>
                    <th>Gross Profit (S$)</th>
                    <th>Cost of Goods Sold (S$)</th>
                    <th>Gross Profit Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyProfitRows.map((row) => (
                    <tr key={row.month} className={row.sales > 0 ? "on" : undefined}>
                      <td className="l">{row.month}</td>
                      <td>{row.sales > 0 ? formatCurrency(row.sales) : "-"}</td>
                      <td>{row.grossProfit > 0 ? formatCurrency(row.grossProfit) : "-"}</td>
                      <td>{row.sales > 0 ? formatCurrency(row.cogs) : "-"}</td>
                      <td className={row.sales > 0 ? "pos" : undefined}>{formatMargin(row.grossProfit, row.sales)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="l">Total</td>
                    <td>{monthlyTotals.sales > 0 ? formatCurrency(monthlyTotals.sales) : "-"}</td>
                    <td>{monthlyTotals.grossProfit > 0 ? formatCurrency(monthlyTotals.grossProfit) : "-"}</td>
                    <td>{monthlyTotals.cogs > 0 ? formatCurrency(monthlyTotals.cogs) : "-"}</td>
                    <td className="pos">{formatMargin(monthlyTotals.grossProfit, monthlyTotals.sales)}</td>
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
