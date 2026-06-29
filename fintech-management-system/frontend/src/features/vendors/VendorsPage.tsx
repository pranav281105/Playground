import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Plus } from "lucide-react";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/apiError";
import { useVendors } from "@/lib/queries";
import type { Vendor } from "@/lib/types";

type StatusFilter = "all" | "active" | "inactive";
type SortField = "name" | "email" | "status";
type SortDirection = "asc" | "desc";

const createVendorSchema = z.object({
  vendor_name: z.string().min(1, "Vendor name is required"),
  contact_person: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  bank_details: z.string().optional(),
  status: z.enum(["active", "inactive"]),
});

type CreateVendorValues = z.infer<typeof createVendorSchema>;

const EMPTY_VENDORS: Vendor[] = [];

export function VendorsPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const vendorsQuery = useVendors();

  const form = useForm<CreateVendorValues>({
    resolver: zodResolver(createVendorSchema),
    defaultValues: {
      vendor_name: "",
      contact_person: "",
      email: "",
      phone: "",
      bank_details: "",
      status: "active",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: CreateVendorValues) => {
      return api.post("/vendors", {
        vendor_name: values.vendor_name,
        contact_person: values.contact_person || undefined,
        email: values.email ? values.email : undefined,
        phone: values.phone || undefined,
        bank_details: values.bank_details || undefined,
        status: values.status,
      });
    },
    onSuccess: async () => {
      toast.success("Vendor created");
      const current = form.getValues();
      form.reset({ ...current, vendor_name: "", contact_person: "", email: "" });
      await queryClient.invalidateQueries({ queryKey: ["vendors"] });
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to create vendor")),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ vendorId, status }: { vendorId: string; status: "active" | "inactive" }) => {
      return api.put(`/vendors/${vendorId}`, { status });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["vendors"] });
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to update vendor status")),
  });

  const vendors = vendorsQuery.data ?? EMPTY_VENDORS;

  const counts = useMemo(() => {
    const total = vendors.length;
    const active = vendors.filter((v) => v.status === "active").length;
    const inactive = total - active;
    return { total, active, inactive };
  }, [vendors]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return vendors.filter((vendor) => {
      if (statusFilter !== "all" && vendor.status !== statusFilter) return false;
      if (!keyword) return true;
      return [vendor.vendor_id, vendor.vendor_name, vendor.contact_person ?? "", vendor.email ?? "", vendor.phone ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [search, statusFilter, vendors]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    const dir = sortDirection === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const av = sortField === "name" ? a.vendor_name : sortField === "email" ? (a.email ?? "") : a.status;
      const bv = sortField === "name" ? b.vendor_name : sortField === "email" ? (b.email ?? "") : b.status;
      return av.localeCompare(bv) * dir;
    });
    return rows;
  }, [filtered, sortDirection, sortField]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [pageSize, safePage, sorted]);

  if (vendorsQuery.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Vendors" description="Manage vendors and payment details." />
        <TableSkeleton cols={6} />
      </div>
    );
  }

  if (vendorsQuery.error) {
    return <ErrorState message="Failed to load vendors." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendors"
        description="Manage vendors and keep payment details up to date."
        actions={
          <Button
            onClick={() => {
              const el = document.getElementById("vendor-name");
              if (el instanceof HTMLInputElement) el.focus();
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Vendor
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="space-y-1">
            <CardDescription>Total Vendors</CardDescription>
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
          <CardTitle>Add Vendor</CardTitle>
          <CardDescription>Create a new vendor record.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={form.handleSubmit(async (values) => {
              await createMutation.mutateAsync(values);
            })}
          >
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="vendor-name">
                Vendor Name
              </label>
              <Input id="vendor-name" placeholder="Vendor name" {...form.register("vendor_name")} />
              {form.formState.errors.vendor_name ? (
                <p className="text-sm text-destructive">{form.formState.errors.vendor_name.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Contact Person</label>
              <Input placeholder="Contact person" {...form.register("contact_person")} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input type="email" placeholder="finance@vendor.com" {...form.register("email")} />
              {form.formState.errors.email ? (
                <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Phone</label>
              <Input placeholder="+65 ..." {...form.register("phone")} />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Bank Details</label>
              <Input placeholder="Bank / account details" {...form.register("bank_details")} />
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
                {createMutation.isPending ? "Saving..." : "Save Vendor"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle>Vendor Directory</CardTitle>
            <CardDescription>{sorted.length} vendors</CardDescription>
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <Input
              placeholder="Search vendors..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="md:w-64"
            />
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value as StatusFilter);
                setPage(1);
              }}
            >
              <SelectTrigger className="md:w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={`${sortField}:${sortDirection}`}
              onValueChange={(value) => {
                const [field, dir] = value.split(":");
                setSortField(field as SortField);
                setSortDirection(dir as SortDirection);
              }}
            >
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
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                setPageSize(Number(value));
                setPage(1);
              }}
            >
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
            <EmptyState title="No vendors found" description="Try adjusting your search or filters." />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[80px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map((vendor) => (
                    <TableRow key={vendor.vendor_id}>
                      <TableCell className="font-medium">{vendor.vendor_name}</TableCell>
                      <TableCell>{vendor.contact_person ?? "-"}</TableCell>
                      <TableCell>{vendor.email ?? "-"}</TableCell>
                      <TableCell>{vendor.phone ?? "-"}</TableCell>
                      <TableCell>
                        <Badge variant={vendor.status === "active" ? "secondary" : "outline"}>{vendor.status}</Badge>
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
                              disabled={updateStatusMutation.isPending}
                              onClick={() => {
                                const next = vendor.status === "active" ? "inactive" : "active";
                                void updateStatusMutation.mutateAsync({ vendorId: vendor.vendor_id, status: next });
                                toast.success(`Vendor set to ${next}`);
                              }}
                            >
                              {vendor.status === "active" ? "Set inactive" : "Set active"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
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
    </div>
  );
}
