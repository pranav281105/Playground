import { FormEvent, useEffect, useState } from "react";

import { useAuth } from "../auth/AuthContext";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/apiError";
import type { Branch, Customer } from "../../lib/types";

function getBranchOptionLabel(branch: Branch): string {
  return `${branch.branch_name} (${branch.branch_id.slice(0, 8)})`;
}

export function CustomersPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

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
  }, [isAdmin]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

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
      loadCustomers();
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError, "Failed to create customer"));
    }
  };

  return (
    <div className="stack">
      <section className="card">
        <h3>Add Customer</h3>
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
      </section>

      <section className="card">
        <h3>Customer Directory</h3>
        {error ? <p className="error">{error}</p> : null}
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact</th>
              <th>Email</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.customer_id}>
                <td>{customer.customer_name}</td>
                <td>{customer.contact_person ?? "-"}</td>
                <td>{customer.email ?? "-"}</td>
                <td>{customer.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
