import { FormEvent, useEffect, useMemo, useState } from "react";

import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/apiError";
import type { Vendor } from "../../lib/types";

type VendorFilter = "all" | "active" | "inactive";

export function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorName, setVendorName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<VendorFilter>("all");
  const [busyVendorId, setBusyVendorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadVendors = () => {
    api
      .get<Vendor[]>("/vendors")
      .then((response) => setVendors(response.data))
      .catch((requestError: unknown) => setError(getApiErrorMessage(requestError, "Failed to load vendors")));
  };

  useEffect(() => {
    loadVendors();
  }, []);

  const filteredVendors = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return vendors.filter((vendor) => {
      if (filter !== "all" && vendor.status !== filter) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      return [vendor.vendor_id, vendor.vendor_name, vendor.contact_person ?? "", vendor.email ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [vendors, filter, search]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      await api.post("/vendors", {
        vendor_name: vendorName,
        contact_person: contactPerson || undefined,
        email: email || undefined,
      });
      setVendorName("");
      setContactPerson("");
      setEmail("");
      setSuccess("Vendor saved.");
      loadVendors();
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError, "Failed to create vendor"));
    }
  };

  const toggleStatus = async (vendor: Vendor) => {
    setBusyVendorId(vendor.vendor_id);
    setError(null);
    setSuccess(null);

    const nextStatus = vendor.status === "active" ? "inactive" : "active";

    try {
      await api.put(`/vendors/${vendor.vendor_id}`, { status: nextStatus });
      setSuccess(`Vendor set to ${nextStatus}.`);
      loadVendors();
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError, "Failed to update vendor status"));
    } finally {
      setBusyVendorId(null);
    }
  };

  return (
    <div className="stack">
      <div className="pg-head">
        <div>
          <div className="pg-title">Vendors</div>
          <div className="pg-meta">Manage vendor directory and status controls.</div>
        </div>
      </div>

      <section className="card">
        <div className="card-hd">
          <div>
            <div className="card-title">Add Vendor</div>
            <div className="card-desc">Register a new vendor to the directory</div>
          </div>
        </div>
        <div className="card-body">
          <form className="inline-form" onSubmit={onSubmit}>
            <input placeholder="Vendor Name" value={vendorName} onChange={(event) => setVendorName(event.target.value)} required />
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
              placeholder="Search by name, email, vendor ID..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="filter-btns">
            <button type="button" className={filter === "all" ? "filter-btn on" : "filter-btn"} onClick={() => setFilter("all")}>All</button>
            <button type="button" className={filter === "active" ? "filter-btn on" : "filter-btn"} onClick={() => setFilter("active")}>Active</button>
            <button type="button" className={filter === "inactive" ? "filter-btn on" : "filter-btn"} onClick={() => setFilter("inactive")}>Inactive</button>
          </div>
          <div className="toolbar-meta">{`${filteredVendors.length} vendors`}</div>
        </div>

        <div className="card-hd card-hd-muted">
          <div className="card-title">Vendor Directory</div>
        </div>

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Vendor ID</th>
                <th>Name</th>
                <th>Contact</th>
                <th>Email</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredVendors.map((vendor) => {
                const isBusy = busyVendorId === vendor.vendor_id;
                const isActive = vendor.status === "active";

                return (
                  <tr key={vendor.vendor_id}>
                    <td>{vendor.vendor_id}</td>
                    <td>{vendor.vendor_name}</td>
                    <td>{vendor.contact_person ?? "-"}</td>
                    <td>{vendor.email ?? "-"}</td>
                    <td>
                      <span className={isActive ? "pill pill-green" : "pill pill-gray"}>{vendor.status}</span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="btn-row" onClick={() => void toggleStatus(vendor)} disabled={isBusy}>
                          {isActive ? "Set Inactive" : "Set Active"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredVendors.length === 0 ? (
                <tr>
                  <td colSpan={6}>No vendors match your search.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
