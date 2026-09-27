import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | null | undefined): string {
  return "₹" + Number(value ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Human-friendly reference for an order/review, built from its permanent unique
 * ref number (see migration 0055). e.g. LRMS-10042-REV / LRMS-10042-SHIP.
 */
export function orderRef(refNo: number | null | undefined, kind: "rev" | "ship" | "order" = "order"): string {
  if (refNo == null) return "—";
  const suffix = kind === "rev" ? "REV" : kind === "ship" ? "SHIP" : "ORD";
  return `LRMS-${refNo}-${suffix}`;
}

