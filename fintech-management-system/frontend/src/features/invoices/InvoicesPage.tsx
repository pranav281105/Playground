import { useEffect, useState } from "react";

import { api } from "../../lib/api";
import { Invoice } from "../../lib/types";

export function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Invoice[]>("/invoices")
      .then((response) => setInvoices(response.data))
      .catch(() => setError("Failed to load invoices"));
  }, []);

  if (error) {
    return <div className="card">{error}</div>;
  }

  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th>Invoice #</th>
            <th>Date</th>
            <th>Sales</th>
            <th>GP</th>
            <th>COGS</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            <tr key={invoice.invoice_id}>
              <td>{invoice.invoice_number}</td>
              <td>{invoice.invoice_date}</td>
              <td>S$ {invoice.sales_amount}</td>
              <td>S$ {invoice.gross_profit}</td>
              <td>S$ {invoice.cogs}</td>
              <td>{invoice.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
