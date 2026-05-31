import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/apiError";
import { formatDate } from "../../lib/format";
import type { AuditLog, AuthUser, Branch, Business, Company, UserRole } from "../../lib/types";

function shortId(value: string | null): string {
  if (!value) {
    return "-";
  }
  return value.slice(0, 8);
}

function roleLabel(role: UserRole): string {
  if (role === "owner") {
    return "Owner";
  }
  if (role === "admin") {
    return "Admin";
  }
  if (role === "business_manager") {
    return "Business Manager";
  }
  return "Branch Manager";
}

export function AdminPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const [companyName, setCompanyName] = useState("");
  const [businessCompanyId, setBusinessCompanyId] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [branchBusinessId, setBranchBusinessId] = useState("");
  const [branchName, setBranchName] = useState("");
  const [branchLocation, setBranchLocation] = useState("");

  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userRole, setUserRole] = useState<UserRole>("branch_manager");
  const [userCompanyId, setUserCompanyId] = useState("");
  const [userBusinessId, setUserBusinessId] = useState("");
  const [userBranchId, setUserBranchId] = useState("");

  const [scopeUserId, setScopeUserId] = useState("");
  const [scopeCompanyId, setScopeCompanyId] = useState("");
  const [scopeBusinessId, setScopeBusinessId] = useState("");
  const [scopeBranchId, setScopeBranchId] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const businessById = useMemo(() => new Map(businesses.map((item) => [item.business_id, item])), [businesses]);
  const branchById = useMemo(() => new Map(branches.map((item) => [item.branch_id, item])), [branches]);
  const hasOwner = useMemo(() => users.some((user) => user.role === "owner"), [users]);

  const loadAdminData = useCallback(async () => {
    const [companyResponse, businessResponse, branchResponse, userResponse, auditResponse] = await Promise.all([
      api.get<Company[]>("/companies"),
      api.get<Business[]>("/businesses"),
      api.get<Branch[]>("/branches"),
      api.get<AuthUser[]>("/users"),
      api.get<AuditLog[]>("/audit-logs"),
    ]);

    setCompanies(companyResponse.data);
    setBusinesses(businessResponse.data);
    setBranches(branchResponse.data);
    setUsers(userResponse.data);
    setAuditLogs(auditResponse.data);
  }, []);

  useEffect(() => {
    void loadAdminData().catch((requestError: unknown) =>
      setError(getApiErrorMessage(requestError, "Failed to load admin data")),
    );
  }, [loadAdminData]);

  useEffect(() => {
    if (!businessCompanyId && companies.length > 0) {
      setBusinessCompanyId(companies[0].company_id);
    }
  }, [businessCompanyId, companies]);

  useEffect(() => {
    if (!branchBusinessId && businesses.length > 0) {
      setBranchBusinessId(businesses[0].business_id);
    }
  }, [branchBusinessId, businesses]);

  useEffect(() => {
    if (!scopeUserId && users.length > 0) {
      setScopeUserId(users[0].user_id);
    }
  }, [scopeUserId, users]);

  useEffect(() => {
    const selectedUser = users.find((item) => item.user_id === scopeUserId);
    if (!selectedUser) {
      return;
    }
    setScopeCompanyId(selectedUser.company_id ?? "");
    setScopeBusinessId(selectedUser.business_id ?? "");
    setScopeBranchId(selectedUser.branch_id ?? "");
  }, [scopeUserId, users]);

  const userVisibleBusinesses = useMemo(
    () => (userCompanyId ? businesses.filter((item) => item.company_id === userCompanyId) : businesses),
    [businesses, userCompanyId],
  );
  const userVisibleBranches = useMemo(
    () => (userBusinessId ? branches.filter((item) => item.business_id === userBusinessId) : branches),
    [branches, userBusinessId],
  );

  const scopeVisibleBusinesses = useMemo(
    () => (scopeCompanyId ? businesses.filter((item) => item.company_id === scopeCompanyId) : businesses),
    [businesses, scopeCompanyId],
  );
  const scopeVisibleBranches = useMemo(
    () => (scopeBusinessId ? branches.filter((item) => item.business_id === scopeBusinessId) : branches),
    [branches, scopeBusinessId],
  );

  const createCompany = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!companyName.trim()) {
      setError("Company name is required");
      return;
    }

    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      await api.post("/companies", { company_name: companyName.trim() });
      setCompanyName("");
      await loadAdminData();
      setSuccess("Company created.");
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError, "Failed to create company"));
    } finally {
      setSaving(false);
    }
  };

  const createBusiness = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!businessCompanyId) {
      setError("Select a company first");
      return;
    }
    if (!businessName.trim()) {
      setError("Business name is required");
      return;
    }

    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      await api.post("/businesses", {
        company_id: businessCompanyId,
        business_name: businessName.trim(),
      });
      setBusinessName("");
      await loadAdminData();
      setSuccess("Business created.");
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError, "Failed to create business"));
    } finally {
      setSaving(false);
    }
  };

  const createBranch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!branchBusinessId) {
      setError("Select a business first");
      return;
    }
    if (!branchName.trim()) {
      setError("Branch name is required");
      return;
    }

    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      await api.post("/branches", {
        business_id: branchBusinessId,
        branch_name: branchName.trim(),
        location: branchLocation.trim() || null,
      });
      setBranchName("");
      setBranchLocation("");
      await loadAdminData();
      setSuccess("Branch created.");
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError, "Failed to create branch"));
    } finally {
      setSaving(false);
    }
  };

  const createUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userName.trim() || !userEmail.trim() || !userPassword.trim()) {
      setError("Name, email, and password are required");
      return;
    }
    if (userRole === "owner" && hasOwner) {
      setError("Owner account already exists. Only one owner is allowed.");
      return;
    }

    let companyId: string | null = userCompanyId || null;
    let businessId: string | null = userBusinessId || null;
    let branchId: string | null = userBranchId || null;

    if (branchId) {
      const branch = branchById.get(branchId);
      if (branch?.business_id) {
        businessId = businessId ?? branch.business_id;
      }
    }
    if (businessId) {
      const business = businessById.get(businessId);
      if (business) {
        companyId = companyId ?? business.company_id;
      }
    }

    if (userRole === "business_manager") {
      branchId = null;
      if (!businessId) {
        setError("Business manager must be assigned to a business");
        return;
      }
    }
    if (userRole === "branch_manager" && !branchId) {
      setError("Branch manager must be assigned to a branch");
      return;
    }
    if (userRole === "owner" || userRole === "admin") {
      businessId = null;
      branchId = null;
    }

    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      await api.post("/auth/register", {
        name: userName.trim(),
        email: userEmail.trim(),
        password: userPassword,
        role: userRole,
        company_id: companyId,
        business_id: businessId,
        branch_id: branchId,
      });
      setUserName("");
      setUserEmail("");
      setUserPassword("");
      setUserRole("branch_manager");
      setUserCompanyId("");
      setUserBusinessId("");
      setUserBranchId("");
      await loadAdminData();
      setSuccess("User created.");
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError, "Failed to create user"));
    } finally {
      setSaving(false);
    }
  };

  const updateUserScope = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!scopeUserId) {
      setError("Select a user first");
      return;
    }

    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      await api.patch(`/users/${scopeUserId}/scope`, {
        company_id: scopeCompanyId || null,
        business_id: scopeBusinessId || null,
        branch_id: scopeBranchId || null,
      });
      await loadAdminData();
      setSuccess("User scope updated.");
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError, "Failed to update user scope"));
    } finally {
      setSaving(false);
    }
  };

  const exportAudit = async () => {
    setError(null);
    try {
      const response = await api.get("/audit-logs/export", { responseType: "blob" });
      const blob = new Blob([response.data], { type: "text/csv" });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = "audit_logs.csv";
      anchor.click();
      URL.revokeObjectURL(href);
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError, "Failed to export audit logs"));
    }
  };

  const deleteBusiness = async (business: Business) => {
    const confirmed = window.confirm(`Delete business "${business.business_name}"?`);
    if (!confirmed) {
      return;
    }
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      await api.delete(`/businesses/${business.business_id}`);
      await loadAdminData();
      setSuccess("Business deleted.");
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError, "Failed to delete business"));
    } finally {
      setSaving(false);
    }
  };

  const deleteBranch = async (branch: Branch) => {
    const confirmed = window.confirm(`Delete branch "${branch.branch_name}"?`);
    if (!confirmed) {
      return;
    }
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      await api.delete(`/branches/${branch.branch_id}`);
      await loadAdminData();
      setSuccess("Branch deleted.");
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError, "Failed to delete branch"));
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = async (user: AuthUser) => {
    const confirmed = window.confirm(`Delete user "${user.name}" (${user.email})?`);
    if (!confirmed) {
      return;
    }
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      await api.delete(`/users/${user.user_id}`);
      await loadAdminData();
      setSuccess("User deleted.");
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError, "Failed to delete user"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack">
      {error ? <div className="sheet error">{error}</div> : null}
      {success ? <div className="sheet">{success}</div> : null}

      <section className="sheet outline">
        <h3>Organization Setup</h3>
        <form className="inline-form" onSubmit={(event) => void createCompany(event)}>
          <input
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
            placeholder="Company Name"
            disabled={saving}
          />
          <button type="submit" disabled={saving}>Create Company</button>
        </form>
        <form className="inline-form" onSubmit={(event) => void createBusiness(event)}>
          <select
            value={businessCompanyId}
            onChange={(event) => setBusinessCompanyId(event.target.value)}
            disabled={saving}
          >
            <option value="">Select company</option>
            {companies.map((company) => (
              <option key={company.company_id} value={company.company_id}>{company.company_name}</option>
            ))}
          </select>
          <input
            value={businessName}
            onChange={(event) => setBusinessName(event.target.value)}
            placeholder="Business Name"
            disabled={saving}
          />
          <button type="submit" disabled={saving}>Create Business</button>
        </form>
        <form className="inline-form" onSubmit={(event) => void createBranch(event)}>
          <select
            value={branchBusinessId}
            onChange={(event) => setBranchBusinessId(event.target.value)}
            disabled={saving}
          >
            <option value="">Select business</option>
            {businesses.map((business) => (
              <option key={business.business_id} value={business.business_id}>{business.business_name}</option>
            ))}
          </select>
          <input
            value={branchName}
            onChange={(event) => setBranchName(event.target.value)}
            placeholder="Branch Name"
            disabled={saving}
          />
          <input
            value={branchLocation}
            onChange={(event) => setBranchLocation(event.target.value)}
            placeholder="Location"
            disabled={saving}
          />
          <button type="submit" disabled={saving}>Create Branch</button>
        </form>
      </section>

      <section className="sheet outline">
        <h3>Create User</h3>
        <form className="inline-form" onSubmit={(event) => void createUser(event)}>
          <input value={userName} onChange={(event) => setUserName(event.target.value)} placeholder="Name" disabled={saving} />
          <input value={userEmail} onChange={(event) => setUserEmail(event.target.value)} placeholder="Email" disabled={saving} />
          <input
            value={userPassword}
            onChange={(event) => setUserPassword(event.target.value)}
            placeholder="Password (min 8 chars)"
            type="password"
            disabled={saving}
          />
          <select value={userRole} onChange={(event) => setUserRole(event.target.value as UserRole)} disabled={saving}>
            <option value="owner" disabled={hasOwner}>Owner</option>
            <option value="admin">Admin</option>
            <option value="business_manager">Business Manager</option>
            <option value="branch_manager">Branch Manager</option>
          </select>
          <select value={userCompanyId} onChange={(event) => setUserCompanyId(event.target.value)} disabled={saving}>
            <option value="">Company (optional)</option>
            {companies.map((company) => (
              <option key={company.company_id} value={company.company_id}>{company.company_name}</option>
            ))}
          </select>
          <select value={userBusinessId} onChange={(event) => setUserBusinessId(event.target.value)} disabled={saving}>
            <option value="">Business (optional)</option>
            {userVisibleBusinesses.map((business) => (
              <option key={business.business_id} value={business.business_id}>{business.business_name}</option>
            ))}
          </select>
          <select value={userBranchId} onChange={(event) => setUserBranchId(event.target.value)} disabled={saving}>
            <option value="">Branch (optional)</option>
            {userVisibleBranches.map((branch) => (
              <option key={branch.branch_id} value={branch.branch_id}>{branch.branch_name}</option>
            ))}
          </select>
          <button type="submit" disabled={saving}>Create User</button>
        </form>
      </section>

      <section className="sheet outline">
        <h3>Assign User Scope</h3>
        <form className="inline-form" onSubmit={(event) => void updateUserScope(event)}>
          <select value={scopeUserId} onChange={(event) => setScopeUserId(event.target.value)} disabled={saving}>
            <option value="">Select user</option>
            {users.map((user) => (
              <option key={user.user_id} value={user.user_id}>
                {`${user.name} (${roleLabel(user.role)})`}
              </option>
            ))}
          </select>
          <select value={scopeCompanyId} onChange={(event) => setScopeCompanyId(event.target.value)} disabled={saving}>
            <option value="">No company</option>
            {companies.map((company) => (
              <option key={company.company_id} value={company.company_id}>{company.company_name}</option>
            ))}
          </select>
          <select value={scopeBusinessId} onChange={(event) => setScopeBusinessId(event.target.value)} disabled={saving}>
            <option value="">No business</option>
            {scopeVisibleBusinesses.map((business) => (
              <option key={business.business_id} value={business.business_id}>{business.business_name}</option>
            ))}
          </select>
          <select value={scopeBranchId} onChange={(event) => setScopeBranchId(event.target.value)} disabled={saving}>
            <option value="">No branch</option>
            {scopeVisibleBranches.map((branch) => (
              <option key={branch.branch_id} value={branch.branch_id}>{branch.branch_name}</option>
            ))}
          </select>
          <button type="submit" disabled={saving}>Update Scope</button>
        </form>
      </section>

      <section className="sheet outline">
        <h3>Companies</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Company ID</th>
              <th>Name</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => (
              <tr key={company.company_id}>
                <td><code>{company.company_id}</code></td>
                <td>{company.company_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="sheet outline">
        <h3>Businesses</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Business ID</th>
              <th>Company ID</th>
              <th>Name</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {businesses.map((business) => (
              <tr key={business.business_id}>
                <td><code>{business.business_id}</code></td>
                <td><code>{business.company_id}</code></td>
                <td>{business.business_name}</td>
                <td>
                  <button
                    type="button"
                    className="btn-row danger"
                    onClick={() => void deleteBusiness(business)}
                    disabled={saving}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="sheet outline">
        <h3>Branches</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Branch ID</th>
              <th>Business ID</th>
              <th>Name</th>
              <th>Location</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((branch) => (
              <tr key={branch.branch_id}>
                <td><code>{branch.branch_id}</code></td>
                <td><code>{branch.business_id ?? "-"}</code></td>
                <td>{branch.branch_name}</td>
                <td>{branch.location ?? "-"}</td>
                <td>
                  <button
                    type="button"
                    className="btn-row danger"
                    onClick={() => void deleteBranch(branch)}
                    disabled={saving}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="sheet outline">
        <h3>Users</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Role</th>
              <th>Company</th>
              <th>Business</th>
              <th>Branch</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.user_id}>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>{roleLabel(user.role)}</td>
                <td>{shortId(user.company_id)}</td>
                <td>{shortId(user.business_id)}</td>
                <td>{shortId(user.branch_id)}</td>
                <td>
                  <button
                    type="button"
                    className="btn-row danger"
                    onClick={() => void deleteUser(user)}
                    disabled={saving}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="sheet outline">
        <h3>Audit Logs</h3>
        <button className="btn-export" onClick={() => void exportAudit()}>Export CSV</button>
        <table className="data-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Action</th>
              <th>Entity</th>
              <th>User</th>
            </tr>
          </thead>
          <tbody>
            {auditLogs.map((log) => (
              <tr key={log.audit_id}>
                <td>{formatDate(log.timestamp)}</td>
                <td>{log.action}</td>
                <td>{log.entity}</td>
                <td>{log.user_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
