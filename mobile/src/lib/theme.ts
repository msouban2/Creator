// Central design tokens mirrored from tailwind.config.js for imperative use
// (e.g. StatusBar, icon colors, gradients).
export const colors = {
  primary: "#E36E86",
  primaryDark: "#D0546E",
  primarySoft: "#FADFE5",
  primaryTint: "#FCF1F3",
  blush: "#F6B6C1",
  blushSoft: "#FBD3DA",
  ink: "#0D0D0D",
  inkSoft: "#4B4B4B",
  inkMuted: "#8A8A8A",
  canvas: "#FFF6F7",
  card: "#FFFFFF",
  success: "#1BA672",
  warning: "#E4870B",
  info: "#5B6EF5",
  border: "#F6DCE1",
  white: "#FFFFFF",
  black: "#0D0D0D",
};

export const CAMPAIGN_TYPE_LABEL: Record<string, string> = {
  reimbursement: "Reimbursement",
  barter: "Barter",
  paid: "Paid",
};

export const APPLICATION_STEPS = [
  "selected",
  "product_received",
  "content_creation",
  "submitted",
  "review",
  "completed",
] as const;

export const STEP_LABEL: Record<string, string> = {
  applied: "Creator Applied",
  selected: "Selected",
  ordered: "Ordered",
  order_approved: "Order Approved",
  product_received: "Product Received",
  content_creation: "Content Creation",
  submitted: "Content Submitted",
  review: "Under Review",
  payment_in_progress: "Payment in Progress",
  completed: "Completed",
  // paid / barter flow labels
  product_shipped: "Product Shipped",
  delivered: "Product Reached",
  draft_submitted: "Draft Submitted",
  draft_revision: "Correction Needed",
  draft_approved: "Draft Approved",
  posted: "Posted on Instagram",
  link_submitted: "Video Live",
};

// Per-campaign-type label overrides (barter/paid use friendlier creator-facing
// wording). Falls back to STEP_LABEL when a step isn't overridden.
const BARTER_PAID_LABELS: Record<string, string> = {
  applied: "Creator Applied",
  selected: "Approved Creator",
  draft_approved: "Draft Applied",
  link_submitted: "Video Live",
  completed: "Noted Insights",
};
export const STEP_LABEL_BY_TYPE: Record<string, Record<string, string>> = {
  barter: BARTER_PAID_LABELS,
  paid: BARTER_PAID_LABELS,
};

// Resolve a step's display label for a given campaign type.
export function stepLabel(campaignType: string, step: string): string {
  return STEP_LABEL_BY_TYPE[campaignType]?.[step] ?? STEP_LABEL[step] ?? step;
}

// Short one-word labels for the compact progress tracker on cards.
export const SHORT_STEP_LABEL: Record<string, string> = {
  applied: "Applied",
  selected: "Selected",
  ordered: "Ordered",
  order_approved: "Order OK",
  product_received: "Received",
  content_creation: "Content",
  submitted: "Submitted",
  review: "Review",
  payment_in_progress: "Paying",
  completed: "Done",
  product_shipped: "Shipped",
  delivered: "Reached",
  draft_submitted: "Draft",
  draft_revision: "Revision",
  draft_approved: "Approved",
  posted: "Posted",
  link_submitted: "Live",
};

// Progress tracker steps differ per campaign type.
export const STEPS_BY_TYPE: Record<string, string[]> = {
  reimbursement: ["selected", "ordered", "order_approved", "submitted", "review", "payment_in_progress", "completed"],
  barter: ["applied", "selected", "product_shipped", "delivered", "draft_submitted", "draft_approved", "link_submitted", "completed"],
  paid: ["applied", "selected", "product_shipped", "delivered", "draft_submitted", "draft_approved", "link_submitted", "completed"],
};

// Map a live application status onto the best-matching step name within a
// type's step list. Ordered candidates — the first that exists in the list wins.
const STATUS_TO_STEP: Record<string, string[]> = {
  applied: ["applied", "selected"],
  selected: ["selected"],
  ordered: ["ordered"],
  order_approved: ["order_approved"],
  product_received: ["product_received", "order_approved", "delivered"],
  product_shipped: ["product_shipped"],
  delivered: ["delivered", "submitted"],
  content_creation: ["order_approved", "delivered", "submitted"],
  draft_submitted: ["draft_submitted", "submitted"],
  draft_revision: ["draft_submitted", "submitted"],
  draft_approved: ["draft_approved", "review"],
  posted: ["link_submitted", "submitted"],
  link_submitted: ["link_submitted", "review"],
  submitted: ["submitted"],
  review: ["review"],
  payment_in_progress: ["payment_in_progress", "review"],
  completed: ["completed"],
};

export function stepIndexForStatus(campaignType: string, status: string): number {
  const steps = STEPS_BY_TYPE[campaignType] ?? APPLICATION_STEPS.slice();
  const candidates = STATUS_TO_STEP[status] ?? [status];
  for (const c of candidates) {
    const i = steps.indexOf(c);
    if (i >= 0) return i;
  }
  return steps.indexOf(status);
}
