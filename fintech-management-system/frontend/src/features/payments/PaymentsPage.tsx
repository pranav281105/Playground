import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipProps } from "recharts";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { TableSkeleton } from "@/components/state/TableSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/AuthContext";
import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/apiError";
import { formatCurrency, formatDate } from "@/lib/format";
import { useReceivables, useVendorPayments, useVendors } from "@/lib/queries";
import type { Payment, ReceivableStatus, VendorPayment } from "@/lib/types";

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

function receivableStatusVariant(value: ReceivableStatus["payment_status"]): "secondary" | "outline" | "destructive" {
  if (value === "Paid") return "secondary";
  if (value === "Partial") return "outline";
  return "destructive";
}

function agingVariant(value: ReceivableStatus["aging_bucket"]): "secondary" | "outline" | "destructive" {
  if (value === "Paid") return "secondary";
  if (value === "0-30") return "outline";
  if (value === "31-60") return "outline";
  if (value === "61-90") return "destructive";
  return "destructive";
}

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const labelText = typeof label === "string" ? label : String(label ?? "");

  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow-md">
      <div className="mb-1 text-xs font-medium text-muted-foreground">{labelText}</div>
      <div className="space-y-1">
        {payload.map((item, index) => {
          const dataKey = String(item.dataKey ?? item.name ?? index);
          const displayName =
            dataKey === "notPaid"
              ? "Outstanding"
              : dataKey === "paid"
                ? "Paid"
                : dataKey;

          const rawValue = typeof item.value === "number" ? item.value : Number(item.value);
          const formatted = Number.isFinite(rawValue) ? formatCurrency(rawValue) : "-";

          return (
            <div key={`${dataKey}-${index}`} className="flex items-center justify-between gap-6 text-sm">
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: item.color ?? "hsl(var(--foreground))" }}
                />
                <span className="truncate">{displayName}</span>
              </div>
              <span className="font-medium tabular-nums">{formatted}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const receivableSchema = z.object({
  invoice_id: z.string().min(1, "Select an invoice"),
  amount: z.string().min(1, "Amount is required"),
  payment_method: z.enum(["cash", "paynow", "bank_transfer", "credit_card"]),
  payment_date: z.string().min(1, "Payment date is required"),
  reference_number: z.string().optional(),
});

type ReceivableValues = z.infer<typeof receivableSchema>;

const payableSchema = z.object({
  vendor_id: z.string().min(1, "Select a vendor"),
  amount: z.string().min(1, "Amount is required"),
  payment_method: z.enum(["cash", "paynow", "bank_transfer", "credit_card"]),
  payment_date: z.string().min(1, "Payment date is required"),
  bill_number: z.string().optional(),
});

type PayableValues = z.infer<typeof payableSchema>;

const EMPTY_RECEIVABLES: ReceivableStatus[] = [];
const EMPTY_VENDOR_PAYMENTS: VendorPayment[] = [];

export function PaymentsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const canCreateVendorPayment = Boolean(user?.branch_id);

  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  const receivablesQuery = useReceivables();
  const vendorPaymentsQuery = useVendorPayments({});
  const vendorsQuery = useVendors();

  const receivables = receivablesQuery.data ?? EMPTY_RECEIVABLES;
  const vendorPayments = vendorPaymentsQuery.data ?? EMPTY_VENDOR_PAYMENTS;

  const vendorsById = useMemo(
    () => new Map((vendorsQuery.data ?? []).map((vendor) => [vendor.vendor_id, vendor.vendor_name])),
    [vendorsQuery.data],
  );

  const receivableInvoices = useMemo(
    () => receivables.filter((item) => item.payment_status !== "Paid"),
    [receivables],
  );

  const availableYears = useMemo(() => {
    const years: number[] = [];

    for (const receivable of receivables) {
      const parsed = extractYearMonth(receivable.invoice_date);
      if (parsed) years.push(parsed.year);
    }

    for (const vendorPayment of vendorPayments) {
      const parsed = extractYearMonth(vendorPayment.payment_date);
      if (parsed) years.push(parsed.year);
    }

    return buildSelectableYears(years);
  }, [receivables, vendorPayments]);

  const receivedRows = useMemo(
    () =>
      receivables
        .filter((item) => extractYearMonth(item.invoice_date)?.year === selectedYear)
        .sort((left, right) => left.invoice_date.localeCompare(right.invoice_date)),
    [receivables, selectedYear],
  );

  const receivedMonthlyRows = useMemo<ReceivedMonthlyRow[]>(() => {
    const buckets = MONTHS.map((month) => ({ month, invoiceAmount: 0, paid: 0, notPaid: 0 }));
    for (const row of receivedRows) {
      const parsed = extractYearMonth(row.invoice_date);
      if (!parsed) continue;
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
      const balance = Number(row.balance_amount) || 0;
      if (row.aging_bucket === "0-30") totals.bucket0To30 += balance;
      else if (row.aging_bucket === "31-60") totals.bucket31To60 += balance;
      else if (row.aging_bucket === "61-90") totals.bucket61To90 += balance;
      else if (row.aging_bucket === "90+") totals.bucket90Plus += balance;
    }
    return totals;
  }, [receivedRows]);

  const filteredVendorPayments = useMemo(
    () =>
      vendorPayments
        .filter((item) => extractYearMonth(item.payment_date)?.year === selectedYear)
        .sort((left, right) => left.payment_date.localeCompare(right.payment_date)),
    [vendorPayments, selectedYear],
  );

  const paidMonthlyTotals = useMemo(() => {
    const totals = Array<number>(12).fill(0);
    for (const item of filteredVendorPayments) {
      const parsed = extractYearMonth(item.payment_date);
      if (!parsed) continue;
      totals[parsed.monthIndex] += Number(item.amount) || 0;
    }
    return totals;
  }, [filteredVendorPayments]);

  const paidTotal = useMemo(() => sum(paidMonthlyTotals), [paidMonthlyTotals]);

  const isLoading = receivablesQuery.isLoading || vendorPaymentsQuery.isLoading || vendorsQuery.isLoading;
  const anyError = receivablesQuery.error || vendorPaymentsQuery.error || vendorsQuery.error;

  const receivableForm = useForm<ReceivableValues>({
    resolver: zodResolver(receivableSchema),
    defaultValues: {
      invoice_id: "",
      amount: "",
      payment_method: "bank_transfer",
      payment_date: "",
      reference_number: "",
    },
  });

  const payableForm = useForm<PayableValues>({
    resolver: zodResolver(payableSchema),
    defaultValues: {
      vendor_id: "",
      amount: "",
      payment_method: "bank_transfer",
      payment_date: "",
      bill_number: "",
    },
  });

  const createReceivableMutation = useMutation({
    mutationFn: async (values: ReceivableValues) => {
      return api.post("/payments", {
        invoice_id: values.invoice_id,
        payment_date: values.payment_date,
        payment_method: values.payment_method,
        amount: values.amount,
        reference_number: values.reference_number || undefined,
      });
    },
    onSuccess: async () => {
      toast.success("Payment received recorded");
      receivableForm.reset({ ...receivableForm.getValues(), invoice_id: "", amount: "", payment_date: "", reference_number: "" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["payments", "receivables"] }),
        queryClient.invalidateQueries({ queryKey: ["payments"] }),
      ]);
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to record payment received")),
  });

  const createPayableMutation = useMutation({
    mutationFn: async (values: PayableValues) => {
      return api.post("/vendor-payments", {
        vendor_id: values.vendor_id,
        bill_number: values.bill_number || undefined,
        payment_date: values.payment_date,
        payment_method: values.payment_method,
        amount: values.amount,
      });
    },
    onSuccess: async () => {
      toast.success("Payment paid recorded");
      payableForm.reset({ ...payableForm.getValues(), vendor_id: "", amount: "", payment_date: "", bill_number: "" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["vendor-payments"] }),
        queryClient.invalidateQueries({ queryKey: ["vendor-payments", {}] }),
      ]);
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to record payment paid")),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Payments" description="Track payments received and payments paid." />
        <TableSkeleton cols={6} />
      </div>
    );
  }

  if (anyError) {
    return <ErrorState message="Failed to load payments." />;
  }

  const receivedHasData = receivedRows.some((row) => Number(row.sales_amount) > 0 || Number(row.paid_amount) > 0 || Number(row.balance_amount) > 0);
  const paidHasData = paidMonthlyTotals.some((v) => v > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="Track receivables, payables, and cash movement."
        actions={
          <Select value={String(selectedYear)} onValueChange={(value) => setSelectedYear(Number(value))}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map((year) => (
                <SelectItem key={year} value={String(year)}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="space-y-1">
            <CardDescription>Invoices (YTD)</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(receivedTotals.invoiceAmount)}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Based on receivables ledger</CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <CardDescription>Collected (YTD)</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(receivedTotals.paid)}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Payments received</CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <CardDescription>Paid to Vendors (YTD)</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(paidTotal)}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Vendor payments</CardContent>
        </Card>
      </div>

      <Tabs defaultValue="received">
        <TabsList>
          <TabsTrigger value="received">Payments Received</TabsTrigger>
          <TabsTrigger value="paid">Payments Paid</TabsTrigger>
        </TabsList>

        <TabsContent value="received" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Record Payment Received</CardTitle>
              <CardDescription>
                {receivableInvoices.length === 0
                  ? "All finalized invoices are already paid."
                  : `${receivableInvoices.length} invoice(s) pending or partial.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-4 md:grid-cols-2 lg:grid-cols-5"
                onSubmit={receivableForm.handleSubmit(async (values) => {
                  await createReceivableMutation.mutateAsync(values);
                })}
              >
                <div className="space-y-2 lg:col-span-2">
                  <label className="text-sm font-medium">Invoice</label>
                  <Select
                    value={receivableForm.watch("invoice_id") || "__none__"}
                    onValueChange={(value) => {
                      const invoiceId = value === "__none__" ? "" : value;
                      receivableForm.setValue("invoice_id", invoiceId);
                      const invoice = receivables.find((r) => r.invoice_id === invoiceId);
                      if (invoice?.balance_amount) {
                        receivableForm.setValue("amount", invoice.balance_amount);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select finalized invoice" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Select finalized invoice</SelectItem>
                      {receivableInvoices.map((invoice) => (
                        <SelectItem key={invoice.invoice_id} value={invoice.invoice_id}>
                          {`${invoice.invoice_number} · Due ${formatCurrency(invoice.balance_amount)}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {receivableForm.formState.errors.invoice_id ? (
                    <p className="text-sm text-destructive">{receivableForm.formState.errors.invoice_id.message}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Amount</label>
                  <Input inputMode="decimal" placeholder="Amount (S$)" {...receivableForm.register("amount")} />
                  {receivableForm.formState.errors.amount ? (
                    <p className="text-sm text-destructive">{receivableForm.formState.errors.amount.message}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Method</label>
                  <Select
                    value={receivableForm.watch("payment_method")}
                    onValueChange={(value) => receivableForm.setValue("payment_method", value as PaymentMethod)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Method" />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHOD_OPTIONS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Payment Date</label>
                  <Input type="date" {...receivableForm.register("payment_date")} />
                  {receivableForm.formState.errors.payment_date ? (
                    <p className="text-sm text-destructive">{receivableForm.formState.errors.payment_date.message}</p>
                  ) : null}
                </div>

                <div className="space-y-2 lg:col-span-5">
                  <label className="text-sm font-medium">Reference / Remarks</label>
                  <Input placeholder="Reference number or notes" {...receivableForm.register("reference_number")} />
                </div>

                <div className="lg:col-span-5">
                  <Button type="submit" disabled={createReceivableMutation.isPending || receivableInvoices.length === 0}>
                    {createReceivableMutation.isPending ? "Recording..." : "Record Received"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Receivables Ledger</CardTitle>
                <CardDescription>{receivedRows.length} entries</CardDescription>
              </CardHeader>
              <CardContent>
                {receivedRows.length === 0 ? (
                  <EmptyState title="No payments received data" description="No receivables found for the selected year." />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Invoice Date</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead className="text-right">Invoice</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        <TableHead>Aging</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {receivedRows.map((row) => (
                        <TableRow key={row.invoice_id}>
                          <TableCell className="font-medium">{row.invoice_number}</TableCell>
                          <TableCell>{row.customer_name}</TableCell>
                          <TableCell>{formatDate(row.invoice_date)}</TableCell>
                          <TableCell>{formatDate(row.due_date)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.sales_amount)}</TableCell>
                          <TableCell className="text-right">{Number(row.paid_amount) > 0 ? formatCurrency(row.paid_amount) : "-"}</TableCell>
                          <TableCell className="text-right">{Number(row.balance_amount) > 0 ? formatCurrency(row.balance_amount) : "-"}</TableCell>
                          <TableCell>
                            <Badge variant={agingVariant(row.aging_bucket)}>{row.aging_bucket}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={receivableStatusVariant(row.payment_status)}>{row.payment_status}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Aging & Summary</CardTitle>
                <CardDescription>Balances and monthly totals</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">0-30</span>
                    <span>{formatCurrency(agingBreakdown.bucket0To30)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">31-60</span>
                    <span>{formatCurrency(agingBreakdown.bucket31To60)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">61-90</span>
                    <span>{formatCurrency(agingBreakdown.bucket61To90)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">90+</span>
                    <span>{formatCurrency(agingBreakdown.bucket90Plus)}</span>
                  </div>
                </div>

                {receivedHasData ? (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={receivedMonthlyRows.map((r) => ({ month: r.month, notPaid: r.notPaid, paid: r.paid }))}
                        margin={{ top: 10, right: 10, left: -8, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                        <XAxis dataKey="month" tickLine={false} axisLine={false} />
                        <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => (v === 0 ? "0" : `S$${v}`)} />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.25 }} />
                        <Bar dataKey="paid" stackId="a" fill="hsl(142.1 76.2% 36.3%)" />
                        <Bar dataKey="notPaid" stackId="a" fill="hsl(var(--destructive))" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <EmptyState title="No chart data" description="Create invoices and record payments to see a chart." />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="paid" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Record Payment Paid</CardTitle>
              <CardDescription>
                {canCreateVendorPayment
                  ? "Add payments paid to vendors."
                  : "Payments paid recording is disabled for users without a branch assignment."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {canCreateVendorPayment ? (
                <form
                  className="grid gap-4 md:grid-cols-2 lg:grid-cols-5"
                  onSubmit={payableForm.handleSubmit(async (values) => {
                    await createPayableMutation.mutateAsync(values);
                  })}
                >
                  <div className="space-y-2 lg:col-span-2">
                    <label className="text-sm font-medium">Vendor</label>
                    <Select value={payableForm.watch("vendor_id") || "__none__"} onValueChange={(value) => payableForm.setValue("vendor_id", value === "__none__" ? "" : value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select vendor" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Select vendor</SelectItem>
                        {(vendorsQuery.data ?? []).map((vendor) => (
                          <SelectItem key={vendor.vendor_id} value={vendor.vendor_id}>
                            {vendor.vendor_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {payableForm.formState.errors.vendor_id ? (
                      <p className="text-sm text-destructive">{payableForm.formState.errors.vendor_id.message}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Amount</label>
                    <Input inputMode="decimal" placeholder="Amount (S$)" {...payableForm.register("amount")} />
                    {payableForm.formState.errors.amount ? (
                      <p className="text-sm text-destructive">{payableForm.formState.errors.amount.message}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Method</label>
                    <Select
                      value={payableForm.watch("payment_method")}
                      onValueChange={(value) => payableForm.setValue("payment_method", value as PaymentMethod)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Method" />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHOD_OPTIONS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Payment Date</label>
                    <Input type="date" {...payableForm.register("payment_date")} />
                    {payableForm.formState.errors.payment_date ? (
                      <p className="text-sm text-destructive">{payableForm.formState.errors.payment_date.message}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2 lg:col-span-5">
                    <label className="text-sm font-medium">Bill No. / Remarks</label>
                    <Input placeholder="Bill number or notes" {...payableForm.register("bill_number")} />
                  </div>

                  <div className="lg:col-span-5">
                    <Button type="submit" disabled={createPayableMutation.isPending}>
                      {createPayableMutation.isPending ? "Recording..." : "Record Paid"}
                    </Button>
                  </div>
                </form>
              ) : null}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Paid Entries</CardTitle>
                <CardDescription>{filteredVendorPayments.length} entries</CardDescription>
              </CardHeader>
              <CardContent>
                {filteredVendorPayments.length === 0 ? (
                  <EmptyState title="No payments paid" description="No vendor payments found for the selected year." />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Payment Date</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Remarks</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredVendorPayments.map((item) => (
                        <TableRow key={item.vendor_payment_id}>
                          <TableCell className="font-medium">{vendorsById.get(item.vendor_id) ?? "-"}</TableCell>
                          <TableCell>{formatDate(item.payment_date)}</TableCell>
                          <TableCell>{paymentMethodLabel(item.payment_method)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.amount)}</TableCell>
                          <TableCell>{item.bill_number ?? "-"}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">Paid</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Paid by Month</CardTitle>
                <CardDescription>{`Year ${selectedYear}`}</CardDescription>
              </CardHeader>
              <CardContent>
                {paidHasData ? (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={MONTHS.map((m, i) => ({ month: m, paid: paidMonthlyTotals[i] ?? 0 }))}
                        margin={{ top: 10, right: 10, left: -8, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                        <XAxis dataKey="month" tickLine={false} axisLine={false} />
                        <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => (v === 0 ? "0" : `S$${v}`)} />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.25 }} />
                        <Bar dataKey="paid" fill="hsl(var(--destructive))" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <EmptyState title="No chart data" description="Record vendor payments to see a chart." />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
