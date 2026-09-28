import { useMemo, useState, useEffect, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, ChevronRight, ChevronDown, Search, RefreshCw, FileText, Gift, Database, IndianRupee } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/store/auth";
import type { Application, ApplicationStatus, CampaignType, CampaignSubmission, ReviewStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge, Modal } from "@/components/ui/badge";
import { Select, Input } from "@/components/ui/input";
import { signedUrl } from "@/lib/storage";
import { CreatorInsights } from "@/components/CreatorInsights";
import { ReviewNotesThread } from "@/components/ReviewNotesThread";
import { TurnPill, StageTracker } from "@/components/WorkflowUi";
import { statusLabel, isCampaignClosed } from "@/lib/workflow";
import { formatCurrency, formatDate, orderRef } from "@/lib/utils";
import { ReleasePaymentModal, SendBackModal, REVIEW_TAGS } from "./Submissions";

const ALL_TYPES: CampaignType[] = ["barter", "reimbursement", "paid"];
const TYPE_LABEL: Record<CampaignType, string> = {
  barter: "Barter",
  reimbursement: "Reimbursement",
  paid: "Paid",
};
const TYPE_VARIANT: Record<CampaignType, "warning" | "info" | "success"> = {
  barter: "warning",
  reimbursement: "info",
  paid: "success",
};

const STATUS_VARIANT: Record<ApplicationStatus, "default" | "info" | "warning" | "success" | "danger"> = {
  applied: "warning",
  selected: "info",
  ordered: "warning",
  order_approved: "info",
  product_received: "info",
  content_creation: "info",
  submitted: "info",
  review: "warning",
  payment_in_progress: "info",
  completed: "success",
  rejected: "danger",
  product_shipped: "info",
  delivered: "info",
  draft_submitted: "warning",
  draft_revision: "danger",
  draft_approved: "info",
  posted: "info",
  link_submitted: "warning",
};

// Who is the next step waiting on, and what exactly should happen.
// This is what tells an employee "what to do" for each application.
type ActionWho = "employee" | "creator" | "seller" | "done";

// Reimbursement needs BOTH the purchase video and the review
// screenshot before an employee can approve or reject.
function reimbursementProofs(app: Application): { hasPurchase: boolean; hasReview: boolean; both: boolean } {
  const hasPurchase = !!app.purchase_proof;
  const hasReview = (app.submissions?.[0]?.screenshots?.length ?? 0) > 0;
  return { hasPurchase, hasReview, both: hasPurchase && hasReview };
}

function nextAction(app: Application): { who: ActionWho; text: string } {
  const type = app.campaign?.campaign_type;
  const s = app.status;
  if (s === "rejected") return { who: "done", text: "Rejected" };
  if (s === "completed") return { who: "done", text: "Completed & paid" };
  if (s === "applied") return { who: "employee", text: "Review the applicant — Select or Reject" };
  if (type === "paid") {
    if (s === "selected")
      return { who: "employee", text: "Send the product — press Mark Shipped" };
    if (s === "product_shipped") return { who: "employee", text: "Confirm delivery — press Mark Delivered" };
    if (s === "delivered") return { who: "creator", text: "Creator is preparing the draft video" };
    if (s === "draft_submitted") return { who: "employee", text: "Review the draft — Approve or Request Correction" };
    if (s === "draft_revision") return { who: "creator", text: "Creator is re-doing the draft" };
    if (s === "draft_approved" || s === "posted") return { who: "creator", text: "Creator is posting the reel & will submit the link" };
    if (s === "link_submitted") return { who: "employee", text: "Verify the reel in Submissions, then Approve & Pay" };
  }
  if (type === "barter") {
    if (s === "selected")
      return { who: "employee", text: "Send the product — press Mark Shipped" };
    if (s === "product_shipped") return { who: "employee", text: "Confirm delivery — press Mark Delivered" };
    if (s === "delivered" || s === "content_creation") return { who: "creator", text: "Creator is posting the reel" };
    if (s === "submitted" || s === "review") return { who: "employee", text: "Review the content in Submissions, then Approve & Pay" };
  }
  if (type === "reimbursement") {
    if (s === "selected") return { who: "creator", text: "Creator is buying the product & uploading the order screenshot" };
    if (s === "ordered") return { who: "employee", text: "Check the order screenshot — Approve or Reject the order" };
    if (s === "order_approved" || s === "product_received" || s === "content_creation") return { who: "creator", text: "Creator is uploading the review screenshot" };
    if (s === "submitted" || s === "review") {
      const { both, hasPurchase } = reimbursementProofs(app);
      if (both) return { who: "employee", text: "Check the order & review screenshots, then Approve or Reject" };
      return {
        who: "creator",
        text: hasPurchase
          ? "Waiting for the creator to upload the review screenshot"
          : "Waiting for the creator to upload the order & review screenshots",
      };
    }
  }
  return { who: "creator", text: s.replace(/_/g, " ") };
}

async function fetchApplications() {
  const { data, error } = await supabase
    .from("applications")
    .select("*, campaign:campaigns(*), creator:profiles!creator_id(*), actor:profiles!last_action_by(id, full_name), submissions:campaign_submissions(*)")
    .order("applied_at", { ascending: false });
  if (error) throw error;
  return data as Application[];
}

async function fetchReviewers() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, review_types")
    .in("role", ["admin", "employee"]);
  if (error) throw error;
  return (data ?? []) as { id: string; full_name: string | null; review_types: string[] | null }[];
}

type Reviewer = { id: string; full_name: string | null; review_types: string[] | null };

// The nine work "actions" an employee/admin picks from. Each maps to a set of
// applications and mirrors what the Review Queue used to do — but now the work
// happens right here on the Applications page.
type ActionKey =
  | "need_actions" | "order_screenshot" | "review_recording" | "seller_feedback"
  | "creators_applied" | "barter_approval" | "paid_approval" | "draft_pending" | "live_update" | "rejected" | "completed";

const ACTION_TABS: { key: ActionKey; label: string }[] = [
  { key: "need_actions", label: "Need Actions" },
  { key: "order_screenshot", label: "Order Screenshot" },
  { key: "review_recording", label: "Review Submission Recording" },
  { key: "seller_feedback", label: "Seller Feedback Screenshot" },
  { key: "barter_approval", label: "Barter Creator Approval" },
  { key: "paid_approval", label: "Paid Creator Approval" },
  { key: "live_update", label: "Live Update" },
  { key: "rejected", label: "Rejected" },
  { key: "completed", label: "Completed" },
];

// Labels for every action, including the ones reachable only by clicking an
// overview tile (Creators Applied / Draft Videos Pending).
const ACTION_LABEL: Record<ActionKey, string> = {
  need_actions: "Need Actions",
  order_screenshot: "Order Screenshot",
  review_recording: "Review Submission Recording",
  seller_feedback: "Seller Feedback Screenshot",
  creators_applied: "Creators Applied",
  barter_approval: "Barter Creator Approval",
  paid_approval: "Paid Creator Approval",
  draft_pending: "Draft Videos Pending",
  live_update: "Live Update",
  rejected: "Rejected",
  completed: "Completed",
};

type PeriodKey = "all" | "today" | "7d" | "30d" | "month" | "year";
const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
];
function periodStart(k: PeriodKey): Date | null {
  if (k === "all") return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (k === "today") return d;
  if (k === "7d") return new Date(d.setDate(d.getDate() - 6));
  if (k === "30d") return new Date(d.setDate(d.getDate() - 29));
  if (k === "month") return new Date(d.setDate(1));
  if (k === "year") return new Date(d.setMonth(0, 1));
  return null;
}

// Does the content submission still need an employee's review?
function reviewPending(a: Application): boolean {
  const sub = a.submissions?.[0];
  return !!sub && sub.review_status === "pending";
}
function hasSellerFeedback(a: Application): boolean {
  const sub = a.submissions?.[0];
  return !!a.seller_feedback || !!sub?.seller_feedback_screenshot || !!sub?.seller_feedback_video;
}

// Which applications belong under a given action tab.
function matchesAction(a: Application, key: ActionKey): boolean {
  const type = a.campaign?.campaign_type;
  const s = a.status;
  switch (key) {
    case "need_actions":
      return nextAction(a).who === "employee";
    case "order_screenshot":
      return type === "reimbursement" && s === "ordered";
    case "review_recording":
      return nextAction(a).who === "employee" && (s === "submitted" || s === "review") && reviewPending(a);
    case "seller_feedback":
      return hasSellerFeedback(a) && reviewPending(a);
    case "creators_applied":
      return s === "applied";
    case "barter_approval":
      return type === "barter" && s === "applied";
    case "paid_approval":
      return type === "paid" && s === "applied";
    case "draft_pending":
      return s === "draft_submitted" || s === "draft_revision";
    case "live_update":
      return s === "link_submitted" || (type !== "reimbursement" && s === "posted");
    case "rejected":
      return s === "rejected";
    case "completed":
      return s === "completed";
    default:
      return false;
  }
}

type CardTone = "info" | "warning" | "success";
const CARD_STYLE: Record<CampaignType, { icon: typeof FileText; ring: string; tint: string; badge: string; tone: CardTone }> = {
  reimbursement: { icon: FileText, ring: "border-sky-100", tint: "bg-sky-50 text-sky-600", badge: "bg-sky-100 text-sky-700", tone: "info" },
  barter: { icon: Gift, ring: "border-amber-100", tint: "bg-amber-50 text-amber-600", badge: "bg-amber-100 text-amber-700", tone: "warning" },
  paid: { icon: Database, ring: "border-emerald-100", tint: "bg-emerald-50 text-emerald-600", badge: "bg-emerald-100 text-emerald-700", tone: "success" },
};

// A single number+label tile inside an overview card (optionally a jump link).
function StatTile({ label, value, tone = "default", onClick }: { label: string; value: number; tone?: "default" | "rose" | "amber"; onClick?: () => void }) {
  const toneCls = tone === "rose" ? "text-rose-600" : tone === "amber" ? "text-amber-600" : "text-ink";
  const inner = (
    <>
      <p className={"text-xl font-black " + toneCls}>{value}</p>
      <p className="text-[11px] leading-tight text-slate-400">{label}</p>
    </>
  );
  if (onClick) {
    return (
      <button onClick={onClick} className="rounded-lg px-1 py-0.5 text-center transition-colors hover:bg-slate-50">
        {inner}
      </button>
    );
  }
  return <div className="px-1 text-center">{inner}</div>;
}

export default function Applications() {
  const navigate = useNavigate();
  const openReview = (id: string) => navigate(`/applications/${id}/review`);
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const myTypes = useMemo<CampaignType[]>(
    () => (isAdmin ? ALL_TYPES : ((profile?.review_types ?? []) as CampaignType[])),
    [isAdmin, profile?.review_types]
  );

  const { data, isLoading, dataUpdatedAt, refetch, isFetching } = useQuery({ queryKey: ["applications"], queryFn: fetchApplications });
  const { data: reviewers } = useQuery({ queryKey: ["app-reviewers"], queryFn: fetchReviewers, enabled: isAdmin });
  const reviewerList: Reviewer[] = reviewers ?? [];

  // Applications manually assigned to this employee — they can access these even
  // if it's a campaign type they don't normally handle (RLS grants access too).
  const { data: myAssignedIds = [] } = useQuery({
    queryKey: ["my-work-assignments", profile?.id],
    enabled: !isAdmin && !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_assignments")
        .select("application_id")
        .eq("assigned_to", profile!.id);
      if (error) throw error;
      return Array.from(new Set((data ?? []).map((r) => (r as { application_id: string }).application_id)));
    },
  });

  // Persist the chosen action tab + filters so returning from the review page
  // lands the employee exactly where they left off (instead of resetting to
  // "Select an action").
  const persisted = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem("apps-view-state") || "{}") as Record<string, string>;
    } catch {
      return {} as Record<string, string>;
    }
  }, []);

  const [action, setAction] = useState<ActionKey | null>((persisted.action as ActionKey) || null);
  const [typeFilter, setTypeFilter] = useState<CampaignType | "all">((persisted.typeFilter as CampaignType | "all") ?? "all");
  const [brand, setBrand] = useState(persisted.brand ?? "all");
  const [campaignId, setCampaignId] = useState(persisted.campaignId ?? "all");
  const [statusF, setStatusF] = useState(persisted.statusF ?? "all");
  const [period, setPeriod] = useState<PeriodKey>((persisted.period as PeriodKey) ?? "all");
  const [search, setSearch] = useState(persisted.search ?? "");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      sessionStorage.setItem(
        "apps-view-state",
        JSON.stringify({ action: action ?? "", typeFilter, brand, campaignId, statusF, period, search })
      );
    } catch {
      /* ignore */
    }
  }, [action, typeFilter, brand, campaignId, statusF, period, search]);

  const toggleRow = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const all = data ?? [];
  // Employees see the campaign types they're assigned, PLUS any specific
  // application manually assigned to them on the Employee Stats page.
  const assignedSet = useMemo(() => new Set(myAssignedIds), [myAssignedIds]);
  const scoped = useMemo(
    () =>
      all.filter(
        (a) =>
          isAdmin ||
          (a.campaign?.campaign_type != null && myTypes.includes(a.campaign.campaign_type)) ||
          assignedSet.has(a.id)
      ),
    [all, isAdmin, myTypes, assignedSet]
  );

  const brands = useMemo(() => {
    const set = new Set<string>();
    scoped.forEach((a) => a.campaign?.brand_name && set.add(a.campaign.brand_name));
    return Array.from(set).sort();
  }, [scoped]);
  const campaigns = useMemo(() => {
    const m = new Map<string, string>();
    scoped.forEach((a) => a.campaign && m.set(a.campaign.id, a.campaign.title));
    return Array.from(m, ([id, title]) => ({ id, title })).sort((x, y) => x.title.localeCompare(y.title));
  }, [scoped]);

  // Sidebar filters (everything except the chosen action tab).
  const baseFiltered = useMemo(
    () =>
      scoped.filter((a) => {
        if (typeFilter !== "all" && a.campaign?.campaign_type !== typeFilter) return false;
        if (brand !== "all" && a.campaign?.brand_name !== brand) return false;
        if (campaignId !== "all" && a.campaign?.id !== campaignId) return false;
        if (statusF !== "all" && a.status !== statusF) return false;
        const from = periodStart(period);
        if (from && new Date(a.applied_at) < from) return false;
        if (search.trim()) {
          const q = search.trim().toLowerCase();
          const hay = [
            a.ref_no != null ? `lrms-${a.ref_no}` : "",
            a.creator?.full_name ?? "",
            a.creator?.instagram_username ?? "",
            a.campaign?.title ?? "",
            a.campaign?.brand_name ?? "",
            a.campaign?.campaign_code ?? "",
            a.campaign?.asin ?? "",
          ].join(" ").toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      }),
    [scoped, typeFilter, brand, campaignId, statusF, period, search]
  );

  const list = useMemo(() => (action ? baseFiltered.filter((a) => matchesAction(a, action)) : []), [baseFiltered, action]);

  // Overview stats per campaign type (drawn from the role-scoped set).
  const ofType = (t: CampaignType) => scoped.filter((a) => a.campaign?.campaign_type === t);
  const needAction = (t: CampaignType) => ofType(t).filter((a) => nextAction(a).who === "employee").length;
  const cnt = (t: CampaignType, fn: (a: Application) => boolean) => ofType(t).filter(fn).length;
  const employeeFor = (t: CampaignType) => reviewerList.find((r) => (r.review_types ?? []).includes(t))?.full_name ?? null;

  const jump = (key: ActionKey, t: CampaignType) => {
    setTypeFilter(t);
    setAction(key);
  };

  // Employee with no queue assigned yet.
  if (!isAdmin && myTypes.length === 0 && assignedSet.size === 0) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center">
        <ClipboardList size={32} className="mx-auto text-slate-300" />
        <p className="mt-3 font-semibold text-ink">No work assigned yet</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
          Ask an admin to assign you a campaign type (Barter, Reimbursement, or Paid) on the Employees page.
        </p>
      </div>
    );
  }

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-ink">Applications</h1>
          <p className="text-sm text-slate-400">Manage and track all creator applications, submissions and approvals.</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span>Last updated: {lastUpdated}</span>
          <button
            onClick={() => refetch()}
            title="Refresh"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-ink"
          >
            <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Application overview */}
      <div className="rounded-2xl border border-slate-100 bg-white p-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400">Application overview</p>
        <div className="grid gap-3 lg:grid-cols-3">
          {ALL_TYPES.filter((t) => isAdmin || myTypes.includes(t)).map((t) => {
            const st = CARD_STYLE[t];
            const Icon = st.icon;
            const emp = employeeFor(t);
            return (
              <div key={t} className={"rounded-2xl border bg-white p-4 " + st.ring}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className={"flex h-10 w-10 items-center justify-center rounded-xl " + st.tint}>
                      <Icon size={18} />
                    </span>
                    <div>
                      <p className="text-base font-bold text-ink">{TYPE_LABEL[t]}</p>
                      <p className="text-[11px] text-slate-400">
                        Employee: <span className={"rounded-md px-1.5 py-0.5 font-semibold " + st.badge}>{emp ?? "Unassigned"}</span>
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => jump("need_actions", t)}
                    className="flex items-center gap-1.5 rounded-lg px-1 py-0.5 hover:bg-slate-50"
                    title="View items that need action"
                  >
                    <span className={"rounded-full px-2 py-0.5 text-[10px] font-bold " + st.badge}>Need Action</span>
                    <span className="text-xl font-black text-ink">{needAction(t)}</span>
                  </button>
                </div>

                {t === "reimbursement" ? (
                  <>
                    <div className="mt-4 grid grid-cols-3 gap-1 border-t border-slate-100 pt-3">
                      <StatTile label="Order Screenshot" value={cnt(t, (a) => a.status === "ordered")} onClick={() => jump("order_screenshot", t)} />
                      <StatTile label="Review Submission Recording" value={cnt(t, (a) => nextAction(a).who === "employee" && (a.status === "submitted" || a.status === "review") && reviewPending(a))} onClick={() => jump("review_recording", t)} />
                      <StatTile label="Seller Feedback Screenshot" value={cnt(t, (a) => hasSellerFeedback(a) && reviewPending(a))} onClick={() => jump("seller_feedback", t)} />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-1 border-t border-slate-100 pt-3">
                      <StatTile label="Creators Applied" value={cnt(t, (a) => a.status === "applied")} tone="rose" onClick={() => jump("creators_applied", t)} />
                      <StatTile label="Draft Videos Pending" value={cnt(t, (a) => a.status === "draft_submitted" || a.status === "draft_revision")} tone="amber" onClick={() => jump("draft_pending", t)} />
                    </div>
                  </>
                ) : (
                  <div className="mt-4 grid grid-cols-2 gap-1 border-t border-slate-100 pt-3">
                    <StatTile label="Creators Applied" value={cnt(t, (a) => a.status === "applied")} tone="rose" onClick={() => jump(t === "barter" ? "barter_approval" : "paid_approval", t)} />
                    <StatTile label="Draft Videos Pending" value={cnt(t, (a) => a.status === "draft_submitted" || a.status === "draft_revision")} tone="amber" onClick={() => jump("draft_pending", t)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Action tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {ACTION_TABS.map((tabItem) => {
          const activeTab = action === tabItem.key;
          return (
            <button
              key={tabItem.key}
              onClick={() => setAction(activeTab ? null : tabItem.key)}
              className={
                "rounded-full px-4 py-1.5 text-sm font-semibold transition-colors " +
                (activeTab ? "bg-ink text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50")
              }
            >
              {tabItem.label}
            </button>
          );
        })}
      </div>

      {/* Type filter */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Type</span>
        {(["all", ...(isAdmin ? ALL_TYPES : myTypes)] as ("all" | CampaignType)[]).map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={
              "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors " +
              (typeFilter === t ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")
            }
          >
            {t === "all" ? "All Types" : TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by creator, ASIN, campaign code…" className="pl-9" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Brand</span>
          <Select value={brand} onChange={(e) => setBrand(e.target.value)} className="w-44">
            <option value="all">All brands</option>
            {brands.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Campaign</span>
          <Select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className="w-44">
            <option value="all">All campaigns</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Status</span>
          <Select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="w-40">
            <option value="all">All status</option>
            {(Object.keys(STATUS_VARIANT) as ApplicationStatus[]).map((s) => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </Select>
        </div>
        <Select value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)} className="ml-auto w-36">
          {PERIODS.map((p) => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
        </Select>
      </div>

      {/* Content area */}
      {isLoading ? (
        <p className="text-slate-400">Loading…</p>
      ) : !action ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-100 bg-white py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <ClipboardList size={24} />
          </div>
          <p className="mt-4 text-lg font-bold text-ink">Select an action to view details</p>
          <p className="mt-1 max-w-sm text-sm text-slate-400">
            Click on any action above (Need Actions, Order Screenshot, etc.) to see the list of applications.
          </p>
        </div>
      ) : list.length === 0 ? (
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-ink">{ACTION_LABEL[action]}</h3>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">0</span>
            </div>
            <button onClick={() => setAction(null)} className="text-xs font-semibold text-primary hover:underline">
              Clear
            </button>
          </div>
          <div className="py-16 text-center text-slate-400">Nothing here right now. 🎉</div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-ink">{ACTION_LABEL[action]}</h3>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{list.length}</span>
            </div>
            <button onClick={() => setAction(null)} className="text-xs font-semibold text-primary hover:underline">
              Clear
            </button>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="w-8 px-2 py-2.5"></th>
                <th className="px-3 py-2.5 font-semibold">Ref</th>
                <th className="px-3 py-2.5 font-semibold">Creator</th>
                <th className="px-3 py-2.5 font-semibold">Campaign</th>
                <th className="px-3 py-2.5 font-semibold">Type</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 font-semibold">Next step</th>
                <th className="px-3 py-2.5 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {list.map((a) => {
                const na = nextAction(a);
                const isOpen = expanded.has(a.id);
                return (
                  <Fragment key={a.id}>
                    <tr
                      className="cursor-pointer border-b border-slate-50 align-top hover:bg-slate-50/60"
                      onClick={() => openReview(a.id)}
                      title="Open review page"
                    >
                      <td className="px-2 py-2.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleRow(a.id);
                          }}
                          className="text-slate-400 hover:text-slate-700"
                          title="Show details"
                        >
                          {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <span className="font-mono text-xs text-slate-500">{orderRef(a.ref_no, "order")}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          {a.creator?.profile_image ? (
                            <img src={a.creator.profile_image} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-slate-200" />
                          ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-600">
                              {(a.creator?.full_name ?? "?").charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-ink">
                              {a.creator?.full_name ?? "Creator"}
                              {a.creator?.instagram_username ? <span className="ml-1 font-normal text-slate-400">@{a.creator.instagram_username}</span> : null}
                            </p>
                            <p className="truncate text-xs text-slate-400">{a.creator?.email ?? "no email"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-ink">{a.campaign?.title}</p>
                        <p className="text-xs text-slate-400">
                          {a.campaign?.brand_name}
                          {a.campaign?.campaign_code ? ` · ${a.campaign.campaign_code}` : ""}
                        </p>
                      </td>
                      <td className="px-3 py-2.5">
                        {a.campaign?.campaign_type ? <Badge variant={TYPE_VARIANT[a.campaign.campaign_type]}>{TYPE_LABEL[a.campaign.campaign_type]}</Badge> : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col gap-1.5">
                          <Badge variant={STATUS_VARIANT[a.status]}>{statusLabel(a.status)}</Badge>
                          {isCampaignClosed(a.campaign) && <Badge variant="danger">Campaign closed</Badge>}
                          <StageTracker type={a.campaign?.campaign_type} status={a.status} />
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col gap-1">
                          <TurnPill who={na.who} />
                          <span className="text-xs font-medium text-slate-500">{na.text}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            variant={na.who === "employee" ? "default" : "outline"}
                            onClick={() => openReview(a.id)}
                          >
                            {na.who === "employee" ? "Review & act" : "View"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-slate-100 bg-slate-50/40">
                        <td colSpan={8} className="px-4 py-3">
                          <AppDetail app={a} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}

// Inline content-review actions (moved here from the old Submissions page):
// approve / request revision / reject, send back to the reviewing employee,
// tag the submission, and release the creator's payment.
function SubmissionReviewPanel({ app }: { app: Application }) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const sub = app.submissions?.[0];
  const [showPay, setShowPay] = useState(false);
  const [showSendBack, setShowSendBack] = useState(false);

  const logEvent = async (message: string) => {
    try {
      await supabase.rpc("log_review_event", { p_application: app.id, p_submission: sub?.id ?? null, p_message: message });
    } catch {
      /* ignore logging errors */
    }
  };

  const review = useMutation({
    mutationFn: async (status: ReviewStatus) => {
      if (!sub) return;
      const { error } = await supabase
        .from("campaign_submissions")
        .update({ review_status: status, reviewed_by: profile?.id, reviewed_at: new Date().toISOString() })
        .eq("id", sub.id);
      if (error) throw error;
      const appStatus = status === "approved" ? "review" : status === "revision" ? "content_creation" : "rejected";
      const { error: appErr } = await supabase.from("applications").update({ status: appStatus }).eq("id", app.id);
      if (appErr) throw appErr;
      await logEvent(status === "approved" ? "Approved submission" : status === "revision" ? "Requested revision" : "Rejected submission");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["applications"] });
      qc.invalidateQueries({ queryKey: ["review-stats"] });
      qc.invalidateQueries({ queryKey: ["reviewer-workload"] });
    },
  });

  const tag = useMutation({
    mutationFn: async (review_tag: string | null) => {
      if (!sub) return;
      const { error } = await supabase.from("campaign_submissions").update({ review_tag }).eq("id", sub.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["applications"] }),
  });

  const sendBack = useMutation({
    mutationFn: async ({ review_tag, review_note }: { review_tag: string | null; review_note: string | null }) => {
      if (!sub) return;
      const { error } = await supabase
        .from("campaign_submissions")
        .update({ review_status: "pending", review_tag, review_note, claimed_by: null, claimed_at: null })
        .eq("id", sub.id);
      if (error) throw error;
      const { error: appErr } = await supabase.from("applications").update({ status: "submitted" }).eq("id", app.id);
      if (appErr) throw appErr;
      if (review_note && review_note.trim()) {
        await supabase.from("review_notes").insert({
          application_id: app.id,
          submission_id: sub.id,
          author_id: profile?.id,
          note: `Sent back for re-review${review_tag ? ` (${review_tag})` : ""}: ${review_note.trim()}`,
        });
      }
    },
    onSuccess: () => {
      setShowSendBack(false);
      qc.invalidateQueries({ queryKey: ["applications"] });
      qc.invalidateQueries({ queryKey: ["review-stats"] });
      qc.invalidateQueries({ queryKey: ["review-notes"] });
    },
  });

  if (!sub) return null;

  const subWithApp = { ...sub, application: app } as CampaignSubmission;
  const paid = app.status === "completed";

  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <ClipboardList size={13} /> Content review
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {sub.review_status === "pending" && (
          <>
            <Button variant="success" size="sm" onClick={() => review.mutate("approved")} disabled={review.isPending}>Approve</Button>
            <Button variant="outline" size="sm" onClick={() => review.mutate("revision")} disabled={review.isPending}>Revision</Button>
            <Button variant="danger" size="sm" onClick={() => review.mutate("rejected")} disabled={review.isPending}>Reject</Button>
            {isAdmin && (
              <Button variant="outline" size="sm" className="border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => setShowSendBack(true)}>↩ Send back</Button>
            )}
          </>
        )}
        {sub.review_status === "approved" && isAdmin && (
          paid ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><IndianRupee size={12} /> Paid</span>
          ) : (
            <>
              <Button variant="outline" size="sm" className="border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => setShowSendBack(true)}>↩ Send back to review</Button>
              <Button size="sm" onClick={() => setShowPay(true)}><IndianRupee size={14} /> Release Payment</Button>
            </>
          )
        )}
        {sub.review_status !== "pending" && (
          <Badge variant={sub.review_status === "approved" ? "success" : sub.review_status === "rejected" ? "danger" : "info"}>{sub.review_status}</Badge>
        )}
      </div>

      <div className="mt-3 border-t border-slate-100 pt-3">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Status tag</p>
        <div className="flex flex-wrap gap-2">
          {REVIEW_TAGS.map((t) => {
            const active = sub.review_tag === t.value;
            return (
              <button
                key={t.value}
                onClick={() => tag.mutate(active ? null : t.value)}
                className={
                  active
                    ? t.variant === "success"
                      ? "rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white"
                      : t.variant === "danger"
                      ? "rounded-full bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white"
                      : "rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white"
                    : "rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                }
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {showPay && (
        <ReleasePaymentModal
          submission={subWithApp}
          onClose={() => setShowPay(false)}
          onDone={() => {
            setShowPay(false);
            qc.invalidateQueries({ queryKey: ["applications"] });
            qc.invalidateQueries({ queryKey: ["review-stats"] });
          }}
        />
      )}
      {showSendBack && (
        <SendBackModal
          submission={subWithApp}
          pending={sendBack.isPending}
          onClose={() => setShowSendBack(false)}
          onConfirm={(review_tag, review_note) => sendBack.mutate({ review_tag, review_note })}
        />
      )}
    </div>
  );
}

function AppDetail({ app: a }: { app: Application }) {
  const na = nextAction(a);
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
        <StageTracker type={a.campaign?.campaign_type} status={a.status} />
        <div className="flex items-center gap-2">
          <TurnPill who={na.who} />
          <span className="text-xs text-slate-500">{na.text}</span>
        </div>
      </div>
      {isCampaignClosed(a.campaign) && a.status !== "completed" && a.status !== "rejected" && (
        <div className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <b>Campaign closed.</b> No new applicants are accepted, but this application is already in progress — finish it out to completion as normal.
        </div>
      )}
      {a.actor?.full_name && (
        <p className="text-xs text-slate-400">
          Last action by <span className="font-semibold text-slate-600">{a.actor.full_name}</span>
          {a.last_action_at ? ` · ${formatDate(a.last_action_at)}` : ""}
        </p>
      )}
      {a.campaign?.product_url ? (
        <a href={a.campaign.product_url} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary-600 hover:underline">
          Open product link ↗
        </a>
      ) : (
        <p className="text-xs text-amber-500">No product link set</p>
      )}
      <p className="text-xs text-slate-400">
        Applied {formatDate(a.applied_at)} · <span className="font-mono">{orderRef(a.ref_no, "order")}</span>
      </p>
      {(a.seller_tracking_id || a.seller_tracking_code) && (
        <p className="text-xs text-slate-500">
          <span className="font-semibold uppercase tracking-wide text-slate-400">Shipping:</span>{" "}
          <span className="capitalize">{a.seller_shipment_status ?? "pending"}</span>
          {a.seller_tracking_id ? ` · Track: ${a.seller_tracking_id}` : ""}
          {a.seller_tracking_code ? ` · Code: ${a.seller_tracking_code}` : ""}
        </p>
      )}
      {a.purchase_proof ? <PurchaseProof app={a} /> : null}
      {a.delivery_photo_url ? <DeliveryPhoto app={a} /> : null}
      <PaidFlowInfo app={a} />
      <SubmittedContent app={a} />
      <SentBackBanner app={a} />
      <SubmissionReviewPanel app={a} />
      <div className="pt-1">
        <CreatorInsights creator={a.creator} />
      </div>
      <ReelEngagementEditor app={a} />
      <ReviewNotesThread applicationId={a.id} submissionId={a.submissions?.[0]?.id} />
    </div>
  );
}

function PaidFlowInfo({ app }: { app: Application }) {
  const isPaid = app.campaign?.campaign_type === "paid";
  const { data: draftUrl } = useQuery({
    queryKey: ["draft-video", app.id],
    queryFn: () => signedUrl("submission-videos", app.draft_video_url),
    enabled: !!app.draft_video_url,
  });
  if (!isPaid) return null;
  if (!app.draft_video_url && !app.reel_link && !app.draft_feedback && !app.shipped_at) return null;

  return (
    <div className="mt-2 space-y-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Paid campaign</p>
      {app.shipped_at ? (
        <p className="text-xs text-slate-500">
          Shipped {formatDate(app.shipped_at)}
          {app.draft_deadline ? ` · draft due ${formatDate(app.draft_deadline)}` : ""}
        </p>
      ) : null}
      {draftUrl ? (
        <a href={draftUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100">
          ▶ View draft video ↗
        </a>
      ) : null}
      {app.draft_feedback ? (
        <p className="text-xs text-rose-600">Correction sent: “{app.draft_feedback}”</p>
      ) : null}
      {app.reel_link ? (
        <a href={app.reel_link} target="_blank" rel="noreferrer" className="block text-xs font-medium text-primary-600 hover:underline">
          Posted reel link ↗
        </a>
      ) : null}
    </div>
  );
}

function ReelEngagementEditor({ app }: { app: Application }) {
  const qc = useQueryClient();
  const type = app.campaign?.campaign_type;
  const isBarterOrPaid = type === "barter" || type === "paid";
  const [value, setValue] = useState(app.reel_engagement != null ? String(app.reel_engagement) : "");
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("applications")
        .update({ reel_engagement: value.trim() ? Number(value) : null })
        .eq("id", app.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["applications"] });
      qc.invalidateQueries({ queryKey: ["seller-applications"] });
    },
  });
  // Only relevant once a reel exists / creator has posted.
  if (!isBarterOrPaid) return null;
  if (!app.reel_link && !["posted", "link_submitted", "submitted", "review", "completed"].includes(app.status))
    return null;
  return (
    <div className="mt-2 flex items-center gap-2">
      <span className="text-xs font-medium text-slate-500">Reel engagement:</span>
      <Input
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="likes + comments"
        className="h-8 w-36 py-0 text-xs"
      />
      <Button size="sm" variant="outline" disabled={save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? "Saving…" : save.isSuccess ? "Saved ✓" : "Save"}
      </Button>
    </div>
  );
}

function SentBackBanner({ app }: { app: Application }) {
  // Only meaningful while the item is back in the employee's first-stage queue.
  if (app.status !== "submitted") return null;
  const sub = app.submissions?.[0];
  const tag = sub?.review_tag;
  const note = sub?.review_note;
  if (!tag && !note) return null;
  const tagLabel: Record<string, string> = {
    correct: "Correct",
    blocked: "Blocked",
    wrong_seller_feedback: "Wrong Brand Feedback",
  };
  return (
    <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700">
      <span className="font-semibold">↩ Sent back by admin</span>
      {tag ? <span className="ml-1 font-medium">· {tagLabel[tag] ?? tag}</span> : null}
      {note ? <p className="mt-0.5 font-medium text-rose-600">“{note}”</p> : null}
    </div>
  );
}

function SubmittedContent({ app }: { app: Application }) {
  const sub = app.submissions?.[0];
  const [preview, setPreview] = useState<string | null>(null);
  const { data: shotUrls } = useQuery({
    queryKey: ["submission-screenshots", sub?.id],
    queryFn: async () =>
      (await Promise.all((sub?.screenshots ?? []).map((p) => signedUrl("submission-screenshots", p)))).filter(
        (u): u is string => !!u
      ),
    enabled: !!sub && (sub.screenshots?.length ?? 0) > 0,
  });
  if (!sub) return null;
  const links: { url: string | null; label: string }[] = [
    { url: sub.reel_url, label: "Reel" },
    { url: sub.post_url, label: "Post" },
    { url: sub.story_url, label: "Story" },
    { url: sub.youtube_url, label: "YouTube" },
  ];
  const present = links.filter((l) => l.url);
  const hasScreens = (sub.screenshots?.length ?? 0) > 0;
  if (present.length === 0 && !sub.notes && !hasScreens) return null;

  return (
    <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Submitted content</p>
      {present.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {present.map((l) => (
            <a
              key={l.label}
              href={l.url as string}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-xs font-medium text-blue-600 ring-1 ring-blue-200 hover:bg-blue-100"
            >
              {l.label} ↗
            </a>
          ))}
        </div>
      ) : null}
      {hasScreens ? (
        <div className="mt-1.5 flex flex-wrap gap-2">
          {(shotUrls ?? []).map((url, i) => (
            <button key={i} onClick={() => setPreview(url)}>
              <img src={url} alt={`review ${i + 1}`} className="h-14 w-14 rounded-lg object-cover ring-1 ring-blue-200" />
            </button>
          ))}
          {!shotUrls ? <span className="text-xs text-slate-400">Loading screenshots…</span> : null}
        </div>
      ) : null}
      {sub.notes ? <p className="mt-1 text-xs text-slate-500">“{sub.notes}”</p> : null}
      <Modal open={!!preview} onClose={() => setPreview(null)} title="Review screenshot">
        {preview && <img src={preview} alt="" className="max-h-[70vh] w-full rounded-xl object-contain" />}
      </Modal>
    </div>
  );
}

function DeliveryPhoto({ app }: { app: Application }) {
  const [open, setOpen] = useState(false);
  const { data: url } = useQuery({
    queryKey: ["delivery-photo", app.id],
    queryFn: () => signedUrl("purchase-orders", app.delivery_photo_url),
    enabled: !!app.delivery_photo_url,
  });

  return (
    <div className="mt-2 flex items-center gap-3">
      {url ? (
        <button onClick={() => setOpen(true)}>
          <img src={url} alt="delivered" className="h-14 w-14 rounded-lg object-cover ring-1 ring-slate-200" />
        </button>
      ) : null}
      <div className="text-xs">
        <p className="font-semibold text-sky-600">Delivered photo</p>
        {app.delivery_photo_at ? (
          <p className="text-slate-400">{formatDate(app.delivery_photo_at)}</p>
        ) : null}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Delivered Photo">
        {url && <img src={url} alt="" className="max-h-[70vh] w-full rounded-xl object-contain" />}
      </Modal>
    </div>
  );
}

function PurchaseProof({ app }: { app: Application }) {
  const [open, setOpen] = useState(false);
  const { data: url } = useQuery({
    queryKey: ["purchase-proof", app.id],
    queryFn: () => signedUrl("purchase-orders", app.purchase_proof),
    enabled: !!app.purchase_proof,
  });
  const isVideo = /\.(mp4|mov|m4v|webm|avi|3gp)$/i.test(app.purchase_proof ?? "");

  return (
    <div className="mt-2 flex items-center gap-3">
      {url ? (
        <button onClick={() => setOpen(true)} className="relative">
          {isVideo ? (
            <>
              <video src={url} className="h-14 w-14 rounded-lg object-cover ring-1 ring-slate-200" muted />
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-white">▶</span>
            </>
          ) : (
            <img src={url} alt="Order screenshot" className="h-14 w-14 rounded-lg object-cover ring-1 ring-slate-200" />
          )}
        </button>
      ) : null}
      <div className="text-xs">
        <p className="font-semibold text-emerald-600">Purchase confirmed</p>
        {app.purchase_amount ? (
          <p className="text-slate-500">Paid {formatCurrency(app.purchase_amount)}</p>
        ) : null}
        {app.product_received_at ? (
          <p className="text-slate-400">{formatDate(app.product_received_at)}</p>
        ) : null}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={isVideo ? "Purchase Video" : "Order screenshot"}>
        {url &&
          (isVideo ? (
            <video src={url} controls className="max-h-[70vh] w-full rounded-xl bg-black object-contain" />
          ) : (
            <img src={url} alt="Order screenshot" className="max-h-[70vh] w-full rounded-xl object-contain" />
          ))}
      </Modal>
    </div>
  );
}
