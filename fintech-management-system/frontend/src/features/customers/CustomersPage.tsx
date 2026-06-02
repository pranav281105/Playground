import { FormEvent, useEffect, useMemo, useState } from "react";

import { useAuth } from "../auth/AuthContext";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/apiError";
import type { Branch, Customer } from "../../lib/types";

type CustomerFilter = "all" | "active" | "inactive";

function getBranchOptionLabel(branch: Branch): string {
  return `${branch.branch_name} (${branch.branch_id.slice(0, 8)})`;
}

export function CustomersPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "owner";
  const branchLabel = user?.branch_id ?? "Unassigned";

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CustomerFilter>("all");
  const [busyCustomerId, setBusyCustomerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadCustomers = () => {
    api
      .get<Customer[]>("/customers")
      .then((response) => setCustomers(response.data))
      .catch((requestError: unknown) => setError(getApiErrorMessage(requestError, "Failed to load customers")));
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }
    api
      .get<Branch[]>("/branches")
      .then((response) => {
        setBranches(response.data);
        if (!branchId && response.data.length > 0) {
          setBranchId(response.data[0].branch_id);
        }
      })
      .catch((requestError: unknown) => setError(getApiErrorMessage(requestError, "Failed to load branches")));
  }, [isAdmin, branchId]);

  const filteredCustomers = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return customers.filter((customer) => {
      if (filter !== "all" && customer.status !== filter) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      return [customer.customer_name, customer.contact_person ?? "", customer.email ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [customers, filter, search]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (isAdmin && !branchId) {
      setError("Select a branch for customer creation.");
      return;
    }

    try {
      await api.post(
        "/customers",
        {
          customer_name: customerName,
          contact_person: contactPerson || undefined,
          email: email || undefined,
        },
        isAdmin ? { params: { branch_id: branchId } } : undefined,
      );
      setCustomerName("");
      setContactPerson("");
      setEmail("");
      setSuccess("Customer saved.");
      loadCustomers();
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError, "Failed to create customer"));
    }
  };

  const toggleStatus = async (customer: Customer) => {
    setBusyCustomerId(customer.customer_id);
    setError(null);
    setSuccess(null);

    const nextStatus = customer.status === "active" ? "inactive" : "active";

    try {
      await api.put(`/customers/${customer.customer_id}`, { status: nextStatus });
      setSuccess(`Customer set to ${nextStatus}.`);
      loadCustomers();
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError, "Failed to update customer status"));
    } finally {
      setBusyCustomerId(null);
    }
  };

  const deleteCustomer = async (customer: Customer) => {
    const confirmed = window.confirm(`Delete customer "${customer.customer_name}"?`);
    if (!confirmed) {
      return;
    }

    setBusyCustomerId(customer.customer_id);
    setError(null);
    setSuccess(null);

    try {
      await api.delete(`/customers/${customer.customer_id}`);
      setSuccess("Customer deleted.");
      loadCustomers();
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError, "Failed to delete customer"));
    } finally {
      setBusyCustomerId(null);
    }
  };

  return (
    <div className="stack">
      <div className="pg-head">
        <div>
          <div className="pg-title">Customers</div>
          <div className="pg-meta">{`Branch ID: ${branchLabel} · Phase 1 financial operations console.`}</div>
        </div>
      </div>

      <section className="card">
        <div className="card-hd">
          <div>
            <div className="card-title">Add Customer</div>
            <div className="card-desc">Register a new customer to the directory</div>
          </div>
        </div>
        <div className="card-body">
          <form className="inline-form" onSubmit={onSubmit}>
            {isAdmin ? (
              <select value={branchId} onChange={(event) => setBranchId(event.target.value)} required>
                <option value="">Select Branch</option>
                {branches.map((branch) => (
                  <option key={branch.branch_id} value={branch.branch_id}>
                    {getBranchOptionLabel(branch)}
                  </option>
                ))}
              </select>
            ) : null}
            <input placeholder="Customer Name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} required />
            <input placeholder="Contact Person" value={contactPerson} onChange={(event) => setContactPerson(event.target.value)} />
            <input placeholder="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            <button type="submit">Save</button>
          </form>
          {error ? <p className="error">{error}</p> : null}
          {success ? <p>{success}</p> : null}
        </div>
      </section>

      <section className="card">
        <div className="toolbar">
          <div className="search-wrap">
            <input
              className="search-inp"
              type="text"
              placeholder="Search by name, email..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="filter-btns">
            <button type="button" className={filter === "all" ? "filter-btn on" : "filter-btn"} onClick={() => setFilter("all")}>All</button>
            <button type="button" className={filter === "active" ? "filter-btn on" : "filter-btn"} onClick={() => setFilter("active")}>Active</button>
            <button type="button" className={filter === "inactive" ? "filter-btn on" : "filter-btn"} onClick={() => setFilter("inactive")}>Inactive</button>
          </div>
          <div className="toolbar-meta">{`${filteredCustomers.length} customers`}</div>
        </div>

        <div className="card-hd card-hd-muted">
          <div className="card-title">Customer Directory</div>
        </div>

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact</th>
                <th>Email</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((customer) => {
                const isBusy = busyCustomerId === customer.customer_id;
                const isActive = customer.status === "active";

                return (
                  <tr key={customer.customer_id}>
                    <td>{customer.customer_name}</td>
                    <td>{customer.contact_person ?? "-"}</td>
                    <td>{customer.email ?? "-"}</td>
                    <td>
                      <span className={isActive ? "pill pill-green" : "pill pill-gray"}>{customer.status}</span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="btn-row" onClick={() => void toggleStatus(customer)} disabled={isBusy}>
                          {isActive ? "Set Inactive" : "Set Active"}
                        </button>
                        <button type="button" className="btn-row danger" onClick={() => void deleteCustomer(customer)} disabled={isBusy}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={5}>No customers match your search.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
