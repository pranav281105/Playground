import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipProps } from "recharts";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { TableSkeleton } from "@/components/state/TableSkeleton";
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
import { useCosts } from "@/lib/queries";
import type { CostsResponse, FailureCost, FixedCost, VariableCost } from "@/lib/types";

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

function monthlyTotalsForRows(rows: Array<{ date: string; amount: string }>, selectedYear: number): number[] {
  const totals = Array<number>(12).fill(0);
  for (const row of rows) {
    const parsed = extractYearMonth(row.date);
    if (!parsed || parsed.year !== selectedYear) continue;
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
          const displayName = dataKey === "amount" ? "Amount" : dataKey;

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

const EMPTY_COSTS: CostsResponse = { fixed: [], variable: [], failure: [] };
const EMPTY_FIXED: FixedCost[] = [];
const EMPTY_VARIABLE: VariableCost[] = [];
const EMPTY_FAILURE: FailureCost[] = [];

const fixedSchema = z.object({
  date: z.string().min(1, "Date is required"),
  category: z.string().min(1, "Category is required"),
  customCategory: z.string().optional(),
  amount: z.string().min(1, "Amount is required"),
  description: z.string().optional(),
});
type FixedValues = z.infer<typeof fixedSchema>;

const variableSchema = z.object({
  date: z.string().min(1, "Date is required"),
  category: z.string().min(1, "Category is required"),
  customCategory: z.string().optional(),
  amount: z.string().min(1, "Amount is required"),
  description: z.string().optional(),
});
type VariableValues = z.infer<typeof variableSchema>;

const failureSchema = z.object({
  failure_type: z.enum(["customer_return", "damaged_goods", "quality_defect", "shipping_error", "other"]),
  date: z.string().min(1, "Date is required"),
  amount: z.string().min(1, "Amount is required"),
  root_cause: z.string().optional(),
});
type FailureValues = z.infer<typeof failureSchema>;

function normalizeCategory(values: { category: string; customCategory?: string }) {
  return values.category === OTHER_OPTION ? (values.customCategory ?? "").trim() : values.category;
}

function yearlyTotal(rows: Array<{ date: string; amount: string }>, selectedYear: number): number {
  return sum(monthlyTotalsForRows(rows, selectedYear));
}

export function CostsPage() {
  const { user } = useAuth();
  const canCreateCostEntry = Boolean(user?.branch_id);
  const queryClient = useQueryClient();
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const costsQuery = useCosts({});
  const costs = costsQuery.data ?? EMPTY_COSTS;

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

  const fixed = costs.fixed ?? EMPTY_FIXED;
  const variable = costs.variable ?? EMPTY_VARIABLE;
  const failure = costs.failure ?? EMPTY_FAILURE;

  const fixedMonthlyTotals = useMemo(() => monthlyTotalsForRows(fixed, selectedYear), [fixed, selectedYear]);
  const variableMonthlyTotals = useMemo(() => monthlyTotalsForRows(variable, selectedYear), [variable, selectedYear]);
  const failureMonthlyTotals = useMemo(() => monthlyTotalsForRows(failure, selectedYear), [failure, selectedYear]);

  const fixedTotal = useMemo(() => yearlyTotal(fixed, selectedYear), [fixed, selectedYear]);
  const variableTotal = useMemo(() => yearlyTotal(variable, selectedYear), [variable, selectedYear]);
  const failureTotal = useMemo(() => yearlyTotal(failure, selectedYear), [failure, selectedYear]);

  const fixedForm = useForm<FixedValues>({
    resolver: zodResolver(fixedSchema),
    defaultValues: {
      date: "",
      category: FIXED_COST_OPTIONS[0],
      customCategory: "",
      amount: "",
      description: "",
    },
  });

  const variableForm = useForm<VariableValues>({
    resolver: zodResolver(variableSchema),
    defaultValues: {
      date: "",
      category: VARIABLE_COST_OPTIONS[0],
      customCategory: "",
      amount: "",
      description: "",
    },
  });

  const failureForm = useForm<FailureValues>({
    resolver: zodResolver(failureSchema),
    defaultValues: {
      failure_type: "other",
      date: "",
      amount: "",
      root_cause: "",
    },
  });

  const createFixedMutation = useMutation({
    mutationFn: async (values: FixedValues) => {
      const category = normalizeCategory(values);
      if (!category) throw new Error("Select or enter a fixed cost description.");
      return api.post("/costs/fixed", {
        category,
        amount: values.amount,
        date: values.date,
        description: values.description || undefined,
      });
    },
    onSuccess: async () => {
      toast.success("Fixed cost added");
      fixedForm.reset({ ...fixedForm.getValues(), date: "", amount: "", description: "" });
      await queryClient.invalidateQueries({ queryKey: ["costs"] });
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to save fixed cost entry")),
  });

  const createVariableMutation = useMutation({
    mutationFn: async (values: VariableValues) => {
      const category = normalizeCategory(values);
      if (!category) throw new Error("Select or enter a variable cost description.");
      return api.post("/costs/variable", {
        category,
        amount: values.amount,
        date: values.date,
        description: values.description || undefined,
      });
    },
    onSuccess: async () => {
      toast.success("Variable cost added");
      variableForm.reset({ ...variableForm.getValues(), date: "", amount: "", description: "" });
      await queryClient.invalidateQueries({ queryKey: ["costs"] });
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to save variable cost entry")),
  });

  const createFailureMutation = useMutation({
    mutationFn: async (values: FailureValues) => {
      return api.post("/costs/failure", {
        failure_type: values.failure_type,
        amount: values.amount,
        date: values.date,
        root_cause: values.root_cause || undefined,
      });
    },
    onSuccess: async () => {
      toast.success("Failure cost added");
      failureForm.reset({ ...failureForm.getValues(), date: "", amount: "", root_cause: "" });
      await queryClient.invalidateQueries({ queryKey: ["costs"] });
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to save failure cost entry")),
  });

  if (costsQuery.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Costs" description="Track fixed, variable, and failure costs." />
        <TableSkeleton cols={6} />
      </div>
    );
  }

  if (costsQuery.error) {
    return <ErrorState message="Failed to load costs." />;
  }

  const fixedHasChart = fixedMonthlyTotals.some((v) => v > 0);
  const variableHasChart = variableMonthlyTotals.some((v) => v > 0);
  const failureHasChart = failureMonthlyTotals.some((v) => v > 0);

  const fixedRows = fixed.filter((item) => extractYearMonth(item.date)?.year === selectedYear).sort((a, b) => a.date.localeCompare(b.date));
  const variableRows = variable
    .filter((item) => extractYearMonth(item.date)?.year === selectedYear)
    .sort((a, b) => a.date.localeCompare(b.date));
  const failureRows = failure
    .filter((item) => extractYearMonth(item.date)?.year === selectedYear)
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Costs"
        description="Record and analyze fixed, variable, and failure costs."
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
            <CardDescription>Fixed Costs</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(fixedTotal)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <CardDescription>Variable Costs</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(variableTotal)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <CardDescription>Failure Costs</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(failureTotal)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Tabs defaultValue="fixed">
        <TabsList>
          <TabsTrigger value="fixed">Fixed</TabsTrigger>
          <TabsTrigger value="variable">Variable</TabsTrigger>
          <TabsTrigger value="failure">Failure</TabsTrigger>
        </TabsList>

        <TabsContent value="fixed" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Add Fixed Cost</CardTitle>
              <CardDescription>Rent, insurance, utilities, and recurring expenses.</CardDescription>
            </CardHeader>
            <CardContent>
              {canCreateCostEntry ? (
                <form
                  className="grid gap-4 md:grid-cols-2 lg:grid-cols-5"
                  onSubmit={fixedForm.handleSubmit(async (values) => {
                    await createFixedMutation.mutateAsync(values);
                  })}
                >
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Date</label>
                    <Input type="date" {...fixedForm.register("date")} />
                    {fixedForm.formState.errors.date ? <p className="text-sm text-destructive">{fixedForm.formState.errors.date.message}</p> : null}
                  </div>

                  <div className="space-y-2 lg:col-span-2">
                    <label className="text-sm font-medium">Category</label>
                    <Select value={fixedForm.watch("category")} onValueChange={(value) => fixedForm.setValue("category", value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent>
                        {FIXED_COST_OPTIONS.map((item) => (
                          <SelectItem key={item} value={item}>
                            {item}
                          </SelectItem>
                        ))}
                        <SelectItem value={OTHER_OPTION}>Other…</SelectItem>
                      </SelectContent>
                    </Select>
                    {fixedForm.watch("category") === OTHER_OPTION ? (
                      <Input placeholder="Custom description" {...fixedForm.register("customCategory")} />
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Amount</label>
                    <Input inputMode="decimal" placeholder="Amount (S$)" {...fixedForm.register("amount")} />
                    {fixedForm.formState.errors.amount ? <p className="text-sm text-destructive">{fixedForm.formState.errors.amount.message}</p> : null}
                  </div>

                  <div className="space-y-2 lg:col-span-5">
                    <label className="text-sm font-medium">Remarks</label>
                    <Input placeholder="Remarks" {...fixedForm.register("description")} />
                  </div>

                  <div className="lg:col-span-5">
                    <Button type="submit" disabled={createFixedMutation.isPending}>
                      {createFixedMutation.isPending ? "Saving..." : "Add Fixed Cost"}
                    </Button>
                  </div>
                </form>
              ) : (
                <EmptyState title="Branch assignment required" description="Cost entry creation is disabled for users without a branch assignment." />
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Fixed Cost Entries</CardTitle>
                <CardDescription>{`Year ${selectedYear}`}</CardDescription>
              </CardHeader>
              <CardContent>
                {fixedRows.length === 0 ? (
                  <EmptyState title="No fixed costs" description="Add a fixed cost entry to see it here." />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Remarks</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fixedRows.map((item) => (
                        <TableRow key={item.fixed_cost_id}>
                          <TableCell>{formatDate(item.date)}</TableCell>
                          <TableCell className="font-medium">{item.category}</TableCell>
                          <TableCell>{item.description ?? "-"}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>By Month</CardTitle>
                <CardDescription>{`Year ${selectedYear}`}</CardDescription>
              </CardHeader>
              <CardContent>
                {fixedHasChart ? (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={MONTHS.map((m, i) => ({ month: m, amount: fixedMonthlyTotals[i] ?? 0 }))} margin={{ top: 10, right: 10, left: -8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                        <XAxis dataKey="month" tickLine={false} axisLine={false} />
                        <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => (v === 0 ? "0" : `S$${v}`)} />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.25 }} />
                        <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <EmptyState title="No chart data" description="Add fixed cost entries to see monthly totals." />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="variable" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Add Variable Cost</CardTitle>
              <CardDescription>Payroll, shipping, marketing spend, and other variable expenses.</CardDescription>
            </CardHeader>
            <CardContent>
              {canCreateCostEntry ? (
                <form
                  className="grid gap-4 md:grid-cols-2 lg:grid-cols-5"
                  onSubmit={variableForm.handleSubmit(async (values) => {
                    await createVariableMutation.mutateAsync(values);
                  })}
                >
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Date</label>
                    <Input type="date" {...variableForm.register("date")} />
                    {variableForm.formState.errors.date ? <p className="text-sm text-destructive">{variableForm.formState.errors.date.message}</p> : null}
                  </div>

                  <div className="space-y-2 lg:col-span-2">
                    <label className="text-sm font-medium">Category</label>
                    <Select value={variableForm.watch("category")} onValueChange={(value) => variableForm.setValue("category", value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent>
                        {VARIABLE_COST_OPTIONS.map((item) => (
                          <SelectItem key={item} value={item}>
                            {item}
                          </SelectItem>
                        ))}
                        <SelectItem value={OTHER_OPTION}>Other…</SelectItem>
                      </SelectContent>
                    </Select>
                    {variableForm.watch("category") === OTHER_OPTION ? (
                      <Input placeholder="Custom description" {...variableForm.register("customCategory")} />
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Amount</label>
                    <Input inputMode="decimal" placeholder="Amount (S$)" {...variableForm.register("amount")} />
                    {variableForm.formState.errors.amount ? <p className="text-sm text-destructive">{variableForm.formState.errors.amount.message}</p> : null}
                  </div>

                  <div className="space-y-2 lg:col-span-5">
                    <label className="text-sm font-medium">Remarks</label>
                    <Input placeholder="Remarks" {...variableForm.register("description")} />
                  </div>

                  <div className="lg:col-span-5">
                    <Button type="submit" disabled={createVariableMutation.isPending}>
                      {createVariableMutation.isPending ? "Saving..." : "Add Variable Cost"}
                    </Button>
                  </div>
                </form>
              ) : (
                <EmptyState title="Branch assignment required" description="Cost entry creation is disabled for users without a branch assignment." />
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Variable Cost Entries</CardTitle>
                <CardDescription>{`Year ${selectedYear}`}</CardDescription>
              </CardHeader>
              <CardContent>
                {variableRows.length === 0 ? (
                  <EmptyState title="No variable costs" description="Add a variable cost entry to see it here." />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Remarks</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {variableRows.map((item) => (
                        <TableRow key={item.variable_cost_id}>
                          <TableCell>{formatDate(item.date)}</TableCell>
                          <TableCell className="font-medium">{item.category}</TableCell>
                          <TableCell>{item.description ?? "-"}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>By Month</CardTitle>
                <CardDescription>{`Year ${selectedYear}`}</CardDescription>
              </CardHeader>
              <CardContent>
                {variableHasChart ? (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={MONTHS.map((m, i) => ({ month: m, amount: variableMonthlyTotals[i] ?? 0 }))} margin={{ top: 10, right: 10, left: -8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                        <XAxis dataKey="month" tickLine={false} axisLine={false} />
                        <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => (v === 0 ? "0" : `S$${v}`)} />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.25 }} />
                        <Bar dataKey="amount" fill="hsl(38 92% 50%)" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <EmptyState title="No chart data" description="Add variable cost entries to see monthly totals." />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="failure" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Add Failure Cost</CardTitle>
              <CardDescription>Defects, returns, rework, and operational failures.</CardDescription>
            </CardHeader>
            <CardContent>
              {canCreateCostEntry ? (
                <form
                  className="grid gap-4 md:grid-cols-2 lg:grid-cols-5"
                  onSubmit={failureForm.handleSubmit(async (values) => {
                    await createFailureMutation.mutateAsync(values);
                  })}
                >
                  <div className="space-y-2 lg:col-span-2">
                    <label className="text-sm font-medium">Failure Type</label>
                    <Select value={failureForm.watch("failure_type")} onValueChange={(value) => failureForm.setValue("failure_type", value as FailureType)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Failure type" />
                      </SelectTrigger>
                      <SelectContent>
                        {FAILURE_TYPE_OPTIONS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Date</label>
                    <Input type="date" {...failureForm.register("date")} />
                    {failureForm.formState.errors.date ? <p className="text-sm text-destructive">{failureForm.formState.errors.date.message}</p> : null}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Amount</label>
                    <Input inputMode="decimal" placeholder="Amount (S$)" {...failureForm.register("amount")} />
                    {failureForm.formState.errors.amount ? <p className="text-sm text-destructive">{failureForm.formState.errors.amount.message}</p> : null}
                  </div>

                  <div className="space-y-2 lg:col-span-5">
                    <label className="text-sm font-medium">Root Cause</label>
                    <Input placeholder="Root cause" {...failureForm.register("root_cause")} />
                  </div>

                  <div className="lg:col-span-5">
                    <Button type="submit" disabled={createFailureMutation.isPending}>
                      {createFailureMutation.isPending ? "Saving..." : "Add Failure Cost"}
                    </Button>
                  </div>
                </form>
              ) : (
                <EmptyState title="Branch assignment required" description="Cost entry creation is disabled for users without a branch assignment." />
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Failure Cost Entries</CardTitle>
                <CardDescription>{`Year ${selectedYear}`}</CardDescription>
              </CardHeader>
              <CardContent>
                {failureRows.length === 0 ? (
                  <EmptyState title="No failure costs" description="Add a failure cost entry to see it here." />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Root Cause</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {failureRows.map((item) => (
                        <TableRow key={item.failure_cost_id}>
                          <TableCell>{formatDate(item.date)}</TableCell>
                          <TableCell className="font-medium">
                            {FAILURE_TYPE_OPTIONS.find((t) => t.value === item.failure_type)?.label ?? item.failure_type}
                          </TableCell>
                          <TableCell>{item.root_cause ?? "-"}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>By Month</CardTitle>
                <CardDescription>{`Year ${selectedYear}`}</CardDescription>
              </CardHeader>
              <CardContent>
                {failureHasChart ? (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={MONTHS.map((m, i) => ({ month: m, amount: failureMonthlyTotals[i] ?? 0 }))} margin={{ top: 10, right: 10, left: -8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                        <XAxis dataKey="month" tickLine={false} axisLine={false} />
                        <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => (v === 0 ? "0" : `S$${v}`)} />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.25 }} />
                        <Bar dataKey="amount" fill="hsl(var(--destructive))" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <EmptyState title="No chart data" description="Add failure cost entries to see monthly totals." />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
