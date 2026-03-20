import { useEffect, useState } from "react";

import { api } from "../../lib/api";
import { formatDate } from "../../lib/format";
import type { AuditLog, Branch } from "../../lib/types";

export function AdminPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.get<Branch[]>("/branches"), api.get<AuditLog[]>("/audit-logs")])
      .then(([branchResponse, auditResponse]) => {
        setBranches(branchResponse.data);
        setAuditLogs(auditResponse.data);
      })
      .catch(() => setError("Failed to load admin data"));
  }, []);

  const exportAudit = async () => {
    const response = await api.get("/audit-logs/export", { responseType: "blob" });
    const blob = new Blob([response.data], { type: "text/csv" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "audit_logs.csv";
    anchor.click();
    URL.revokeObjectURL(href);
  };

  return (
    <div className="stack">
      {error ? <div className="card error">{error}</div> : null}

      <section className="card">
        <h3>Branches</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Branch ID</th>
              <th>Name</th>
              <th>Location</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((branch) => (
              <tr key={branch.branch_id}>
                <td>
                  <code>{branch.branch_id}</code>
                </td>
                <td>{branch.branch_name}</td>
                <td>{branch.location ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h3>Audit Logs</h3>
        <button onClick={() => void exportAudit()}>Export CSV</button>
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
