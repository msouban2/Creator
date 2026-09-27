// Shared workflow vocabulary so employees & admins see the same plain-English
// status names and a consistent stage tracker everywhere (Applications, Review
// Queue, My Work). Keeping this in one place means a status is described the
// same way on every screen.
import type { CampaignType } from "./types";

// A campaign counts as "closed" once its stored status is no longer active OR
// its deadline (campaign_deadline, or application_deadline if unset) has passed.
// Mirrors effectiveStatus() on the Campaigns page and the creator app's hiding
// of expired campaigns, so every screen agrees on what "closed" means.
export function isCampaignClosed(campaign?: {
  status?: string | null;
  campaign_deadline?: string | null;
  application_deadline?: string | null;
} | null): boolean {
  if (!campaign) return false;
  if (campaign.status && campaign.status !== "active") return true;
  const deadline = campaign.campaign_deadline ?? campaign.application_deadline;
  return !!deadline && new Date(deadline).getTime() < Date.now();
}

// Plain-English label for each raw application status.
export const STATUS_LABEL: Record<string, string> = {
  applied: "Applied",
  selected: "Selected",
  ordered: "Order uploaded",
  order_approved: "Order approved",
  product_received: "Product received",
  content_creation: "Creating content",
  submitted: "Review submitted",
  review: "Content approved",
  payment_in_progress: "Payment in progress",
  completed: "Completed",
  rejected: "Rejected",
  product_shipped: "Shipped",
  delivered: "Product reached",
  draft_submitted: "Draft submitted",
  draft_revision: "Draft needs changes",
  draft_approved: "Draft approved",
  posted: "Reel posted",
  link_submitted: "Video live",
};

export function statusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return (
    STATUS_LABEL[status] ??
    status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export type FlowStage = { label: string; statuses: string[] };

// The high-level journey for each campaign type, grouped into a few readable
// stages. Every raw status maps into exactly one stage.
const FLOWS: Record<CampaignType, FlowStage[]> = {
  reimbursement: [
    { label: "Applied", statuses: ["applied"] },
    { label: "Ordering", statuses: ["selected", "ordered"] },
    { label: "Order OK", statuses: ["order_approved", "product_received", "content_creation"] },
    { label: "Review", statuses: ["submitted", "review"] },
    { label: "Paid", statuses: ["payment_in_progress", "completed"] },
  ],
  barter: [
    { label: "Creator Applied", statuses: ["applied"] },
    { label: "Approved Creator", statuses: ["selected"] },
    { label: "Product Shipped", statuses: ["product_shipped"] },
    { label: "Product Reached", statuses: ["delivered", "content_creation"] },
    { label: "Draft Submitted", statuses: ["draft_submitted", "draft_revision"] },
    { label: "Draft Applied", statuses: ["draft_approved"] },
    { label: "Video Live", statuses: ["posted", "link_submitted", "submitted", "review", "payment_in_progress"] },
    { label: "Noted Insights", statuses: ["completed"] },
  ],
  paid: [
    { label: "Creator Applied", statuses: ["applied"] },
    { label: "Approved Creator", statuses: ["selected"] },
    { label: "Product Shipped", statuses: ["product_shipped"] },
    { label: "Product Reached", statuses: ["delivered", "content_creation"] },
    { label: "Draft Submitted", statuses: ["draft_submitted", "draft_revision"] },
    { label: "Draft Applied", statuses: ["draft_approved"] },
    { label: "Video Live", statuses: ["posted", "link_submitted", "submitted", "review", "payment_in_progress"] },
    { label: "Noted Insights", statuses: ["completed"] },
  ],
};

export function flowStages(type: CampaignType | undefined): FlowStage[] {
  return type ? FLOWS[type] : [];
}

// Index of the stage the given status sits in (-1 if unknown/rejected).
export function currentStageIndex(type: CampaignType | undefined, status: string): number {
  if (!type) return -1;
  return FLOWS[type].findIndex((s) => s.statuses.includes(status));
}
