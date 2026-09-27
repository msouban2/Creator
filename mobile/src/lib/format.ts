export function formatCurrency(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
}

export function compactNumber(n: number | null | undefined): string {
  const value = Number(n ?? 0);
  if (value >= 1000) {
    return (value / 1000).toFixed(value % 1000 === 0 ? 0 : 1) + "K";
  }
  return String(value);
}

export function initials(name: string | null | undefined): string {
  if (!name) return "AA";
  return name
    .split(" ")
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
}
