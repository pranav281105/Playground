import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, RefreshCcw, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/apiError";
import { formatDate } from "@/lib/format";
import { useAdminData } from "@/lib/queries";
import type { AuditLog, AuthUser, Branch, Business, Company, UserRole } from "@/lib/types";

const EMPTY_COMPANIES: Company[] = [];
const EMPTY_BUSINESSES: Business[] = [];
const EMPTY_BRANCHES: Branch[] = [];
const EMPTY_USERS: AuthUser[] = [];
const EMPTY_AUDIT_LOGS: AuditLog[] = [];

function shortId(value: string | null | undefined): string {
  if (!value) return "-";
  return value.slice(0, 8);
}

function roleLabel(role: UserRole): string {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  if (role === "business_manager") return "Business Manager";
  return "Branch Manager";
}

function businessOptionLabel(business: Business, companyById: Map<string, Company>): string {
  const company = companyById.get(business.company_id);
  const companyLabel = company ? company.company_name : shortId(business.company_id);
  return `${business.business_name} · ${companyLabel}`;
}

function branchOptionLabel(branch: Branch, businessById: Map<string, Business>): string {
  const business = branch.business_id ? businessById.get(branch.business_id) : undefined;
  const businessLabel = business ? business.business_name : shortId(branch.business_id);
  return `${branch.branch_name} · ${businessLabel}`;
}

const createCompanySchema = z.object({
  company_name: z.string().min(1, "Company name is required"),
});
type CreateCompanyValues = z.infer<typeof createCompanySchema>;

const createBusinessSchema = z.object({
  company_id: z.string().min(1, "Company is required"),
  business_name: z.string().min(1, "Business name is required"),
});
type CreateBusinessValues = z.infer<typeof createBusinessSchema>;

const createBranchSchema = z.object({
  business_id: z.string().min(1, "Business is required"),
  branch_name: z.string().min(1, "Branch name is required"),
  location: z.string().optional(),
});
type CreateBranchValues = z.infer<typeof createBranchSchema>;

const createUserSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Valid email is required"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    role: z.enum(["owner", "admin", "business_manager", "branch_manager"]),
    company_id: z.string().optional(),
    business_id: z.string().optional(),
    branch_id: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    const companyId = values.company_id?.trim();
    const businessId = values.business_id?.trim();
    const branchId = values.branch_id?.trim();

    if (values.role === "business_manager") {
      if (!businessId) {
        ctx.addIssue({ code: "custom", message: "Business Manager must be assigned to a business", path: ["business_id"] });
      }
    }
    if (values.role === "branch_manager") {
      if (!branchId) {
        ctx.addIssue({ code: "custom", message: "Branch Manager must be assigned to a branch", path: ["branch_id"] });
      }
    }
    if (values.role === "owner" || values.role === "admin") {
      if (companyId || businessId || branchId) {
        ctx.addIssue({ code: "custom", message: "Owner/Admin should not be scoped to company/business/branch", path: ["role"] });
      }
    }
  });
type CreateUserValues = z.infer<typeof createUserSchema>;

const updateScopeSchema = z.object({
  user_id: z.string().min(1, "User is required"),
  company_id: z.string().optional(),
  business_id: z.string().optional(),
  branch_id: z.string().optional(),
});
type UpdateScopeValues = z.infer<typeof updateScopeSchema>;

type ConfirmAction =
  | { type: "business"; business: Business }
  | { type: "branch"; branch: Branch }
  | { type: "user"; user: AuthUser }
  | null;

export function AdminPage() {
  const queryClient = useQueryClient();
  const adminQuery = useAdminData();

  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  const companies = adminQuery.data?.companies ?? EMPTY_COMPANIES;
  const businesses = adminQuery.data?.businesses ?? EMPTY_BUSINESSES;
  const branches = adminQuery.data?.branches ?? EMPTY_BRANCHES;
  const users = adminQuery.data?.users ?? EMPTY_USERS;
  const auditLogs = adminQuery.data?.auditLogs ?? EMPTY_AUDIT_LOGS;

  const companyById = useMemo(() => new Map(companies.map((c) => [c.company_id, c])), [companies]);
  const businessById = useMemo(() => new Map(businesses.map((b) => [b.business_id, b])), [businesses]);
  const branchById = useMemo(() => new Map(branches.map((b) => [b.branch_id, b])), [branches]);

  const hasOwner = useMemo(() => users.some((u) => u.role === "owner"), [users]);

  const createCompanyForm = useForm<CreateCompanyValues>({
    resolver: zodResolver(createCompanySchema),
    defaultValues: { company_name: "" },
  });

  const createBusinessForm = useForm<CreateBusinessValues>({
    resolver: zodResolver(createBusinessSchema),
    defaultValues: { company_id: "", business_name: "" },
  });

  const createBranchForm = useForm<CreateBranchValues>({
    resolver: zodResolver(createBranchSchema),
    defaultValues: { business_id: "", branch_name: "", location: "" },
  });

  const createUserForm = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      role: "branch_manager",
      company_id: "",
      business_id: "",
      branch_id: "",
    },
  });

  const updateScopeForm = useForm<UpdateScopeValues>({
    resolver: zodResolver(updateScopeSchema),
    defaultValues: { user_id: "", company_id: "", business_id: "", branch_id: "" },
  });

  const createCompanyMutation = useMutation({
    mutationFn: async (values: CreateCompanyValues) => {
      return api.post("/companies", { company_name: values.company_name.trim() });
    },
    onSuccess: async () => {
      toast.success("Company created");
      createCompanyForm.reset({ company_name: "" });
      await queryClient.invalidateQueries({ queryKey: ["admin", "data"] });
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to create company")),
  });

  const createBusinessMutation = useMutation({
    mutationFn: async (values: CreateBusinessValues) => {
      return api.post("/businesses", {
        company_id: values.company_id,
        business_name: values.business_name.trim(),
      });
    },
    onSuccess: async () => {
      toast.success("Business created");
      const companyId = createBusinessForm.getValues("company_id");
      createBusinessForm.reset({ company_id: companyId, business_name: "" });
      await queryClient.invalidateQueries({ queryKey: ["admin", "data"] });
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to create business")),
  });

  const createBranchMutation = useMutation({
    mutationFn: async (values: CreateBranchValues) => {
      return api.post("/branches", {
        business_id: values.business_id,
        branch_name: values.branch_name.trim(),
        location: values.location?.trim() ? values.location.trim() : null,
      });
    },
    onSuccess: async () => {
      toast.success("Branch created");
      const businessId = createBranchForm.getValues("business_id");
      createBranchForm.reset({ business_id: businessId, branch_name: "", location: "" });
      await queryClient.invalidateQueries({ queryKey: ["admin", "data"] });
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to create branch")),
  });

  const createUserMutation = useMutation({
    mutationFn: async (values: CreateUserValues) => {
      if (values.role === "owner" && hasOwner) {
        throw new Error("Owner account already exists. Only one owner is allowed.");
      }

      let companyId: string | null = values.company_id?.trim() ? values.company_id.trim() : null;
      let businessId: string | null = values.business_id?.trim() ? values.business_id.trim() : null;
      let branchId: string | null = values.branch_id?.trim() ? values.branch_id.trim() : null;

      if (branchId && !businessId) {
        const branch = branchById.get(branchId);
        if (branch?.business_id) businessId = branch.business_id;
      }
      if (businessId && !companyId) {
        const business = businessById.get(businessId);
        if (business) companyId = business.company_id;
      }

      if (values.role === "business_manager") {
        branchId = null;
      }
      if (values.role === "owner" || values.role === "admin") {
        companyId = null;
        businessId = null;
        branchId = null;
      }

      return api.post("/auth/register", {
        name: values.name.trim(),
        email: values.email.trim(),
        password: values.password,
        role: values.role,
        company_id: companyId,
        business_id: businessId,
        branch_id: branchId,
      });
    },
    onSuccess: async () => {
      toast.success("User created");
      createUserForm.reset({
        name: "",
        email: "",
        password: "",
        role: "branch_manager",
        company_id: "",
        business_id: "",
        branch_id: "",
      });
      await queryClient.invalidateQueries({ queryKey: ["admin", "data"] });
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to create user")),
  });

  const updateScopeMutation = useMutation({
    mutationFn: async (values: UpdateScopeValues) => {
      const companyId = values.company_id?.trim() ? values.company_id.trim() : null;
      const businessId = values.business_id?.trim() ? values.business_id.trim() : null;
      const branchId = values.branch_id?.trim() ? values.branch_id.trim() : null;

      return api.patch(`/users/${values.user_id}/scope`, {
        company_id: companyId,
        business_id: businessId,
        branch_id: branchId,
      });
    },
    onSuccess: async () => {
      toast.success("User scope updated");
      await queryClient.invalidateQueries({ queryKey: ["admin", "data"] });
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to update user scope")),
  });

  const deleteBusinessMutation = useMutation({
    mutationFn: async (businessId: string) => api.delete(`/businesses/${businessId}`),
    onSuccess: async () => {
      toast.success("Business deleted");
      setConfirmAction(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "data"] });
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to delete business")),
  });

  const deleteBranchMutation = useMutation({
    mutationFn: async (branchId: string) => api.delete(`/branches/${branchId}`),
    onSuccess: async () => {
      toast.success("Branch deleted");
      setConfirmAction(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "data"] });
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to delete branch")),
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => api.delete(`/users/${userId}`),
    onSuccess: async () => {
      toast.success("User deleted");
      setConfirmAction(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "data"] });
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to delete user")),
  });

  const exportAuditMutation = useMutation({
    mutationFn: async () => {
      const response = await api.get("/audit-logs/export", { responseType: "blob" });
      return response.data as BlobPart;
    },
    onSuccess: (blobPart) => {
      const blob = new Blob([blobPart], { type: "text/csv" });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = "audit_logs.csv";
      anchor.click();
      URL.revokeObjectURL(href);
      toast.success("Audit logs exported");
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to export audit logs")),
  });

  const busy =
    createCompanyMutation.isPending ||
    createBusinessMutation.isPending ||
    createBranchMutation.isPending ||
    createUserMutation.isPending ||
    updateScopeMutation.isPending ||
    deleteBusinessMutation.isPending ||
    deleteBranchMutation.isPending ||
    deleteUserMutation.isPending ||
    exportAuditMutation.isPending;

  const createUserRole = createUserForm.watch("role");
  const createUserCompanyId = createUserForm.watch("company_id") || "";
  const createUserBusinessId = createUserForm.watch("business_id") || "";

  const visibleBusinessesForUser = useMemo(() => {
    if (!createUserCompanyId) return businesses;
    return businesses.filter((b) => b.company_id === createUserCompanyId);
  }, [businesses, createUserCompanyId]);

  const visibleBranchesForUser = useMemo(() => {
    if (!createUserBusinessId) return branches;
    return branches.filter((b) => b.business_id === createUserBusinessId);
  }, [branches, createUserBusinessId]);

  const scopeCompanyId = updateScopeForm.watch("company_id") || "";
  const scopeBusinessId = updateScopeForm.watch("business_id") || "";

  const visibleBusinessesForScope = useMemo(() => {
    if (!scopeCompanyId) return businesses;
    return businesses.filter((b) => b.company_id === scopeCompanyId);
  }, [businesses, scopeCompanyId]);

  const visibleBranchesForScope = useMemo(() => {
    if (!scopeBusinessId) return branches;
    return branches.filter((b) => b.business_id === scopeBusinessId);
  }, [branches, scopeBusinessId]);

  const selectedScopeUserId = updateScopeForm.watch("user_id") || "";
  const selectedScopeUser = useMemo(
    () => users.find((u) => u.user_id === selectedScopeUserId),
    [selectedScopeUserId, users],
  );

  const onOpenConfirm = (next: ConfirmAction) => setConfirmAction(next);

  const confirmTitle = confirmAction
    ? confirmAction.type === "business"
      ? "Delete business?"
      : confirmAction.type === "branch"
        ? "Delete branch?"
        : "Delete user?"
    : "";
  const confirmDescription = confirmAction
    ? confirmAction.type === "business"
      ? `This will permanently delete "${confirmAction.business.business_name}".`
      : confirmAction.type === "branch"
        ? `This will permanently delete "${confirmAction.branch.branch_name}".`
        : `This will permanently delete "${confirmAction.user.name}" (${confirmAction.user.email}).`
    : "";

  if (adminQuery.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Admin" description="Organization setup and access control." />
        <Card>
          <CardHeader>
            <CardTitle>Loading</CardTitle>
            <CardDescription>Please wait…</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (adminQuery.error) {
    return <ErrorState message="Failed to load admin data." />;
  }

  if (!adminQuery.data) {
    return <EmptyState title="No admin data" description="No admin data is available." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin"
        description="Manage organization structure, users, and audit logs."
        actions={
          <Button
            variant="outline"
            onClick={async () => {
              await queryClient.invalidateQueries({ queryKey: ["admin", "data"] });
            }}
            disabled={busy}
          >
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="space-y-1">
            <CardDescription>Companies</CardDescription>
            <CardTitle className="text-2xl">{companies.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <CardDescription>Businesses</CardDescription>
            <CardTitle className="text-2xl">{businesses.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <CardDescription>Branches</CardDescription>
            <CardTitle className="text-2xl">{branches.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <CardDescription>Users</CardDescription>
            <CardTitle className="text-2xl">{users.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Tabs defaultValue="organization" className="space-y-4">
        <TabsList>
          <TabsTrigger value="organization">Organization</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
          <TabsTrigger value="audit">Audit Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="organization" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Create Company</CardTitle>
                <CardDescription>Top-level organization entity.</CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="space-y-3"
                  onSubmit={createCompanyForm.handleSubmit(async (values) => {
                    await createCompanyMutation.mutateAsync(values);
                  })}
                >
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Company Name</label>
                    <Input placeholder="Acme Holdings" {...createCompanyForm.register("company_name")} disabled={busy} />
                    {createCompanyForm.formState.errors.company_name ? (
                      <p className="text-sm text-destructive">{createCompanyForm.formState.errors.company_name.message}</p>
                    ) : null}
                  </div>
                  <Button type="submit" disabled={busy}>
                    Create Company
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Create Business</CardTitle>
                <CardDescription>Business unit under a company.</CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="space-y-3"
                  onSubmit={createBusinessForm.handleSubmit(async (values) => {
                    await createBusinessMutation.mutateAsync(values);
                  })}
                >
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Company</label>
                    <Select
                      value={createBusinessForm.watch("company_id") || "__none__"}
                      onValueChange={(value) => createBusinessForm.setValue("company_id", value === "__none__" ? "" : value)}
                      disabled={busy}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select company" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Select company</SelectItem>
                        {companies.map((company) => (
                          <SelectItem key={company.company_id} value={company.company_id}>
                            {company.company_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {createBusinessForm.formState.errors.company_id ? (
                      <p className="text-sm text-destructive">{createBusinessForm.formState.errors.company_id.message}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Business Name</label>
                    <Input placeholder="Retail Division" {...createBusinessForm.register("business_name")} disabled={busy} />
                    {createBusinessForm.formState.errors.business_name ? (
                      <p className="text-sm text-destructive">{createBusinessForm.formState.errors.business_name.message}</p>
                    ) : null}
                  </div>

                  <Button type="submit" disabled={busy}>
                    Create Business
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Create Branch</CardTitle>
                <CardDescription>Operational branch under a business.</CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="space-y-3"
                  onSubmit={createBranchForm.handleSubmit(async (values) => {
                    await createBranchMutation.mutateAsync(values);
                  })}
                >
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Business</label>
                    <Select
                      value={createBranchForm.watch("business_id") || "__none__"}
                      onValueChange={(value) => createBranchForm.setValue("business_id", value === "__none__" ? "" : value)}
                      disabled={busy}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select business" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Select business</SelectItem>
                        {businesses.map((business) => (
                          <SelectItem key={business.business_id} value={business.business_id}>
                            {businessOptionLabel(business, companyById)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {createBranchForm.formState.errors.business_id ? (
                      <p className="text-sm text-destructive">{createBranchForm.formState.errors.business_id.message}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Branch Name</label>
                    <Input placeholder="Downtown" {...createBranchForm.register("branch_name")} disabled={busy} />
                    {createBranchForm.formState.errors.branch_name ? (
                      <p className="text-sm text-destructive">{createBranchForm.formState.errors.branch_name.message}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Location</label>
                    <Input placeholder="Singapore" {...createBranchForm.register("location")} disabled={busy} />
                  </div>

                  <Button type="submit" disabled={busy}>
                    Create Branch
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Companies</CardTitle>
                <CardDescription>Registered companies.</CardDescription>
              </CardHeader>
              <CardContent>
                {companies.length === 0 ? (
                  <EmptyState title="No companies yet" description="Create a company to get started." />
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Company ID</TableHead>
                          <TableHead>Name</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {companies.map((company) => (
                          <TableRow key={company.company_id}>
                            <TableCell className="font-mono text-xs">{company.company_id}</TableCell>
                            <TableCell>{company.company_name}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Businesses</CardTitle>
                <CardDescription>Business units.</CardDescription>
              </CardHeader>
              <CardContent>
                {businesses.length === 0 ? (
                  <EmptyState title="No businesses yet" description="Create a business under a company." />
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Business ID</TableHead>
                          <TableHead>Company</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead className="w-20 text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {businesses.map((business) => (
                          <TableRow key={business.business_id}>
                            <TableCell className="font-mono text-xs">{shortId(business.business_id)}</TableCell>
                            <TableCell className="font-mono text-xs">{shortId(business.company_id)}</TableCell>
                            <TableCell>{business.business_name}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onOpenConfirm({ type: "business", business })}
                                disabled={busy}
                                aria-label={`Delete business ${business.business_name}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>Branches</CardTitle>
                <CardDescription>Operational branches.</CardDescription>
              </CardHeader>
              <CardContent>
                {branches.length === 0 ? (
                  <EmptyState title="No branches yet" description="Create a branch under a business." />
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Branch ID</TableHead>
                          <TableHead>Business</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead className="w-20 text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {branches.map((branch) => (
                          <TableRow key={branch.branch_id}>
                            <TableCell className="font-mono text-xs">{shortId(branch.branch_id)}</TableCell>
                            <TableCell className="font-mono text-xs">{shortId(branch.business_id)}</TableCell>
                            <TableCell>{branch.branch_name}</TableCell>
                            <TableCell>{branch.location ?? "-"}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onOpenConfirm({ type: "branch", branch })}
                                disabled={busy}
                                aria-label={`Delete branch ${branch.branch_name}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Create User</CardTitle>
              <CardDescription>Create an admin, business manager, or branch manager account.</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-4 md:grid-cols-2"
                onSubmit={createUserForm.handleSubmit(async (values) => {
                  await createUserMutation.mutateAsync(values);
                })}
              >
                <div className="space-y-2">
                  <label className="text-sm font-medium">Name</label>
                  <Input placeholder="Jane Doe" {...createUserForm.register("name")} disabled={busy} />
                  {createUserForm.formState.errors.name ? (
                    <p className="text-sm text-destructive">{createUserForm.formState.errors.name.message}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Email</label>
                  <Input placeholder="jane@example.com" {...createUserForm.register("email")} disabled={busy} />
                  {createUserForm.formState.errors.email ? (
                    <p className="text-sm text-destructive">{createUserForm.formState.errors.email.message}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Password</label>
                  <Input type="password" placeholder="Min 8 characters" {...createUserForm.register("password")} disabled={busy} />
                  {createUserForm.formState.errors.password ? (
                    <p className="text-sm text-destructive">{createUserForm.formState.errors.password.message}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Role</label>
                  <Select value={createUserForm.watch("role")} onValueChange={(value) => createUserForm.setValue("role", value as UserRole)} disabled={busy}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="owner" disabled={hasOwner}>
                        Owner
                      </SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="business_manager">Business Manager</SelectItem>
                      <SelectItem value="branch_manager">Branch Manager</SelectItem>
                    </SelectContent>
                  </Select>
                  {createUserForm.formState.errors.role ? (
                    <p className="text-sm text-destructive">{createUserForm.formState.errors.role.message}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Company</label>
                  <Select
                    value={createUserForm.watch("company_id") || "__none__"}
                    onValueChange={(value) => createUserForm.setValue("company_id", value === "__none__" ? "" : value)}
                    disabled={busy || createUserRole === "owner" || createUserRole === "admin"}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="(Optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">(Optional)</SelectItem>
                      {companies.map((company) => (
                        <SelectItem key={company.company_id} value={company.company_id}>
                          {company.company_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Business</label>
                  <Select
                    value={createUserForm.watch("business_id") || "__none__"}
                    onValueChange={(value) => createUserForm.setValue("business_id", value === "__none__" ? "" : value)}
                    disabled={busy || createUserRole === "owner" || createUserRole === "admin"}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={createUserRole === "business_manager" ? "Required" : "(Optional)"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">(Optional)</SelectItem>
                      {visibleBusinessesForUser.map((business) => (
                        <SelectItem key={business.business_id} value={business.business_id}>
                          {businessOptionLabel(business, companyById)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {createUserForm.formState.errors.business_id ? (
                    <p className="text-sm text-destructive">{createUserForm.formState.errors.business_id.message}</p>
                  ) : null}
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium">Branch</label>
                  <Select
                    value={createUserForm.watch("branch_id") || "__none__"}
                    onValueChange={(value) => createUserForm.setValue("branch_id", value === "__none__" ? "" : value)}
                    disabled={busy || createUserRole === "owner" || createUserRole === "admin" || createUserRole === "business_manager"}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={createUserRole === "branch_manager" ? "Required" : "(Optional)"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">(Optional)</SelectItem>
                      {visibleBranchesForUser.map((branch) => (
                        <SelectItem key={branch.branch_id} value={branch.branch_id}>
                          {branchOptionLabel(branch, businessById)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {createUserForm.formState.errors.branch_id ? (
                    <p className="text-sm text-destructive">{createUserForm.formState.errors.branch_id.message}</p>
                  ) : null}
                </div>

                <div className="md:col-span-2">
                  <Button type="submit" disabled={busy}>
                    Create User
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Users</CardTitle>
              <CardDescription>Manage existing users.</CardDescription>
            </CardHeader>
            <CardContent>
              {users.length === 0 ? (
                <EmptyState title="No users yet" description="Create a user account." />
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Business</TableHead>
                        <TableHead>Branch</TableHead>
                        <TableHead className="w-20 text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((u) => (
                        <TableRow key={u.user_id}>
                          <TableCell className="font-medium">{u.name}</TableCell>
                          <TableCell className="text-muted-foreground">{u.email}</TableCell>
                          <TableCell>
                            <Badge variant={u.role === "owner" || u.role === "admin" ? "default" : "secondary"}>
                              {roleLabel(u.role)}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{shortId(u.company_id)}</TableCell>
                          <TableCell className="font-mono text-xs">{shortId(u.business_id)}</TableCell>
                          <TableCell className="font-mono text-xs">{shortId(u.branch_id)}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => onOpenConfirm({ type: "user", user: u })}
                              disabled={busy || u.role === "owner"}
                              aria-label={`Delete user ${u.name}`}
                              title={u.role === "owner" ? "Owner user cannot be deleted here" : "Delete"}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="permissions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Assign User Scope</CardTitle>
              <CardDescription>Control which company/business/branch a user can access.</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-4 md:grid-cols-2"
                onSubmit={updateScopeForm.handleSubmit(async (values) => {
                  await updateScopeMutation.mutateAsync(values);
                })}
              >
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium">User</label>
                  <Select
                    value={updateScopeForm.watch("user_id") || "__none__"}
                    onValueChange={(value) => {
                      const nextUserId = value === "__none__" ? "" : value;
                      updateScopeForm.setValue("user_id", nextUserId);
                      const nextUser = users.find((u) => u.user_id === nextUserId);
                      updateScopeForm.setValue("company_id", nextUser?.company_id ?? "");
                      updateScopeForm.setValue("business_id", nextUser?.business_id ?? "");
                      updateScopeForm.setValue("branch_id", nextUser?.branch_id ?? "");
                    }}
                    disabled={busy}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select user" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Select user</SelectItem>
                      {users.map((u) => (
                        <SelectItem key={u.user_id} value={u.user_id}>
                          {`${u.name} (${roleLabel(u.role)})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {updateScopeForm.formState.errors.user_id ? (
                    <p className="text-sm text-destructive">{updateScopeForm.formState.errors.user_id.message}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Company</label>
                  <Select
                    value={updateScopeForm.watch("company_id") || "__none__"}
                    onValueChange={(value) => {
                      updateScopeForm.setValue("company_id", value === "__none__" ? "" : value);
                      updateScopeForm.setValue("business_id", "");
                      updateScopeForm.setValue("branch_id", "");
                    }}
                    disabled={busy}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="No company" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No company</SelectItem>
                      {companies.map((company) => (
                        <SelectItem key={company.company_id} value={company.company_id}>
                          {company.company_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Business</label>
                  <Select
                    value={updateScopeForm.watch("business_id") || "__none__"}
                    onValueChange={(value) => {
                      updateScopeForm.setValue("business_id", value === "__none__" ? "" : value);
                      updateScopeForm.setValue("branch_id", "");
                    }}
                    disabled={busy}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="No business" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No business</SelectItem>
                      {visibleBusinessesForScope.map((business) => (
                        <SelectItem key={business.business_id} value={business.business_id}>
                          {businessOptionLabel(business, companyById)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium">Branch</label>
                  <Select
                    value={updateScopeForm.watch("branch_id") || "__none__"}
                    onValueChange={(value) => updateScopeForm.setValue("branch_id", value === "__none__" ? "" : value)}
                    disabled={busy}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="No branch" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No branch</SelectItem>
                      {visibleBranchesForScope.map((branch) => (
                        <SelectItem key={branch.branch_id} value={branch.branch_id}>
                          {branchOptionLabel(branch, businessById)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="md:col-span-2 flex items-center gap-3">
                  <Button type="submit" disabled={busy}>
                    Update Scope
                  </Button>
                  {selectedScopeUser ? (
                    <div className="text-sm text-muted-foreground">
                      Current: {shortId(selectedScopeUser.company_id)} / {shortId(selectedScopeUser.business_id)} / {shortId(selectedScopeUser.branch_id)}
                    </div>
                  ) : null}
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div className="space-y-1">
                <CardTitle>Audit Logs</CardTitle>
                <CardDescription>Actions recorded by the system.</CardDescription>
              </div>
              <Button variant="outline" onClick={async () => exportAuditMutation.mutateAsync()} disabled={busy}>
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              {auditLogs.length === 0 ? (
                <EmptyState title="No audit logs yet" description="Audit logs will appear as actions occur." />
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Entity</TableHead>
                        <TableHead>User</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditLogs.map((log) => (
                        <TableRow key={log.audit_id}>
                          <TableCell>{formatDate(log.timestamp)}</TableCell>
                          <TableCell>{log.action}</TableCell>
                          <TableCell>{log.entity}</TableCell>
                          <TableCell className="font-mono text-xs">{shortId(log.user_id)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={confirmAction !== null} onOpenChange={(open) => (!open ? setConfirmAction(null) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmTitle}</DialogTitle>
            <DialogDescription>{confirmDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAction(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!confirmAction) return;
                if (confirmAction.type === "business") {
                  await deleteBusinessMutation.mutateAsync(confirmAction.business.business_id);
                } else if (confirmAction.type === "branch") {
                  await deleteBranchMutation.mutateAsync(confirmAction.branch.branch_id);
                } else {
                  await deleteUserMutation.mutateAsync(confirmAction.user.user_id);
                }
              }}
              disabled={busy}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
