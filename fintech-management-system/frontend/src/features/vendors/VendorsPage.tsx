import { FormEvent, useEffect, useState } from "react";

import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/apiError";
import type { Vendor } from "../../lib/types";

export function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorName, setVendorName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadVendors = () => {
    api
      .get<Vendor[]>("/vendors")
      .then((response) => setVendors(response.data))
      .catch((requestError: unknown) => setError(getApiErrorMessage(requestError, "Failed to load vendors")));
  };

  useEffect(() => {
    loadVendors();
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    try {
      await api.post("/vendors", {
        vendor_name: vendorName,
        contact_person: contactPerson || undefined,
        email: email || undefined,
      });
      setVendorName("");
      setContactPerson("");
      setEmail("");
      loadVendors();
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError, "Failed to create vendor"));
    }
  };

  return (
    <div className="stack">
      <section className="card">
        <h3>Add Vendor</h3>
        <form className="inline-form" onSubmit={onSubmit}>
          <input placeholder="Vendor Name" value={vendorName} onChange={(event) => setVendorName(event.target.value)} required />
          <input placeholder="Contact Person" value={contactPerson} onChange={(event) => setContactPerson(event.target.value)} />
          <input placeholder="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          <button type="submit">Save</button>
        </form>
      </section>

      <section className="card">
        <h3>Vendor Directory</h3>
        {error ? <p className="error">{error}</p> : null}
        <table className="data-table">
          <thead>
            <tr>
              <th>Vendor ID</th>
              <th>Name</th>
              <th>Contact</th>
              <th>Email</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {vendors.map((vendor) => (
              <tr key={vendor.vendor_id}>
                <td>{vendor.vendor_id}</td>
                <td>{vendor.vendor_name}</td>
                <td>{vendor.contact_person ?? "-"}</td>
                <td>{vendor.email ?? "-"}</td>
                <td>{vendor.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
