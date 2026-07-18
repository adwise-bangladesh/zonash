export function formatBDT(n: number | string | undefined | null): string {
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (num == null || Number.isNaN(num)) return "৳0";
  return `৳${new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(num)}`;
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
