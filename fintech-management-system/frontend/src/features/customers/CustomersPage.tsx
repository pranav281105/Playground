import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownAZ, ArrowUpAZ, MoreHorizontal, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/features/auth/AuthContext";
import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/apiError";
import type { Branch, Customer } from "@/lib/types";

type StatusFilter = "all" | "active" | "inactive";
type SortField = "name" | "email" | "status";
type SortDirection = "asc" | "desc";

function branchOptionLabel(branch: Branch): string {
  return `${branch.branch_name} (${branch.branch_id.slice(0, 8)})`;
}

const createCustomerSchema = z.object({
  branch_id: z.string().optional(),
  customer_name: z.string().min(1, "Customer name is required"),
  contact_person: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  payment_terms: z.string().optional(),
  status: z.enum(["active", "inactive"]),
});

type CreateCustomerValues = z.infer<typeof createCustomerSchema>;

const EMPTY_CUSTOMERS: Customer[] = [];
const EMPTY_BRANCHES: Branch[] = [];

export function CustomersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const isAdmin = user?.role === "admin" || user?.role === "owner";

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);

  const customersQuery = useQuery({
    queryKey: ["customers"],
    queryFn: async () => (await api.get<Customer[]>("/customers")).data,
  });

  const branchesQuery = useQuery({
    queryKey: ["branches"],
    queryFn: async () => (await api.get<Branch[]>("/branches")).data,
    enabled: isAdmin,
  });

  const form = useForm<CreateCustomerValues>({
    resolver: zodResolver(createCustomerSchema),
    defaultValues: {
      customer_name: "",
      contact_person: "",
      email: "",
      phone: "",
      address: "",
      payment_terms: "",
      status: "active",
      branch_id: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: CreateCustomerValues) => {
      const payload = {
        customer_name: values.customer_name,
        contact_person: values.contact_person || undefined,
        email: values.email ? values.email : undefined,
        phone: values.phone || undefined,
        address: values.address || undefined,
        payment_terms: values.payment_terms || undefined,
        status: values.status,
      };

      return api.post("/customers", payload, isAdmin ? { params: { branch_id: values.branch_id } } : undefined);
    },
    onSuccess: async () => {
      toast.success("Customer created");
      const current = form.getValues();
      form.reset({ ...current, customer_name: "", contact_person: "", email: "" });
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to create customer")),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ customerId, status }: { customerId: string; status: "active" | "inactive" }) => {
      return api.put(`/customers/${customerId}`, { status });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to update customer status")),
  });

  const deleteMutation = useMutation({
    mutationFn: async (customerId: string) => {
      return api.delete(`/customers/${customerId}`);
    },
    onSuccess: async () => {
      toast.success("Customer deleted");
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to delete customer")),
  });

  const customers = customersQuery.data ?? EMPTY_CUSTOMERS;
  const branches = branchesQuery.data ?? EMPTY_BRANCHES;

  const counts = useMemo(() => {
    const total = customers.length;
    const active = customers.filter((c) => c.status === "active").length;
    const inactive = total - active;
    return { total, active, inactive };
  }, [customers]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return customers.filter((customer) => {
      if (statusFilter !== "all" && customer.status !== statusFilter) return false;
      if (!keyword) return true;
      return [customer.customer_name, customer.contact_person ?? "", customer.email ?? "", customer.phone ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [customers, search, statusFilter]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    const dir = sortDirection === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const av =
        sortField === "name" ? a.customer_name : sortField === "email" ? (a.email ?? "") : a.status;
      const bv =
        sortField === "name" ? b.customer_name : sortField === "email" ? (b.email ?? "") : b.status;
      return av.localeCompare(bv) * dir;
    });
    return rows;
  }, [filtered, sortDirection, sortField]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [safePage, pageSize, sorted]);

  const isLoading = customersQuery.isLoading || branchesQuery.isLoading;
  const anyError = customersQuery.error || branchesQuery.error;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Customers" description="Customer directory." />
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
    return <ErrorState message="Failed to load customers." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Search, manage, and maintain your customer directory."
        actions={
          <Button
            onClick={() => {
              const el = document.getElementById("customer-name");
              if (el instanceof HTMLInputElement) el.focus();
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Customer
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="space-y-1">
            <CardDescription>Total Customers</CardDescription>
            <CardTitle className="text-2xl">{counts.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <CardDescription>Active</CardDescription>
            <CardTitle className="text-2xl">{counts.active}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <CardDescription>Inactive</CardDescription>
            <CardTitle className="text-2xl">{counts.inactive}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add Customer</CardTitle>
          <CardDescription>Create a new customer record.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={form.handleSubmit(async (values) => {
              if (isAdmin && !values.branch_id) {
                toast.error("Select a branch for customer creation.");
                return;
              }
              await createMutation.mutateAsync(values);
            })}
          >
            {isAdmin ? (
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Branch</label>
                <Select value={form.watch("branch_id") || "__none__"} onValueChange={(value) => form.setValue("branch_id", value === "__none__" ? "" : value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Branch" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select Branch</SelectItem>
                    {branches.map((branch) => (
                      <SelectItem key={branch.branch_id} value={branch.branch_id}>
                        {branchOptionLabel(branch)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="customer-name">
                Customer Name
              </label>
              <Input id="customer-name" placeholder="Acme Pte Ltd" {...form.register("customer_name")} />
              {form.formState.errors.customer_name ? (
                <p className="text-sm text-destructive">{form.formState.errors.customer_name.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Contact Person</label>
              <Input placeholder="Jane Doe" {...form.register("contact_person")} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input type="email" placeholder="finance@acme.com" {...form.register("email")} />
              {form.formState.errors.email ? (
                <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Phone</label>
              <Input placeholder="+65 ..." {...form.register("phone")} />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Address</label>
              <Input placeholder="Street, City" {...form.register("address")} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Payment Terms</label>
              <Input placeholder="30 days" {...form.register("payment_terms")} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={form.watch("status")} onValueChange={(value) => form.setValue("status", value as "active" | "inactive")}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">active</SelectItem>
                  <SelectItem value="inactive">inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2">
              <Button type="submit" disabled={createMutation.isPending} className="w-full md:w-auto">
                {createMutation.isPending ? "Saving..." : "Save Customer"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle>Customer Directory</CardTitle>
            <CardDescription>{sorted.length} customers</CardDescription>
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <Input placeholder="Search customers..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="md:w-64" />
            <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value as StatusFilter); setPage(1); }}>
              <SelectTrigger className="md:w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Select value={`${sortField}:${sortDirection}`} onValueChange={(value) => {
              const [field, dir] = value.split(":");
              setSortField(field as SortField);
              setSortDirection(dir as SortDirection);
            }}>
              <SelectTrigger className="md:w-48">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name:asc">Name (A-Z)</SelectItem>
                <SelectItem value="name:desc">Name (Z-A)</SelectItem>
                <SelectItem value="email:asc">Email (A-Z)</SelectItem>
                <SelectItem value="email:desc">Email (Z-A)</SelectItem>
                <SelectItem value="status:asc">Status (A-Z)</SelectItem>
                <SelectItem value="status:desc">Status (Z-A)</SelectItem>
              </SelectContent>
            </Select>
            <Select value={String(pageSize)} onValueChange={(value) => { setPageSize(Number(value)); setPage(1); }}>
              <SelectTrigger className="md:w-28">
                <SelectValue placeholder="Rows" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {sorted.length === 0 ? (
            <EmptyState title="No customers found" description="Try adjusting your search or filters." />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[80px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map((customer) => {
                    const isBusy =
                      updateStatusMutation.isPending || deleteMutation.isPending;

                    return (
                      <TableRow key={customer.customer_id}>
                        <TableCell className="font-medium">{customer.customer_name}</TableCell>
                        <TableCell>{customer.contact_person ?? "-"}</TableCell>
                        <TableCell>{customer.email ?? "-"}</TableCell>
                        <TableCell>
                          <Badge variant={customer.status === "active" ? "secondary" : "outline"}>{customer.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label="Actions">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                disabled={isBusy}
                                onClick={() => {
                                  const next = customer.status === "active" ? "inactive" : "active";
                                  void updateStatusMutation.mutateAsync({ customerId: customer.customer_id, status: next });
                                  toast.success(`Customer set to ${next}`);
                                }}
                              >
                                {customer.status === "active" ? <ArrowDownAZ className="mr-2 h-4 w-4" /> : <ArrowUpAZ className="mr-2 h-4 w-4" />}
                                {customer.status === "active" ? "Set inactive" : "Set active"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={isBusy}
                                onClick={() => setDeleteTarget(customer)}
                                className="text-destructive focus:text-destructive"
                              >
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="text-sm text-muted-foreground">
                  Page {safePage} of {totalPages}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}>
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete customer?</DialogTitle>
            <DialogDescription>
              {deleteTarget ? `This will permanently delete "${deleteTarget.customer_name}".` : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending || !deleteTarget}
              onClick={() => {
                if (!deleteTarget) return;
                void deleteMutation.mutateAsync(deleteTarget.customer_id);
              }}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
