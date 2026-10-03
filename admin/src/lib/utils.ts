import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Campaign } from "./types";

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

export function campaignCode(campaign: Pick<Campaign, "id" | "campaign_type" | "created_at" | "campaign_code">): string {
  if (campaign.campaign_code?.trim()) return campaign.campaign_code.trim();
  const prefix = campaign.campaign_type === "barter" ? "BR" : campaign.campaign_type === "paid" ? "PD" : "RB";
  const year = new Date(campaign.created_at).getFullYear();
  return `${prefix}${year}-${campaign.id.replace(/-/g, "").slice(0, 5).toUpperCase()}`;
}

