import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownAZ, ArrowUpAZ, FileUp, Plus, Trash2 } from "lucide-react";
import { ChangeEvent, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import * as XLSX from "xlsx";

import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/apiError";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Customer, Invoice } from "@/lib/types";

type ImportSummary = {
  total: number;
  success: number;
  failed: number;
  errors: string[];
};

type InvoiceSortField = "date" | "sales" | "gross_profit" | "margin";
type SortDirection = "asc" | "desc";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const COLUMN_ALIASES = {
  invoiceNumber: ["invoiceno", "invoicenumber", "invoice"],
  invoiceDate: ["invoicedate", "date"],
  customerName: ["nameofcustomer", "customername", "customer"],
  salesAmount: ["salesamountexcludinggsts", "salesamountexcludinggst", "salesamount", "sales"],
  grossProfit: ["grossprofits", "grossprofit", "gp"],
  remarks: ["remarks", "remark", "notes", "note"],
};

const createInvoiceSchema = z.object({
  invoice_number: z.string().optional(),
  customer_id: z.string().min(1, "Customer is required"),
  invoice_date: z.string().min(1, "Invoice date is required"),
  sales_amount: z
    .string()
    .min(1, "Sales amount is required")
    .refine((v) => Number.isFinite(Number(v)) && Number(v) >= 0, "Enter a valid amount"),
  gross_profit: z
    .string()
    .min(1, "Gross profit is required")
    .refine((v) => Number.isFinite(Number(v)), "Enter a valid amount"),
  remarks: z.string().optional(),
});

type CreateInvoiceValues = z.infer<typeof createInvoiceSchema>;

function formatMargin(grossProfit: string | number, salesAmount: string | number): string {
  const gross = Number(grossProfit);
  const sales = Number(salesAmount);
  if (!Number.isFinite(gross) || !Number.isFinite(sales) || sales <= 0) return "-";
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
  if (Number.isNaN(date.getTime())) return null;
  return { year: date.getFullYear(), monthIndex: date.getMonth() };
}

function buildSelectableYears(dataYears: number[]): number[] {
  const now = new Date().getFullYear();
  const years = new Set<number>(dataYears);
  for (let offset = -5; offset <= 5; offset += 1) years.add(now + offset);
  return Array.from(years).sort((left, right) => right - left);
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findValue(row: Record<string, unknown>, aliases: string[]): unknown {
  for (const [key, value] of Object.entries(row)) {
    if (aliases.includes(normalizeHeader(key))) return value;
  }
  return undefined;
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseMoney(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return value.toFixed(2);

  const text = toText(value);
  if (!text) return null;

  let cleaned = text.replace(/[^0-9().-]/g, "");
  if (cleaned.startsWith("(") && cleaned.endsWith(")")) cleaned = `-${cleaned.slice(1, -1)}`;

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return parsed.toFixed(2);
}

function formatIsoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function parseDateToIso(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return formatIsoDate(parsed.y, parsed.m, parsed.d);
  }

  const text = toText(value);
  if (!text) return null;

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) return formatIsoDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));

  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const month = Number(slashMatch[1]);
    const day = Number(slashMatch[2]);
    const year = slashMatch[3].length === 2 ? 2000 + Number(slashMatch[3]) : Number(slashMatch[3]);
    return formatIsoDate(year, month, day);
  }

  const native = new Date(text);
  if (!Number.isNaN(native.getTime())) return native.toISOString().slice(0, 10);

  return null;
}

const EMPTY_INVOICES: Invoice[] = [];
const EMPTY_CUSTOMERS: Customer[] = [];

export function InvoicesPage() {
  const queryClient = useQueryClient();

  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [search, setSearch] = useState("");
  const [customerFilterId, setCustomerFilterId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minSalesAmount, setMinSalesAmount] = useState("");
  const [maxSalesAmount, setMaxSalesAmount] = useState("");
  const [minMargin, setMinMargin] = useState("");
  const [maxMargin, setMaxMargin] = useState("");
  const [sortField, setSortField] = useState<InvoiceSortField>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const [importing, setImporting] = useState(false);
  const [importFileName, setImportFileName] = useState("No file chosen");
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);
  const [finalizeTarget, setFinalizeTarget] = useState<Invoice | null>(null);

  const invoicesQuery = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => (await api.get<Invoice[]>("/invoices")).data,
  });

  const customersQuery = useQuery({
    queryKey: ["customers"],
    queryFn: async () => (await api.get<Customer[]>("/customers")).data,
  });

  const invoices = invoicesQuery.data ?? EMPTY_INVOICES;
  const customers = customersQuery.data ?? EMPTY_CUSTOMERS;

  const customersById = useMemo(
    () => new Map(customers.map((customer) => [customer.customer_id, customer.customer_name])),
    [customers],
  );

  const availableYears = useMemo(() => {
    const years: number[] = [];
    for (const invoice of invoices) {
      const parsed = extractYearMonth(invoice.invoice_date);
      if (parsed) years.push(parsed.year);
    }
    return buildSelectableYears(years);
  }, [invoices]);

  const safeSelectedYear = useMemo(() => {
    if (availableYears.length === 0) return selectedYear;
    if (availableYears.includes(selectedYear)) return selectedYear;
    const currentYear = new Date().getFullYear();
    return availableYears.includes(currentYear) ? currentYear : availableYears[0];
  }, [availableYears, selectedYear]);

  const yearInvoices = useMemo(() => {
    return invoices.filter((invoice) => extractYearMonth(invoice.invoice_date)?.year === safeSelectedYear);
  }, [invoices, safeSelectedYear]);

  const filteredInvoices = useMemo(() => {
    const query = search.trim().toLowerCase();
    const minSales = minSalesAmount ? Number(minSalesAmount) : null;
    const maxSales = maxSalesAmount ? Number(maxSalesAmount) : null;
    const minMarginValue = minMargin ? Number(minMargin) : null;
    const maxMarginValue = maxMargin ? Number(maxMargin) : null;

    return yearInvoices.filter((invoice) => {
      if (customerFilterId && invoice.customer_id !== customerFilterId) return false;
      if (dateFrom && invoice.invoice_date < dateFrom) return false;
      if (dateTo && invoice.invoice_date > dateTo) return false;

      const sales = Number(invoice.sales_amount);
      if (minSales !== null && Number.isFinite(minSales) && sales < minSales) return false;
      if (maxSales !== null && Number.isFinite(maxSales) && sales > maxSales) return false;

      const gross = Number(invoice.gross_profit);
      const margin = sales > 0 ? (gross / sales) * 100 : 0;
      if (minMarginValue !== null && Number.isFinite(minMarginValue) && margin < minMarginValue) return false;
      if (maxMarginValue !== null && Number.isFinite(maxMarginValue) && margin > maxMarginValue) return false;

      if (!query) return true;
      const customerName = customersById.get(invoice.customer_id) ?? "";
      return [invoice.invoice_number, customerName].join(" ").toLowerCase().includes(query);
    });
  }, [
    customerFilterId,
    customersById,
    dateFrom,
    dateTo,
    maxMargin,
    maxSalesAmount,
    minMargin,
    minSalesAmount,
    search,
    yearInvoices,
  ]);

  const sortedInvoices = useMemo(() => {
    const rows = [...filteredInvoices];
    const dir = sortDirection === "asc" ? 1 : -1;
    rows.sort((left, right) => {
      const leftSales = Number(left.sales_amount);
      const rightSales = Number(right.sales_amount);
      const leftGross = Number(left.gross_profit);
      const rightGross = Number(right.gross_profit);
      const leftMargin = leftSales > 0 ? (leftGross / leftSales) * 100 : 0;
      const rightMargin = rightSales > 0 ? (rightGross / rightSales) * 100 : 0;

      const comparison =
        sortField === "date"
          ? left.invoice_date.localeCompare(right.invoice_date)
          : sortField === "sales"
            ? leftSales - rightSales
            : sortField === "gross_profit"
              ? leftGross - rightGross
              : leftMargin - rightMargin;
      return comparison * dir;
    });
    return rows;
  }, [filteredInvoices, sortDirection, sortField]);

  const monthlyProfitRows = useMemo(() => {
    const buckets = Array.from({ length: 12 }, (_, index) => ({
      month: MONTHS[index],
      sales: 0,
      grossProfit: 0,
      cogs: 0,
    }));

    for (const invoice of yearInvoices) {
      const parsed = extractYearMonth(invoice.invoice_date);
      if (!parsed) continue;
      buckets[parsed.monthIndex].sales += Number(invoice.sales_amount) || 0;
      buckets[parsed.monthIndex].grossProfit += Number(invoice.gross_profit) || 0;
      buckets[parsed.monthIndex].cogs += Number(invoice.cogs) || 0;
    }

    return buckets;
  }, [yearInvoices]);

  const monthlyTotals = useMemo(() => {
    return monthlyProfitRows.reduce(
      (acc, row) => ({
        sales: acc.sales + row.sales,
        grossProfit: acc.grossProfit + row.grossProfit,
        cogs: acc.cogs + row.cogs,
      }),
      { sales: 0, grossProfit: 0, cogs: 0 },
    );
  }, [monthlyProfitRows]);

  const createInvoiceForm = useForm<CreateInvoiceValues>({
    resolver: zodResolver(createInvoiceSchema),
    defaultValues: {
      invoice_number: "",
      customer_id: "",
      invoice_date: "",
      sales_amount: "",
      gross_profit: "",
      remarks: "",
    },
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async (values: CreateInvoiceValues) => {
      return api.post("/invoices", {
        invoice_number: values.invoice_number?.trim() ? values.invoice_number.trim() : undefined,
        customer_id: values.customer_id,
        invoice_date: values.invoice_date,
        sales_amount: Number(values.sales_amount).toFixed(2),
        gross_profit: Number(values.gross_profit).toFixed(2),
        remarks: values.remarks?.trim() ? values.remarks.trim() : undefined,
      });
    },
    onSuccess: async () => {
      toast.success("Invoice created");
      createInvoiceForm.reset({
        invoice_number: "",
        customer_id: createInvoiceForm.getValues("customer_id"),
        invoice_date: "",
        sales_amount: "",
        gross_profit: "",
        remarks: "",
      });
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
      await queryClient.invalidateQueries({ queryKey: ["payments", "receivables"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to create invoice")),
  });

  const finalizeMutation = useMutation({
    mutationFn: async (invoiceId: string) => api.post(`/invoices/${invoiceId}/finalize`, {}),
    onSuccess: async () => {
      toast.success("Invoice finalized");
      setFinalizeTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
      await queryClient.invalidateQueries({ queryKey: ["payments", "receivables"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to finalize invoice")),
  });

  const deleteMutation = useMutation({
    mutationFn: async (invoiceId: string) => api.delete(`/invoices/${invoiceId}`),
    onSuccess: async () => {
      toast.success("Invoice deleted");
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
      await queryClient.invalidateQueries({ queryKey: ["payments", "receivables"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to delete invoice")),
  });

  const busy = createInvoiceMutation.isPending || finalizeMutation.isPending || deleteMutation.isPending || importing;

  const onImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      setImportFileName("No file chosen");
      return;
    }
    setImportFileName(file.name);
    setImportSummary(null);

    if (customers.length === 0) {
      toast.error("Create at least one customer before importing invoices.");
      return;
    }

    setImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        toast.error("File has no worksheet.");
        return;
      }

      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true });
      if (rows.length === 0) {
        toast.error("No data rows found in file.");
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
        const invoiceDateValue = findValue(row, COLUMN_ALIASES.invoiceDate);
        const salesAmountValue = findValue(row, COLUMN_ALIASES.salesAmount);
        const grossProfitValue = findValue(row, COLUMN_ALIASES.grossProfit);
        const remarksText = toText(findValue(row, COLUMN_ALIASES.remarks));

        if (!customerNameText || invoiceDateValue === undefined || salesAmountValue === undefined || grossProfitValue === undefined) {
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

        const parsedDate = parseDateToIso(invoiceDateValue);
        if (!parsedDate) {
          rowErrors.push(`Row ${rowNo}: Invalid invoice date.`);
          continue;
        }

        const parsedSalesAmount = parseMoney(salesAmountValue);
        if (!parsedSalesAmount) {
          rowErrors.push(`Row ${rowNo}: Invalid sales amount.`);
          continue;
        }

        const parsedGrossProfit = parseMoney(grossProfitValue);
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
        await queryClient.invalidateQueries({ queryKey: ["invoices"] });
        await queryClient.invalidateQueries({ queryKey: ["payments", "receivables"] });
        await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        toast.success(`Imported ${successCount} invoice(s) successfully.`);
      }
    } finally {
      setImporting(false);
    }
  };

  const isLoading = invoicesQuery.isLoading || customersQuery.isLoading;
  const anyError = invoicesQuery.error || customersQuery.error;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Invoices" description="POS sales order entry, import, and profitability." />
        <Card>
          <CardHeader>
            <CardTitle>Loading</CardTitle>
            <CardDescription>Please wait…</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (anyError) {
    return <ErrorState message="Failed to load invoices." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Invoices" description="POS sales order entry, bulk import, and monthly profitability." />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="space-y-1">
            <CardDescription>Invoices (Year {safeSelectedYear})</CardDescription>
            <CardTitle className="text-2xl">{yearInvoices.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <CardDescription>Sales (Year {safeSelectedYear})</CardDescription>
            <CardTitle className="text-2xl">{monthlyTotals.sales > 0 ? formatCurrency(monthlyTotals.sales) : "-"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <CardDescription>Gross Profit (Year {safeSelectedYear})</CardDescription>
            <CardTitle className="text-2xl">{monthlyTotals.grossProfit > 0 ? formatCurrency(monthlyTotals.grossProfit) : "-"}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add Invoice</CardTitle>
          <CardDescription>Create a new POS sales order invoice.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-3"
            onSubmit={createInvoiceForm.handleSubmit(async (values) => {
              await createInvoiceMutation.mutateAsync(values);
            })}
          >
            <div className="space-y-2 md:col-span-1">
              <label className="text-sm font-medium">Invoice No. (Optional)</label>
              <Input placeholder="Auto-generated if blank" {...createInvoiceForm.register("invoice_number")} disabled={busy} />
            </div>

            <div className="space-y-2 md:col-span-1">
              <label className="text-sm font-medium">Invoice Date</label>
              <Input type="date" {...createInvoiceForm.register("invoice_date")} disabled={busy} />
              {createInvoiceForm.formState.errors.invoice_date ? (
                <p className="text-sm text-destructive">{createInvoiceForm.formState.errors.invoice_date.message}</p>
              ) : null}
            </div>

            <div className="space-y-2 md:col-span-1">
              <label className="text-sm font-medium">Customer</label>
              <Select
                value={createInvoiceForm.watch("customer_id") || "__none__"}
                onValueChange={(value) => createInvoiceForm.setValue("customer_id", value === "__none__" ? "" : value)}
                disabled={busy}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select customer</SelectItem>
                  {customers.map((customer) => (
                    <SelectItem key={customer.customer_id} value={customer.customer_id}>
                      {customer.customer_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {createInvoiceForm.formState.errors.customer_id ? (
                <p className="text-sm text-destructive">{createInvoiceForm.formState.errors.customer_id.message}</p>
              ) : null}
            </div>

            <div className="space-y-2 md:col-span-1">
              <label className="text-sm font-medium">Sales Amount Excl. GST (S$)</label>
              <Input inputMode="decimal" placeholder="0.00" {...createInvoiceForm.register("sales_amount")} disabled={busy} />
              {createInvoiceForm.formState.errors.sales_amount ? (
                <p className="text-sm text-destructive">{createInvoiceForm.formState.errors.sales_amount.message}</p>
              ) : null}
            </div>

            <div className="space-y-2 md:col-span-1">
              <label className="text-sm font-medium">Gross Profit (S$)</label>
              <Input inputMode="decimal" placeholder="0.00" {...createInvoiceForm.register("gross_profit")} disabled={busy} />
              {createInvoiceForm.formState.errors.gross_profit ? (
                <p className="text-sm text-destructive">{createInvoiceForm.formState.errors.gross_profit.message}</p>
              ) : null}
            </div>

            <div className="space-y-2 md:col-span-1">
              <label className="text-sm font-medium">Remarks</label>
              <Input placeholder="Optional" {...createInvoiceForm.register("remarks")} disabled={busy} />
            </div>

            <div className="md:col-span-3">
              <Button type="submit" disabled={busy}>
                <Plus className="mr-2 h-4 w-4" />
                Add Invoice
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Import Invoices (CSV / Excel)</CardTitle>
          <CardDescription>
            Required columns: Invoice Date, Name of Customer, Sales Amount Excluding GST, Gross Profit. Optional: Invoice No., Remarks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <Button asChild variant="outline" disabled={busy}>
                <label htmlFor="invoice-file-input" className="cursor-pointer">
                  <FileUp className="mr-2 h-4 w-4" />
                  Choose file
                </label>
              </Button>
              <input
                id="invoice-file-input"
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(event) => void onImportFile(event)}
                disabled={busy}
                className="hidden"
              />
              <div className="text-sm text-muted-foreground">{importing ? "Import in progress…" : importFileName}</div>
            </div>
          </div>

          {importSummary ? (
            <div className="rounded-md border p-4 space-y-2">
              <div className="text-sm">
                Processed {importSummary.total} rows. Success: {importSummary.success}. Failed: {importSummary.failed}.
              </div>
              {importSummary.errors.length > 0 ? (
                <div className="space-y-1">
                  {importSummary.errors.slice(0, 20).map((item) => (
                    <div key={item} className="text-sm text-destructive">
                      {item}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle>Invoice List</CardTitle>
            <CardDescription>{`${sortedInvoices.length} invoice${sortedInvoices.length === 1 ? "" : "s"}`}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Year</span>
            <Select value={String(safeSelectedYear)} onValueChange={(value) => setSelectedYear(Number(value))} disabled={busy}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-6">
            <div className="md:col-span-2">
              <Input placeholder="Search invoice no or customer…" value={search} onChange={(event) => setSearch(event.target.value)} disabled={busy} />
            </div>
            <Select value={customerFilterId || "__all__"} onValueChange={(value) => setCustomerFilterId(value === "__all__" ? "" : value)} disabled={busy}>
              <SelectTrigger>
                <SelectValue placeholder="All customers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All customers</SelectItem>
                {customers.map((customer) => (
                  <SelectItem key={customer.customer_id} value={customer.customer_id}>
                    {customer.customer_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} disabled={busy} />
            <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} disabled={busy} />
            <div className="flex gap-2">
              <Select value={sortField} onValueChange={(value) => setSortField(value as InvoiceSortField)} disabled={busy}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Sort: Date</SelectItem>
                  <SelectItem value="sales">Sort: Sales</SelectItem>
                  <SelectItem value="gross_profit">Sort: Gross Profit</SelectItem>
                  <SelectItem value="margin">Sort: Margin</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSortDirection((value) => (value === "asc" ? "desc" : "asc"))}
                disabled={busy}
                className="shrink-0"
                aria-label="Toggle sort direction"
              >
                {sortDirection === "asc" ? <ArrowUpAZ className="h-4 w-4" /> : <ArrowDownAZ className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <Input
              type="number"
              min="0"
              placeholder="Min Sales"
              value={minSalesAmount}
              onChange={(event) => setMinSalesAmount(event.target.value)}
              disabled={busy}
            />
            <Input
              type="number"
              min="0"
              placeholder="Max Sales"
              value={maxSalesAmount}
              onChange={(event) => setMaxSalesAmount(event.target.value)}
              disabled={busy}
            />
            <Input
              type="number"
              min="0"
              placeholder="Min Margin %"
              value={minMargin}
              onChange={(event) => setMinMargin(event.target.value)}
              disabled={busy}
            />
            <Input
              type="number"
              min="0"
              placeholder="Max Margin %"
              value={maxMargin}
              onChange={(event) => setMaxMargin(event.target.value)}
              disabled={busy}
            />
          </div>

          {sortedInvoices.length === 0 ? (
            <EmptyState title="No invoices found" description="Try adjusting filters, or create a new invoice." />
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">S.No</TableHead>
                    <TableHead>Invoice No.</TableHead>
                    <TableHead>Invoice Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Sales (S$)</TableHead>
                    <TableHead className="text-right">Gross Profit (S$)</TableHead>
                    <TableHead className="text-right">COGS (S$)</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                    <TableHead className="w-40 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedInvoices.map((invoice, index) => {
                    const customerName = customersById.get(invoice.customer_id) ?? invoice.customer_id;
                    const statusBadge =
                      invoice.status === "DRAFT" ? (
                        <Badge variant="secondary">Draft</Badge>
                      ) : invoice.status === "FINALIZED" ? (
                        <Badge>Finalized</Badge>
                      ) : (
                        <Badge variant="destructive">Void</Badge>
                      );

                    return (
                      <TableRow key={invoice.invoice_id}>
                        <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                        <TableCell className="font-mono text-xs">{invoice.invoice_number}</TableCell>
                        <TableCell>{formatDate(invoice.invoice_date)}</TableCell>
                        <TableCell className="font-medium">{customerName}</TableCell>
                        <TableCell className="text-right">{formatCurrency(invoice.sales_amount)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(invoice.gross_profit)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(invoice.cogs)}</TableCell>
                        <TableCell className="text-right">{formatMargin(invoice.gross_profit, invoice.sales_amount)}</TableCell>
                        <TableCell className="text-right">
                          {invoice.status === "DRAFT" ? (
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => setFinalizeTarget(invoice)} disabled={busy}>
                                Finalize
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(invoice)} disabled={busy} aria-label="Delete invoice">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex justify-end">{statusBadge}</div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>POS Sales Order Profit by Month</CardTitle>
          <CardDescription>{`Year ${safeSelectedYear}`}</CardDescription>
        </CardHeader>
        <CardContent>
          {monthlyTotals.sales <= 0 && monthlyTotals.grossProfit <= 0 ? (
            <EmptyState title="No profitability data" description="Finalize invoices to see monthly profitability." />
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Sales (S$)</TableHead>
                    <TableHead className="text-right">Gross Profit (S$)</TableHead>
                    <TableHead className="text-right">COGS (S$)</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyProfitRows.map((row) => (
                    <TableRow key={row.month}>
                      <TableCell className="font-medium">{row.month}</TableCell>
                      <TableCell className="text-right">{row.sales > 0 ? formatCurrency(row.sales) : "-"}</TableCell>
                      <TableCell className="text-right">{row.grossProfit > 0 ? formatCurrency(row.grossProfit) : "-"}</TableCell>
                      <TableCell className="text-right">{row.sales > 0 ? formatCurrency(row.cogs) : "-"}</TableCell>
                      <TableCell className="text-right">{row.sales > 0 ? formatMargin(row.grossProfit, row.sales) : "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <tfoot>
                  <TableRow>
                    <TableCell className="font-medium">Total</TableCell>
                    <TableCell className="text-right">{monthlyTotals.sales > 0 ? formatCurrency(monthlyTotals.sales) : "-"}</TableCell>
                    <TableCell className="text-right">{monthlyTotals.grossProfit > 0 ? formatCurrency(monthlyTotals.grossProfit) : "-"}</TableCell>
                    <TableCell className="text-right">{monthlyTotals.cogs > 0 ? formatCurrency(monthlyTotals.cogs) : "-"}</TableCell>
                    <TableCell className="text-right">{formatMargin(monthlyTotals.grossProfit, monthlyTotals.sales)}</TableCell>
                  </TableRow>
                </tfoot>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => (!open ? setDeleteTarget(null) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete invoice?</DialogTitle>
            <DialogDescription>
              {deleteTarget ? `This will permanently delete invoice ${deleteTarget.invoice_number}.` : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!deleteTarget) return;
                await deleteMutation.mutateAsync(deleteTarget.invoice_id);
              }}
              disabled={busy}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={finalizeTarget !== null} onOpenChange={(open) => (!open ? setFinalizeTarget(null) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalize invoice?</DialogTitle>
            <DialogDescription>
              {finalizeTarget
                ? `Finalize invoice ${finalizeTarget.invoice_number}. This will move it out of draft status.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinalizeTarget(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!finalizeTarget) return;
                await finalizeMutation.mutateAsync(finalizeTarget.invoice_id);
              }}
              disabled={busy}
            >
              Finalize
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
