import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import { Users, Megaphone, FileCheck2, IndianRupee, Wallet, Store, CheckCircle2, Clock, ArrowUpRight, Gift } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { DateRangeFilter, type DateRange } from "@/components/DateRangeFilter";
import { useAuth } from "@/store/auth";
import { EmployeeHome } from "@/pages/EmployeeHome";
import { formatCurrency } from "@/lib/utils";

const TYPE_COLORS: Record<string, string> = {
  reimbursement: "#6366f1",
  barter: "#f59e0b",
  paid: "#10b981",
};

// Group the many application statuses into a readable pipeline.
const PIPELINE: { label: string; match: (s: string) => boolean }[] = [
  { label: "Applied", match: (s) => s === "applied" },
  { label: "Selected", match: (s) => s === "selected" },
  {
    label: "In progress",
    match: (s) =>
      [
        "product_shipped",
        "product_received",
        "content_creation",
        "draft_submitted",
        "draft_revision",
        "draft_approved",
        "posted",
      ].includes(s),
  },
  { label: "In review", match: (s) => ["submitted", "review", "link_submitted"].includes(s) },
  { label: "Completed", match: (s) => s === "completed" },
  { label: "Rejected", match: (s) => s === "rejected" },
];

// Applications at a stage that needs an employee/admin lifecycle action
// (approve order screenshot, ship, deliver, review draft/content). Mirrors the
// employee home's action logic so admins see the same "to action" queue.
function needsLifecycleAction(status: string, type: string | undefined): boolean {
  if (type === "reimbursement") return ["ordered", "link_submitted", "submitted"].includes(status);
  return ["applied", "selected", "product_shipped", "delivered", "draft_submitted", "submitted", "link_submitted"].includes(status);
}

async function fetchStats(range: DateRange) {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5, 1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  // Scope a query to the selected period on the given timestamp column.
  // When no range is set (All time), the query is returned unchanged.
  const withRange = <T,>(q: T, col: string): T => {
    let query = q as any;
    if (range.from) query = query.gte(col, range.from);
    if (range.to) query = query.lte(col, range.to);
    return query as T;
  };

  const [creators, campaigns, applications, submissions, withdrawals, transactions, sellerPayments, wallets, creatorSignups, sellerRows, reviewerWorkload] =
    await Promise.all([
      withRange(supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "creator"), "created_at"),
      withRange(supabase.from("campaigns").select("campaign_type, reward_amount, cashback_percentage, slots, status, brand_name"), "created_at"),
      withRange(supabase.from("applications").select("status, campaign:campaigns(campaign_type)"), "applied_at"),
      withRange(supabase.from("campaign_submissions").select("review_status"), "created_at"),
      withRange(supabase.from("withdrawals").select("status, amount"), "created_at"),
      withRange(supabase.from("transactions").select("amount, type, remarks, created_at, campaign:campaigns(campaign_type, seller_id)"), "created_at"),
      supabase.from("seller_payments").select("seller_id, amount"),
      supabase.from("wallets").select("available_balance, pending_balance"),
      supabase.from("profiles").select("created_at").eq("role", "creator").gte("created_at", sixMonthsAgo.toISOString()),
      supabase.from("profiles").select("id, full_name").eq("role", "seller"),
      supabase.rpc("reviewer_workload"),
    ]);

  // ----- campaigns -----
  const campRows = (campaigns.data ?? []) as {
    campaign_type: string;
    reward_amount: number;
    cashback_percentage: number;
    slots: number;
    status: string;
    brand_name: string | null;
  }[];
  const activeRows = campRows.filter((c) => c.status === "active");
  const activeCampaigns = activeRows.length;

  // Total Brands = distinct brand names entered on campaigns (the "Brand Name"
  // field), not seller-role accounts.
  const totalBrands = new Set(
    campRows.map((c) => c.brand_name?.trim()).filter((n): n is string => !!n)
  ).size;

  const campaignStatus: Record<string, number> = { active: 0, draft: 0, closed: 0 };
  campRows.forEach((c) => {
    if (c.status in campaignStatus) campaignStatus[c.status] += 1;
  });

  const activeTypeCounts: Record<string, number> = { paid: 0, barter: 0, reimbursement: 0 };
  activeRows.forEach((c) => {
    activeTypeCounts[c.campaign_type] = (activeTypeCounts[c.campaign_type] ?? 0) + 1;
  });

  // Estimated spend per active campaign: reimbursement pays product price +
  // flat cashback; barter/paid commit the full reward, multiplied by slots.
  const estCost = (c: (typeof campRows)[number]) => {
    const slots = Number(c.slots) || 0;
    if (c.campaign_type === "reimbursement") {
      return (Number(c.reward_amount) + Number(c.cashback_percentage)) * slots;
    }
    return Number(c.reward_amount) * slots;
  };
  const spend: Record<string, number> = { reimbursement: 0, barter: 0, paid: 0 };
  activeRows.forEach((c) => {
    spend[c.campaign_type] = (spend[c.campaign_type] ?? 0) + estCost(c);
  });
  const totalCommitted = Object.values(spend).reduce((a, b) => a + b, 0);
  const spendData = [
    { name: "Reimbursement", key: "reimbursement", value: Math.round(spend.reimbursement) },
    { name: "Barter", key: "barter", value: Math.round(spend.barter) },
    { name: "Paid", key: "paid", value: Math.round(spend.paid) },
  ];

  // ----- applications -----
  const appRows = (applications.data ?? []) as {
    status: string;
    campaign: { campaign_type?: string } | { campaign_type?: string }[] | null;
  }[];
  const pipeline = PIPELINE.map((p) => ({ name: p.label, value: appRows.filter((a) => p.match(a.status)).length }));
  const pendingApps = appRows.filter((a) => a.status === "applied").length;
  // "Approved" = moved past the application gate and not rejected.
  const approvedApps = appRows.filter((a) => a.status !== "applied" && a.status !== "rejected").length;

  // Per-campaign-type funnel for the Application pipeline columns. Each stage
  // counts applications that have reached at least that point (decreasing bars).
  const typeOf = (a: (typeof appRows)[number]) => {
    const camp = Array.isArray(a.campaign) ? a.campaign[0] : a.campaign;
    return camp?.campaign_type;
  };
  const PIPELINES_BY_TYPE: Record<string, { label: string; statuses: string[] }[]> = {
    reimbursement: [
      { label: "Creator Applied", statuses: ["applied"] },
      { label: "Ordered", statuses: ["ordered"] },
      { label: "Order Approved", statuses: ["order_approved", "product_received", "content_creation"] },
      { label: "Review Submitted", statuses: ["submitted", "review", "link_submitted"] },
      { label: "Paid", statuses: ["completed"] },
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
  const buildTypePipeline = (type: string) => {
    const stages = PIPELINES_BY_TYPE[type];
    const rows = appRows.filter((a) => typeOf(a) === type && a.status !== "rejected");
    // Rank each status by the first stage that lists it.
    const rankOf = (status: string) => {
      const i = stages.findIndex((s) => s.statuses.includes(status));
      return i; // -1 if not found (e.g. an unmapped status) → excluded from funnel
    };
    const total = rows.length;
    const items = stages.map((s, i) => ({
      label: s.label,
      value: rows.filter((a) => {
        const r = rankOf(a.status);
        return r >= 0 && r >= i;
      }).length,
    }));
    return { total, items };
  };
  const pipelinesByType = {
    reimbursement: buildTypePipeline("reimbursement"),
    barter: buildTypePipeline("barter"),
    paid: buildTypePipeline("paid"),
  };
  // Applications sitting at a stage that needs an employee/admin lifecycle
  // action (approve order screenshot, ship, deliver, review draft/content).
  const actionApps = appRows.filter((a) => {
    const camp = Array.isArray(a.campaign) ? a.campaign[0] : a.campaign;
    return needsLifecycleAction(a.status, camp?.campaign_type);
  }).length;
  const pendingAppTypeCounts: Record<string, number> = { paid: 0, barter: 0, reimbursement: 0 };
  appRows
    .filter((a) => {
      const camp = Array.isArray(a.campaign) ? a.campaign[0] : a.campaign;
      return needsLifecycleAction(a.status, camp?.campaign_type);
    })
    .forEach((a) => {
      const camp = Array.isArray(a.campaign) ? a.campaign[0] : a.campaign;
      const t = camp?.campaign_type;
      if (t) pendingAppTypeCounts[t] = (pendingAppTypeCounts[t] ?? 0) + 1;
    });

  // ----- submissions -----
  const subRows = (submissions.data ?? []) as { review_status: string }[];
  const reviewData = (["pending", "approved", "revision", "rejected"] as const).map((s) => ({
    name: s,
    key: s,
    value: subRows.filter((r) => r.review_status === s).length,
  }));
  const pendingReviews = subRows.filter((r) => r.review_status === "pending").length;

  // ----- withdrawals -----
  const wRows = (withdrawals.data ?? []) as { status: string; amount: number }[];
  const pendingWithdrawals = wRows.filter((w) => w.status === "requested").length;
  const withdrawalRequestedAmount = wRows
    .filter((w) => w.status === "requested")
    .reduce((a, w) => a + Number(w.amount ?? 0), 0);

  // ----- transactions (real money already recorded) -----
  const txRows = (transactions.data ?? []) as {
    amount: number;
    type: string;
    remarks: string | null;
    created_at: string;
    campaign: { campaign_type?: string; seller_id?: string | null } | { campaign_type?: string; seller_id?: string | null }[] | null;
  }[];
  const isPayout = (t: string) => t === "campaign_payment" || t === "reimbursement";
  const paidOut = txRows.filter((t) => isPayout(t.type)).reduce((a, t) => a + Number(t.amount ?? 0), 0);
  const paidToReferrals = txRows.filter((t) => t.type === "referral_bonus").reduce((a, t) => a + Number(t.amount ?? 0), 0);
  const sellerUsed = txRows.filter((t) => isPayout(t.type)).reduce((a, t) => {
    const camp = Array.isArray(t.campaign) ? t.campaign[0] : t.campaign;
    return a + (camp?.seller_id ? Number(t.amount ?? 0) : 0);
  }, 0);

  // Released payments grouped by the campaign type they were paid for.
  const released: Record<string, number> = { reimbursement: 0, barter: 0, paid: 0 };
  txRows.filter((t) => isPayout(t.type)).forEach((t) => {
    const camp = Array.isArray(t.campaign) ? t.campaign[0] : t.campaign;
    const type = camp?.campaign_type;
    if (type && type in released) released[type] += Number(t.amount ?? 0);
  });
  const releasedData = [
    { name: "Reimbursement", key: "reimbursement", value: Math.round(released.reimbursement) },
    { name: "Barter", key: "barter", value: Math.round(released.barter) },
    { name: "Paid", key: "paid", value: Math.round(released.paid) },
  ];
  const totalReleased = Object.values(released).reduce((a, b) => a + b, 0);

  const ym = (d: string) => {
    const dt = new Date(d);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
  };
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const dt = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return { key: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`, label: dt.toLocaleString("en-IN", { month: "short" }) };
  });
  const paidByMonth: Record<string, number> = Object.fromEntries(months.map((m) => [m.key, 0]));
  txRows.filter((t) => isPayout(t.type)).forEach((t) => {
    const k = ym(t.created_at);
    if (k in paidByMonth) paidByMonth[k] += Number(t.amount ?? 0);
  });
  const payoutSeries = months.map((m) => ({ name: m.label, value: Math.round(paidByMonth[m.key]) }));

  const campaignStatusData = [
    { name: "Active", key: "active", value: campaignStatus.active },
    { name: "Draft", key: "draft", value: campaignStatus.draft },
    { name: "Closed", key: "closed", value: campaignStatus.closed },
  ];

  // ----- seller funding -----
  const sellerPayRows = (sellerPayments.data ?? []) as { seller_id: string; amount: number }[];
  const sellerReceived = sellerPayRows.reduce((a, p) => a + Number(p.amount ?? 0), 0);
  const sellerRemaining = sellerReceived - sellerUsed;

  // Per-seller received/used → low-balance alerts.
  const receivedBySeller = new Map<string, number>();
  sellerPayRows.forEach((p) => receivedBySeller.set(p.seller_id, (receivedBySeller.get(p.seller_id) ?? 0) + Number(p.amount ?? 0)));
  const usedBySeller = new Map<string, number>();
  txRows.filter((t) => isPayout(t.type)).forEach((t) => {
    const camp = Array.isArray(t.campaign) ? t.campaign[0] : t.campaign;
    if (camp?.seller_id) usedBySeller.set(camp.seller_id, (usedBySeller.get(camp.seller_id) ?? 0) + Number(t.amount ?? 0));
  });
  const sellerAlerts = ((sellerRows.data ?? []) as { id: string; full_name: string | null }[])
    .map((s) => {
      const rec = receivedBySeller.get(s.id) ?? 0;
      const used = usedBySeller.get(s.id) ?? 0;
      return { id: s.id, name: s.full_name ?? "Seller", remaining: rec - used };
    })
    .filter((s) => s.remaining <= 0)
    .sort((a, b) => a.remaining - b.remaining)
    .slice(0, 6);

  // ----- reviewer workload -----
  const workload = ((reviewerWorkload.data ?? []) as { reviewer_name: string | null; reviewed: number }[])
    .map((w) => ({ name: w.reviewer_name ?? "—", reviewed: Number(w.reviewed ?? 0) }))
    .sort((a, b) => b.reviewed - a.reviewed)
    .slice(0, 6);

  // ----- conversion funnel -----
  const appliedTotal = appRows.length;
  const selectedPlus = appRows.filter((a) => a.status !== "applied" && a.status !== "rejected").length;
  const completedTotal = appRows.filter((a) => a.status === "completed").length;
  const funnel = { applied: appliedTotal, selected: selectedPlus, completed: completedTotal };

  // ----- wallets (money owed / available to creators) -----
  const walletRows = (wallets.data ?? []) as { available_balance: number; pending_balance: number }[];
  const walletOwed = walletRows.reduce((a, w) => a + Number(w.pending_balance ?? 0), 0);
  const walletAvailable = walletRows.reduce((a, w) => a + Number(w.available_balance ?? 0), 0);
  // Total money the platform is holding in the bank on behalf of creators
  // (withdrawable balance + balance still locked/pending).
  const walletHeld = walletAvailable + walletOwed;

  // ----- payments by campaign type (reconciled with Brand Management) -----
  // Uses the same payout ledger (isPayout transactions) and seller_payments as
  // the Brand Management page, so the numbers tie out.
  const PAY_TYPES = ["reimbursement", "barter", "paid"] as const;
  const zeroByType = () => ({ reimbursement: 0, barter: 0, paid: 0 }) as Record<string, number>;

  const usedAllByType = zeroByType();      // creator payouts, all campaigns
  const usedSellerByType = zeroByType();   // creator payouts, seller-assigned only
  const usedBySellerType = new Map<string, Record<string, number>>();
  txRows.filter((t) => isPayout(t.type)).forEach((t) => {
    const camp = Array.isArray(t.campaign) ? t.campaign[0] : t.campaign;
    const ty = camp?.campaign_type;
    if (!ty || !(ty in usedAllByType)) return;
    const amt = Number(t.amount ?? 0);
    usedAllByType[ty] += amt;
    if (camp?.seller_id) {
      usedSellerByType[ty] += amt;
      const mix = usedBySellerType.get(camp.seller_id) ?? zeroByType();
      mix[ty] += amt;
      usedBySellerType.set(camp.seller_id, mix);
    }
  });

  // Referral bonuses carry the campaign type in their remark.
  const referralByType = zeroByType();
  txRows.filter((t) => t.type === "referral_bonus").forEach((t) => {
    const m = /Referral bonus for (\w+) campaign/.exec(t.remarks ?? "");
    const ty = m?.[1];
    if (ty && ty in referralByType) referralByType[ty] += Number(t.amount ?? 0);
  });

  // Brand payments received, attributed to each type by that seller's payout mix
  // (seller_payments isn't tagged by type). Sums to the true total received.
  const receivedByType = zeroByType();
  usedBySellerType.forEach((mix, sellerId) => {
    const total = PAY_TYPES.reduce((a, ty) => a + mix[ty], 0);
    if (total <= 0) return;
    const recv = receivedBySeller.get(sellerId) ?? 0;
    PAY_TYPES.forEach((ty) => {
      receivedByType[ty] += recv * (mix[ty] / total);
    });
  });

  // Wallet still owned by creators, split by each type's share of credited money.
  const creditedByType = zeroByType();
  PAY_TYPES.forEach((ty) => {
    creditedByType[ty] = usedAllByType[ty] + referralByType[ty];
  });
  const creditedTotal = PAY_TYPES.reduce((a, ty) => a + creditedByType[ty], 0);
  const walletByType = zeroByType();
  PAY_TYPES.forEach((ty) => {
    walletByType[ty] = creditedTotal > 0 ? walletAvailable * (creditedByType[ty] / creditedTotal) : 0;
  });

  const paymentsByType = PAY_TYPES.map((ty) => ({
    type: ty,
    received: Math.round(receivedByType[ty]),
    usedAll: Math.round(usedAllByType[ty]),
    usedSellers: Math.round(usedSellerByType[ty]),
    referral: Math.round(referralByType[ty]),
    wallet: Math.round(walletByType[ty]),
  }));

  // ----- fulfilment pipeline (paid/barter physical flow) -----
  const fulfilment = {
    shipped: appRows.filter((a) => a.status === "product_shipped").length,
    delivered: appRows.filter((a) => a.status === "delivered").length,
    inReview: appRows.filter((a) => ["submitted", "review", "link_submitted"].includes(a.status)).length,
    completed: appRows.filter((a) => a.status === "completed").length,
  };

  // ----- creator growth (last 6 months) -----
  const signupByMonth: Record<string, number> = Object.fromEntries(months.map((m) => [m.key, 0]));
  ((creatorSignups.data ?? []) as { created_at: string }[]).forEach((c) => {
    const k = ym(c.created_at);
    if (k in signupByMonth) signupByMonth[k] += 1;
  });
  const creatorGrowth = months.map((m) => ({ name: m.label, value: signupByMonth[m.key] }));

  return {
    creators: creators.count ?? 0,
    sellers: totalBrands,
    activeCampaigns,
    closedCampaigns: campaignStatus.closed,
    approvedApps,
    pendingApps,
    actionApps,
    pendingReviews,
    pendingWithdrawals,
    withdrawalRequestedAmount,
    paidOut,
    paidToReferrals,
    walletOwed,
    walletAvailable,
    walletHeld,
    paymentsByType,
    pipelinesByType,
    sellerReceived,
    sellerUsed,
    sellerRemaining,
    sellerAlerts,
    workload,
    funnel,
    fulfilment,
    creatorGrowth,
    totalCommitted,
    activeTypeCounts,
    pendingAppTypeCounts,
    spendData,
    releasedData,
    totalReleased,
    pipeline,
    reviewData,
    campaignStatusData,
    payoutSeries,
  };
}

const overviewCards = [
  { key: "creators", label: "Total Creators", icon: Users, color: "text-indigo-600 bg-indigo-100", to: "/users" },
  { key: "sellers", label: "Total Brands", icon: Store, color: "text-sky-600 bg-sky-100", to: "/sellers" },
  { key: "activeCampaigns", label: "Active Campaigns", icon: Megaphone, color: "text-rose-600 bg-rose-100", to: "/campaigns?status=active" },
  { key: "closedCampaigns", label: "Closed Campaigns", icon: CheckCircle2, color: "text-violet-600 bg-violet-100", to: "/campaigns?status=closed" },
  { key: "approvedApps", label: "Accepted Applications", icon: FileCheck2, color: "text-emerald-600 bg-emerald-100", to: "/applications?bucket=all" },
  { key: "actionApps", label: "Pending Applications", icon: Clock, color: "text-amber-600 bg-amber-100", to: "/applications?bucket=action" },
] as const;

const paymentCards = [
  { key: "walletHeld", label: "Held in Creator Wallets", icon: Wallet, color: "text-fuchsia-600 bg-fuchsia-100", money: true },
  { key: "withdrawalRequestedAmount", label: "Withdrawal Requests", icon: ArrowUpRight, color: "text-violet-600 bg-violet-100", money: true, subKey: "pendingWithdrawals", subSuffix: "requests", to: "/payments" },
  { key: "paidOut", label: "Paid to Creators", icon: IndianRupee, color: "text-emerald-600 bg-emerald-100", money: true },
  { key: "paidToReferrals", label: "Paid to Referrals", icon: Gift, color: "text-rose-600 bg-rose-100", money: true },
] as const;

// Per-campaign-type accent colours for the pipeline + pills.
const TYPE_PILL: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200",
  barter: "bg-amber-100 text-amber-700 hover:bg-amber-200",
  reimbursement: "bg-indigo-100 text-indigo-700 hover:bg-indigo-200",
};

function TypePill({ label, n, tone, onClick }: { label: string; n: number; tone: string; onClick: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${TYPE_PILL[tone] ?? "bg-slate-100 text-slate-600"}`}
    >
      {label} {n}
    </button>
  );
}

function EmptyChart({ height = 220 }: { height?: number }) {
  return (
    <div className="flex items-center justify-center text-sm text-slate-400" style={{ height }}>
      No data yet
    </div>
  );
}

export default function Dashboard() {
  const { profile } = useAuth();
  const [range, setRange] = useState<DateRange>({ from: null, to: null });

  // Employees get a personal "My Work" home; the global stats stay admin-only.
  if (profile?.role !== "admin") {
    return <EmployeeHome />;
  }

  return <AdminDashboard range={range} setRange={setRange} />;
}

function AdminDashboard({ range, setRange }: { range: DateRange; setRange: (r: DateRange) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", range.from, range.to],
    queryFn: () => fetchStats(range),
  });
  const navigate = useNavigate();
  const [sellersOnly, setSellersOnly] = useState(true);

  const money = (v: number) => formatCurrency(v);

  const val = (k: string): number => (data ? ((data as unknown as Record<string, number>)[k] ?? 0) : 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Dashboard</h1>
          <p className="text-sm text-slate-500">Here's a quick overview of your platform performance.</p>
        </div>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      {/* Dashboard Overview */}
      <Card>
        <CardContent className="p-5">
          <h2 className="mb-4 text-base font-bold text-ink">Dashboard Overview</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {overviewCards.map((c) => (
              <button
                key={c.key}
                onClick={() => c.to && navigate(c.to)}
                className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-4 text-left transition-all hover:border-primary/40 hover:shadow-md"
              >
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${c.color}`}>
                  <c.icon size={22} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-slate-500">{c.label}</p>
                  <p className="text-2xl font-black text-ink">{isLoading ? "…" : val(c.key)}</p>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Payments Overview */}
      <Card>
        <CardContent className="p-5">
          <h2 className="mb-4 text-base font-bold text-ink">Payments Overview</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {paymentCards.map((c) => {
              const sub = "subKey" in c && c.subKey ? val(c.subKey) : null;
              return (
                <button
                  key={c.key}
                  onClick={() => "to" in c && c.to && navigate(c.to)}
                  className="flex items-start gap-4 rounded-2xl border border-slate-100 bg-white p-4 text-left transition-all hover:border-primary/40 hover:shadow-md"
                >
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${c.color}`}>
                    <c.icon size={22} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-slate-500">{c.label}</p>
                    {sub !== null ? (
                      <p className="text-[11px] text-slate-400">{sub} {"subSuffix" in c ? c.subSuffix : ""}</p>
                    ) : null}
                    <p className="text-2xl font-black text-ink">{isLoading ? "…" : money(val(c.key))}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Payments by campaign type (reconciled with Brand Management) */}
      {!isLoading && (
        <Card>
          <CardContent className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-ink">Payments by campaign type</h2>
                <p className="text-xs text-slate-400">
                  Brand payments, creator payouts, referrals and wallet balance per type — same ledger as Brand Management.
                </p>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-500">
                <input
                  type="checkbox"
                  checked={sellersOnly}
                  onChange={(e) => setSellersOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                />
                Seller-assigned campaigns only
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {(data?.paymentsByType ?? []).map((p) => {
                const rows = [
                  { label: "Brand Received", value: p.received },
                  { label: "Used Creator Budget", value: sellersOnly ? p.usedSellers : p.usedAll },
                  { label: "Referral Amount", value: p.referral },
                  { label: "Wallet Owned", value: p.wallet },
                ];
                return (
                  <div key={p.type} className="rounded-2xl border border-slate-100 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: TYPE_COLORS[p.type] }} />
                      <span className="text-sm font-bold capitalize text-ink">{p.type}</span>
                    </div>
                    <div className="space-y-2.5">
                      {rows.map((r) => (
                        <div key={r.label} className="flex items-center justify-between">
                          <span className="text-sm text-slate-500">{r.label}</span>
                          <span className="text-sm font-bold text-ink">{money(r.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] text-slate-400">
              "Brand Received" and "Wallet Owned" are estimates split across types by each seller's payout mix, since
              brand payments and wallet balances aren't tracked per campaign type.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Quick type breakdowns (colorful) */}
      {!isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card>
            <CardContent className="p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Active campaigns by type</p>
              <div className="flex flex-wrap gap-2">
                <TypePill label="Paid" tone="paid" n={data?.activeTypeCounts?.paid ?? 0} onClick={() => navigate("/campaigns?status=active&type=paid")} />
                <TypePill label="Barter" tone="barter" n={data?.activeTypeCounts?.barter ?? 0} onClick={() => navigate("/campaigns?status=active&type=barter")} />
                <TypePill label="Reimb." tone="reimbursement" n={data?.activeTypeCounts?.reimbursement ?? 0} onClick={() => navigate("/campaigns?status=active&type=reimbursement")} />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Pending applications by type</p>
              <div className="flex flex-wrap gap-2">
                <TypePill label="Paid" tone="paid" n={data?.pendingAppTypeCounts?.paid ?? 0} onClick={() => navigate("/applications?bucket=action&type=paid")} />
                <TypePill label="Barter" tone="barter" n={data?.pendingAppTypeCounts?.barter ?? 0} onClick={() => navigate("/applications?bucket=action&type=barter")} />
                <TypePill label="Reimb." tone="reimbursement" n={data?.pendingAppTypeCounts?.reimbursement ?? 0} onClick={() => navigate("/applications?bucket=action&type=reimbursement")} />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* New creators + Released payments by type */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <h3 className="mb-1 text-base font-bold text-ink">New creators</h3>
            <p className="mb-4 text-xs text-slate-400">Sign-ups over the last 6 months.</p>
            {!data || data.creatorGrowth.every((p) => p.value === 0) ? (
              <EmptyChart height={240} />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={data.creatorGrowth}>
                  <defs>
                    <linearGradient id="growth" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} fill="url(#growth)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3 className="mb-1 text-base font-bold text-ink">Released payments by type</h3>
            <p className="mb-4 text-xs text-slate-400">Actual money released to creators, grouped by campaign type.</p>
            {!data || data.totalReleased === 0 ? (
              <EmptyChart height={240} />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.releasedData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: number) => money(v)} />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                    {data.releasedData.map((d) => (
                      <Cell key={d.key} fill={TYPE_COLORS[d.key]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Application pipeline — by campaign type */}
      <Card>
        <CardContent className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-ink">Application pipeline</h3>
              <p className="text-xs text-slate-400">Track applications across each campaign type.</p>
            </div>
            <div className="flex items-center gap-3 text-xs font-semibold">
              <span className="flex items-center gap-1.5 text-slate-500"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: TYPE_COLORS.reimbursement }} />Reimbursement</span>
              <span className="flex items-center gap-1.5 text-slate-500"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: TYPE_COLORS.barter }} />Barter</span>
              <span className="flex items-center gap-1.5 text-slate-500"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: TYPE_COLORS.paid }} />Paid</span>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {([
              { key: "reimbursement", label: "Reimbursement" },
              { key: "barter", label: "Barter" },
              { key: "paid", label: "Paid" },
            ] as const).map((col) => {
              const pipe = data?.pipelinesByType?.[col.key];
              const color = TYPE_COLORS[col.key];
              const max = Math.max(...(pipe?.items ?? []).map((i) => i.value), 1);
              return (
                <div key={col.key} className="rounded-2xl border border-slate-100 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-bold text-ink">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                      {col.label}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">Total: {pipe?.total ?? 0}</span>
                  </div>
                  <div className="space-y-2.5">
                    {(pipe?.items ?? []).map((it) => (
                      <div key={it.label}>
                        <div className="mb-1 flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">{it.label}</span>
                          <span className="font-semibold text-ink">{it.value}</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-slate-100">
                          <div className="h-2 rounded-full" style={{ width: `${Math.max((it.value / max) * 100, 2)}%`, backgroundColor: color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
