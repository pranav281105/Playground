export function formatCurrency(value: string | number): string {
  const parsed = typeof value === "number" ? value : Number(value);
  const safe = Number.isFinite(parsed) ? parsed : 0;
  return `S$ ${safe.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("en-GB");
}
