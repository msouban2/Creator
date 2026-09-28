import { Fragment, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  Video,
  Store,
  Users,
  Film,
  UploadCloud,
  CheckCircle2,
  Clock,
  XCircle,
  Search,
  Download,
  Eye,
  Calendar,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Application, CampaignType } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Types & constants                                                   */
/* ------------------------------------------------------------------ */

type WorkTab = "review" | "creator";
type Kind = "order_ss" | "review_rec" | "seller_fb" | "creators" | "draft_vid" | "live_up";
type EventState = "approved" | "pending" | "rejected" | "revision";
type PeriodKey = "today" | "7d" | "30d" | "month" | "year" | "all" | "custom";

interface KindMeta {
  key: Kind;
  label: string; // column label
  cardLabel: string; // stat card title
  icon: typeof FileText;
  head: string; // group-header background tint
}

const REVIEW_KINDS: KindMeta[] = [
  { key: "order_ss", label: "Order Screenshots", cardLabel: "Order Screenshot Review", icon: FileText, head: "bg-rose-50 text-rose-600" },
  { key: "review_rec", label: "Review Recordings", cardLabel: "Review Recording Review", icon: Video, head: "bg-indigo-50 text-indigo-600" },
  { key: "seller_fb", label: "Seller Feedbacks", cardLabel: "Seller Feedback Review", icon: Store, head: "bg-emerald-50 text-emerald-600" },
];

const CREATOR_KINDS: KindMeta[] = [
  { key: "creators", label: "Creators", cardLabel: "Creator Handling", icon: Users, head: "bg-rose-50 text-rose-600" },
  { key: "draft_vid", label: "Draft Videos", cardLabel: "Draft Video Review", icon: Film, head: "bg-indigo-50 text-indigo-600" },
  { key: "live_up", label: "Live Uploads", cardLabel: "Live Upload Review", icon: UploadCloud, head: "bg-emerald-50 text-emerald-600" },
];

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
  { key: "custom", label: "Custom range" },
];

const TYPE_LABEL: Record<CampaignType, string> = { barter: "Barter", reimbursement: "Reimbursement", paid: "Paid" };
const TYPE_VARIANT: Record<CampaignType, "warning" | "info" | "success"> = { barter: "warning", reimbursement: "info", paid: "success" };
const UNASSIGNED = "__unassigned";

/* ------------------------------------------------------------------ */
/* Derived shapes                                                      */
/* ------------------------------------------------------------------ */

interface StatEvent {
  applicationId: string;
  kind: Kind;
  state: EventState;
  ownerId: string; // manual assignee, else who acted, else UNASSIGNED
  assignedId: string | null; // manual assignment only (null = auto pool)
  date: string | null; // when the work happened
  brand: string;
  campaignId: string;
  campaignTitle: string;
  campaignCode: string;
  asin: string;
  productName: string;
  creator: string;
  creatorHandle: string;
  type: CampaignType;
}

// Human label for the queue "Submission Type" column.
const SUBMISSION_LABEL: Record<Kind, string> = {
  order_ss: "Order Proof",
  review_rec: "Review Video",
  seller_fb: "Feedback Form",
  creators: "Creator",
  draft_vid: "Draft Video",
  live_up: "Live Upload",
};

interface Employee {
  id: string;
  full_name: string | null;
  email: string | null;
  review_types: string[] | null;
}

const emptyCounts = () => ({ approved: 0, pending: 0, rejected: 0, revision: 0 });
type Counts = ReturnType<typeof emptyCounts>;
const checkedOf = (c: Counts) => c.approved + c.pending + c.rejected + c.revision;
const pendingOf = (c: Counts) => c.pending + c.revision; // Revision shown under Pending column

/* ------------------------------------------------------------------ */
/* Date helpers                                                        */
/* ------------------------------------------------------------------ */

function periodStart(key: PeriodKey): Date | null {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  switch (key) {
    case "today":
      return d;
    case "7d":
      d.setDate(d.getDate() - 6);
      return d;
    case "30d":
      d.setDate(d.getDate() - 29);
      return d;
    case "month":
      d.setDate(1);
      return d;
    case "year":
      d.setMonth(0, 1);
      return d;
    default:
      return null; // all / custom handled separately
  }
}

function isToday(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

/* ------------------------------------------------------------------ */
/* Event derivation (real data)                                        */
/* ------------------------------------------------------------------ */

const ORDER_STAGES = ["ordered", "order_approved", "product_received", "content_creation", "submitted", "review", "payment_in_progress", "completed"];

function orderState(a: Application): EventState {
  if (a.status === "rejected") return "rejected";
  const i = ORDER_STAGES.indexOf(a.status);
  return i >= 1 ? "approved" : "pending";
}
function draftState(a: Application): EventState {
  if (a.status === "rejected") return "rejected";
  if (a.status === "draft_revision") return "revision";
  if (["draft_approved", "posted", "link_submitted", "completed"].includes(a.status)) return "approved";
  return "pending";
}
function liveState(a: Application): EventState {
  if (a.status === "rejected") return "rejected";
  if (["completed", "posted"].includes(a.status)) return "approved";
  return "pending";
}
function creatorState(a: Application): EventState {
  if (a.status === "rejected") return "rejected";
  if (a.status === "completed") return "approved";
  return "pending";
}
function reviewRecState(a: Application, status: string | undefined): EventState {
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  if (status === "revision") return "revision";
  // The review page approves by advancing the application without touching
  // review_status, so fall back to the application once it's past that gate.
  if (a.status === "rejected") return "rejected";
  if (a.status === "review" || a.status === "completed") return "approved";
  return "pending";
}

function deriveEvents(apps: Application[], assignMap: Map<string, string | null>): StatEvent[] {
  const out: StatEvent[] = [];
  for (const a of apps) {
    const c = a.campaign;
    if (!c) continue;
    const type = (c.campaign_type ?? "reimbursement") as CampaignType;
    const handle = (a.creator as { instagram_username?: string | null } | undefined)?.instagram_username ?? "";
    const base = {
      applicationId: a.id,
      brand: c.brand_name ?? c.seller_name ?? "—",
      campaignId: c.id,
      campaignTitle: c.title ?? "—",
      campaignCode: c.campaign_code ?? "",
      asin: c.asin ?? "",
      productName: c.product_name ?? c.title ?? "—",
      creator: a.creator?.full_name ?? "—",
      creatorHandle: handle,
      type,
    };
    const actor = a.last_action_by ?? "";
    const actedAt = a.last_action_at ?? a.completed_at ?? a.applied_at;
    const sub = a.submissions?.[0];

    // Resolve the owner: a manual assignment wins over whoever last acted.
    const push = (kind: Kind, state: EventState, actedOwner: string, date: string | null) => {
      const assigned = assignMap.get(`${a.id}:${kind}`) ?? null;
      out.push({ ...base, kind, state, date, assignedId: assigned, ownerId: assigned ?? actedOwner ?? UNASSIGNED });
    };

    // --- Creator / Campaign work ---
    push("creators", creatorState(a), actor || UNASSIGNED, actedAt);
    if (a.draft_video_url) push("draft_vid", draftState(a), actor || UNASSIGNED, actedAt);
    if (a.reel_link) push("live_up", liveState(a), actor || UNASSIGNED, actedAt);

    // --- Review work ---
    // Order screenshot: reimbursement orders (purchase proof) or any order that progressed.
    if (type === "reimbursement" || a.purchase_proof) {
      push("order_ss", orderState(a), actor || UNASSIGNED, actedAt);
    }
    // Review recording: the content submission.
    if (sub) {
      const owner = sub.reviewed_by ?? sub.claimed_by ?? actor ?? "";
      push("review_rec", reviewRecState(a, sub.review_status), owner || UNASSIGNED, sub.reviewed_at ?? sub.created_at);
    }
    // Seller feedback.
    const sellerFb = !!a.seller_feedback || !!sub?.seller_feedback_screenshot || !!sub?.seller_feedback_video;
    if (sellerFb) {
      push("seller_fb", a.status === "rejected" ? "rejected" : "approved", actor || UNASSIGNED, actedAt);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Small UI atoms                                                      */
/* ------------------------------------------------------------------ */

function csvExport(filename: string, rows: Record<string, string | number>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
        active ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      )}
    >
      {children}
    </button>
  );
}

function initials(name: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function EmployeeStats() {
  const [tab, setTab] = useState<WorkTab>("review");
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [typeFilter, setTypeFilter] = useState<Kind | "all">("all");
  const [statusFilter, setStatusFilter] = useState<EventState | "all">("all");
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const qc = useQueryClient();
  const navigate = useNavigate();
  const kinds = tab === "review" ? REVIEW_KINDS : CREATOR_KINDS;

  const { data: employees = [] } = useQuery({
    queryKey: ["emp-stats-employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, review_types")
        .eq("role", "employee")
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as Employee[];
    },
  });

  const { data: apps = [], isLoading } = useQuery({
    queryKey: ["emp-stats-apps"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select(
          "id, status, purchase_proof, draft_video_url, reel_link, seller_feedback, last_action_by, last_action_at, applied_at, completed_at," +
            " creator:profiles!creator_id(id, full_name, instagram_username)," +
            " campaign:campaigns(id, title, brand_name, seller_name, campaign_type, campaign_code, asin, product_name)," +
            " submissions:campaign_submissions(id, review_status, reviewed_by, reviewed_at, created_at, claimed_by, seller_feedback_video, seller_feedback_screenshot)"
        )
        .order("applied_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as unknown as Application[];
    },
  });

  const empMap = useMemo(() => {
    const m = new Map<string, Employee>();
    for (const e of employees) m.set(e.id, e);
    return m;
  }, [employees]);

  const { data: assignments = [] } = useQuery({
    queryKey: ["emp-stats-assignments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("work_assignments").select("application_id, kind, assigned_to");
      if (error) throw error;
      return (data ?? []) as { application_id: string; kind: string; assigned_to: string | null }[];
    },
  });

  const assignMap = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const a of assignments) m.set(`${a.application_id}:${a.kind}`, a.assigned_to);
    return m;
  }, [assignments]);

  const assign = useMutation({
    mutationFn: async ({ applicationId, kind, assignee }: { applicationId: string; kind: Kind; assignee: string | null }) => {
      const { error } = await supabase.rpc("admin_assign_work", { p_application: applicationId, p_kind: kind, p_assignee: assignee });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["emp-stats-assignments"] }),
  });

  const allEvents = useMemo(() => deriveEvents(apps, assignMap), [apps, assignMap]);

  // Brand & campaign option lists (from data).
  const brandOptions = useMemo(() => Array.from(new Set(allEvents.map((e) => e.brand).filter(Boolean))).sort(), [allEvents]);
  const campaignOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of allEvents) if (e.campaignId) m.set(e.campaignId, e.campaignTitle);
    return Array.from(m, ([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title));
  }, [allEvents]);

  // Apply all filters (except employee, which is applied where noted).
  const filtered = useMemo(() => {
    const from = period === "custom" ? (customFrom ? new Date(customFrom) : null) : periodStart(period);
    const to = period === "custom" && customTo ? new Date(new Date(customTo).setHours(23, 59, 59, 999)) : null;
    const q = search.trim().toLowerCase();
    const tabKinds = new Set(kinds.map((k) => k.key));
    return allEvents.filter((e) => {
      if (!tabKinds.has(e.kind)) return false;
      if (typeFilter !== "all" && e.kind !== typeFilter) return false;
      if (statusFilter !== "all" && e.state !== statusFilter) return false;
      if (brandFilter !== "all" && e.brand !== brandFilter) return false;
      if (campaignFilter !== "all" && e.campaignId !== campaignFilter) return false;
      if (from || to) {
        if (!e.date) return false;
        const d = new Date(e.date);
        if (from && d < from) return false;
        if (to && d > to) return false;
      }
      if (q) {
        const hay = `${e.creator} ${e.campaignTitle} ${e.campaignCode} ${e.asin} ${e.brand}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allEvents, kinds, typeFilter, statusFilter, brandFilter, campaignFilter, period, customFrom, customTo, search]);

  // Employee-scoped events (respects the Employee dropdown for cards + rows).
  const scoped = useMemo(
    () => (employeeFilter === "all" ? filtered : filtered.filter((e) => e.ownerId === employeeFilter)),
    [filtered, employeeFilter]
  );

  // Stat cards: per-kind grand totals + top employee.
  const cards = useMemo(() => {
    return kinds.map((meta) => {
      const evs = scoped.filter((e) => e.kind === meta.key);
      const counts = emptyCounts();
      const byOwner = new Map<string, number>();
      for (const e of evs) {
        counts[e.state] += 1;
        if (e.ownerId !== UNASSIGNED) byOwner.set(e.ownerId, (byOwner.get(e.ownerId) ?? 0) + 1);
      }
      let topOwner = "";
      let topN = 0;
      for (const [id, n] of byOwner) {
        if (n > topN) {
          topN = n;
          topOwner = id;
        }
      }
      return { meta, counts, assignee: topOwner ? empMap.get(topOwner)?.full_name ?? "—" : "—" };
    });
  }, [kinds, scoped, empMap]);

  // Employee Overview rows.
  const rows = useMemo(() => {
    const map = new Map<string, { emp: Employee | null; kinds: Record<Kind, Counts>; today: number }>();
    const ensure = (id: string) => {
      let r = map.get(id);
      if (!r) {
        r = {
          emp: empMap.get(id) ?? null,
          kinds: { order_ss: emptyCounts(), review_rec: emptyCounts(), seller_fb: emptyCounts(), creators: emptyCounts(), draft_vid: emptyCounts(), live_up: emptyCounts() },
          today: 0,
        };
        map.set(id, r);
      }
      return r;
    };
    for (const e of scoped) {
      const r = ensure(e.ownerId);
      r.kinds[e.kind][e.state] += 1;
      if (isToday(e.date)) r.today += 1;
    }
    const list = Array.from(map, ([id, v]) => ({ id, ...v }));
    // Named employees first, sorted by total work; Unassigned last.
    const totalOf = (r: (typeof list)[number]) => kinds.reduce((s, k) => s + checkedOf(r.kinds[k.key]), 0);
    return list
      .filter((r) => totalOf(r) > 0)
      .sort((a, b) => {
        if (a.id === UNASSIGNED) return 1;
        if (b.id === UNASSIGNED) return -1;
        return totalOf(b) - totalOf(a);
      });
  }, [scoped, empMap, kinds]);

  // Queue rows (bottom monitoring/assignment list), newest first + paginated.
  const queueAll = useMemo(() => {
    return [...scoped].sort((a, b) => {
      const ta = a.date ? new Date(a.date).getTime() : 0;
      const tb = b.date ? new Date(b.date).getTime() : 0;
      return tb - ta;
    });
  }, [scoped]);

  const totalPages = Math.max(1, Math.ceil(queueAll.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const queuePage = useMemo(() => queueAll.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), [queueAll, safePage]);

  const rowTotal = (r: (typeof rows)[number]) => {
    const t = emptyCounts();
    for (const k of kinds) {
      const c = r.kinds[k.key];
      t.approved += c.approved;
      t.pending += c.pending;
      t.rejected += c.rejected;
      t.revision += c.revision;
    }
    return t;
  };

  const onExport = () => {
    const data = rows.map((r) => {
      const rec: Record<string, string | number> = {
        Employee: r.emp?.full_name ?? (r.id === UNASSIGNED ? "Unassigned" : "—"),
        Email: r.emp?.email ?? "",
        "Assigned Type": (r.emp?.review_types ?? []).map((t) => TYPE_LABEL[t as CampaignType] ?? t).join(" / ") || "—",
      };
      for (const k of kinds) {
        const c = r.kinds[k.key];
        rec[`${k.label} Checked`] = checkedOf(c);
        rec[`${k.label} Approved`] = c.approved;
        rec[`${k.label} Pending`] = pendingOf(c);
        rec[`${k.label} Rejected`] = c.rejected;
      }
      const tot = rowTotal(r);
      rec["Total Checked"] = checkedOf(tot);
      rec["Total Approved"] = tot.approved;
      rec["Total Pending"] = pendingOf(tot);
      rec["Total Rejected"] = tot.rejected;
      rec["Today"] = r.today;
      return rec;
    });
    csvExport(`employee-stats-${tab}-${period}.csv`, data);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-ink">Employee Stats</h1>
          <p className="text-sm text-slate-400">Track team performance and manage review checks (Order / Review / Seller feedback).</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
          <Calendar size={15} className="text-slate-400" />
          <select value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)} className="bg-transparent text-sm font-semibold text-ink outline-none">
            {PERIODS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Work tabs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(
          [
            { key: "review" as WorkTab, title: "Review Work", sub: "Order / Review / Seller feedback", icon: FileText },
            { key: "creator" as WorkTab, title: "Creator / Campaign Work", sub: "Creators / Draft videos / Live uploads", icon: Users },
          ]
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              setTypeFilter("all");
            }}
            className={cn(
              "flex items-center gap-3 rounded-2xl border-2 bg-white p-4 text-left transition-colors",
              tab === t.key ? "border-primary bg-primary-50/40" : "border-slate-100 hover:border-slate-200"
            )}
          >
            <span className={cn("flex h-11 w-11 items-center justify-center rounded-xl", tab === t.key ? "bg-primary text-white" : "bg-slate-100 text-slate-500")}>
              <t.icon size={20} />
            </span>
            <span>
              <span className="block text-sm font-bold text-ink">{t.title}</span>
              <span className="block text-xs text-slate-400">{t.sub}</span>
            </span>
          </button>
        ))}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {cards.map(({ meta, counts, assignee }) => (
          <div key={meta.key} className="rounded-2xl border border-slate-100 bg-white p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", meta.head)}>
                  <meta.icon size={18} />
                </span>
                <div>
                  <p className="text-sm font-bold text-ink">{meta.cardLabel}</p>
                  <p className="text-xs text-slate-400">
                    Assigned to <span className="font-semibold text-slate-600">{assignee}</span>
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Total Checked</p>
                <p className="text-2xl font-black text-ink">{checkedOf(counts)}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-emerald-50 py-2">
                <p className="flex items-center justify-center gap-1 text-lg font-black text-emerald-600">
                  <CheckCircle2 size={14} /> {counts.approved}
                </p>
                <p className="text-[11px] font-medium text-emerald-600/80">Approved</p>
              </div>
              <div className="rounded-xl bg-amber-50 py-2">
                <p className="flex items-center justify-center gap-1 text-lg font-black text-amber-600">
                  <Clock size={14} /> {pendingOf(counts)}
                </p>
                <p className="text-[11px] font-medium text-amber-600/80">Pending</p>
              </div>
              <div className="rounded-xl bg-rose-50 py-2">
                <p className="flex items-center justify-center gap-1 text-lg font-black text-rose-600">
                  <XCircle size={14} /> {counts.rejected}
                </p>
                <p className="text-[11px] font-medium text-rose-600/80">Rejected</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Employee Overview */}
      <div className="rounded-2xl border border-slate-100 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
          <div>
            <h2 className="text-lg font-bold text-ink">Employee Overview</h2>
            <p className="text-xs text-slate-400">Detailed breakdown of each employee&apos;s work and assigned tasks.</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {PERIODS.filter((p) => p.key !== "all").map((p) => (
              <Chip key={p.key} active={period === p.key} onClick={() => setPeriod(p.key)}>
                {p.label}
              </Chip>
            ))}
            <Button variant="outline" size="sm" onClick={onExport} className="ml-1">
              <Download size={14} /> Export CSV
            </Button>
          </div>
        </div>

        {period === "custom" ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3 text-sm">
            <span className="text-slate-500">From</span>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1" />
            <span className="text-slate-500">To</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1" />
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th rowSpan={2} className="px-4 py-2 align-bottom">Employee</th>
                <th rowSpan={2} className="px-3 py-2 align-bottom">Assigned Type</th>
                {kinds.map((k) => (
                  <th key={k.key} colSpan={4} className={cn("px-2 py-1.5 text-center font-bold", k.head)}>
                    {k.label}
                  </th>
                ))}
                <th colSpan={4} className="bg-slate-50 px-2 py-1.5 text-center font-bold text-slate-500">Total</th>
                <th rowSpan={2} className="px-3 py-2 align-bottom text-center">Today&apos;s Work</th>
                <th rowSpan={2} className="px-3 py-2 align-bottom text-center">Action</th>
              </tr>
              <tr className="border-b border-slate-100 text-[10px] uppercase text-slate-400">
                {[...kinds.map((k) => k.key), "total"].map((k) => (
                  <Fragment key={k}>
                    <th className="px-1 py-1.5 text-center font-semibold">Chk</th>
                    <th className="px-1 py-1.5 text-center font-semibold text-emerald-600">Apr</th>
                    <th className="px-1 py-1.5 text-center font-semibold text-amber-600">Pen</th>
                    <th className="px-1 py-1.5 text-center font-semibold text-rose-600">Rej</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={kinds.length * 4 + 8} className="px-4 py-10 text-center text-slate-400">Loading…</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={kinds.length * 4 + 8} className="px-4 py-10 text-center text-slate-400">No work recorded for these filters.</td>
                </tr>
              ) : (
                rows.map((r) => {
                  const tot = rowTotal(r);
                  const name = r.emp?.full_name ?? (r.id === UNASSIGNED ? "Unassigned" : "—");
                  return (
                    <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary">{initials(r.emp?.full_name ?? null)}</span>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-ink">{name}</p>
                            {r.emp?.email ? <p className="truncate text-[11px] text-slate-400">{r.emp.email}</p> : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {(r.emp?.review_types ?? []).length ? (
                          <div className="flex flex-wrap gap-1">
                            {(r.emp?.review_types ?? []).map((t) => (
                              <Badge key={t} variant={TYPE_VARIANT[t as CampaignType] ?? "default"}>{TYPE_LABEL[t as CampaignType] ?? t}</Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      {kinds.map((k) => {
                        const c = r.kinds[k.key];
                        return (
                          <CountCells key={k.key} c={c} />
                        );
                      })}
                      <CountCells c={tot} strong />
                      <td className="px-3 py-3 text-center">
                        <span className="rounded-lg bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-600">{r.today} checked</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Button variant="ghost" size="sm" onClick={() => setEmployeeFilter(r.id === employeeFilter ? "all" : r.id)}>
                          <Eye size={14} /> View
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Filter bar */}
      <div className="space-y-3 rounded-2xl border border-slate-100 bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Type</span>
          <Chip active={typeFilter === "all"} onClick={() => setTypeFilter("all")}>All</Chip>
          {kinds.map((k) => (
            <Chip key={k.key} active={typeFilter === k.key} onClick={() => setTypeFilter(k.key)}>
              {k.label.replace(/s$/, "")}
            </Chip>
          ))}
          <div className="mx-2 h-5 w-px bg-slate-200" />
          <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Status</span>
          {(["all", "approved", "pending", "rejected", "revision"] as const).map((s) => (
            <Chip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
              {s === "all" ? "All" : s[0].toUpperCase() + s.slice(1)}
            </Chip>
          ))}
          <div className="relative ml-auto min-w-[220px] flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by creator, campaign, ASIN…"
              className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Employee</span>
          <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5">
            <option value="all">All employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.full_name ?? e.email}</option>
            ))}
          </select>
          <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Brand</span>
          <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5">
            <option value="all">All brands</option>
            {brandOptions.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Campaign</span>
          <select value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5">
            <option value="all">All campaigns</option>
            {campaignOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tab-aware work queue (monitoring + manual assignment) */}
      <div className="rounded-2xl border border-slate-100 bg-white">
        <div className="border-b border-slate-100 p-5">
          <h2 className="text-lg font-bold text-ink">{tab === "review" ? "Review Queue" : "Creator / Campaign Queue"} ({queueAll.length})</h2>
          <p className="text-xs text-slate-400">
            {tab === "review"
              ? "All order screenshots, review recordings and seller feedbacks for cross-check and assignment."
              : "All creators, draft videos and live uploads for cross-check and assignment."}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2.5">#</th>
                <th className="px-3 py-2.5">Date</th>
                <th className="px-3 py-2.5">Creator</th>
                <th className="px-3 py-2.5">Campaign Code</th>
                <th className="px-3 py-2.5">Product / ASIN</th>
                <th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5">Submission Type</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Assigned To</th>
                <th className="px-3 py-2.5">Reviewed On</th>
                <th className="px-3 py-2.5 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {queuePage.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-slate-400">No submissions match these filters.</td>
                </tr>
              ) : (
                queuePage.map((e, i) => (
                  <tr key={`${e.applicationId}:${e.kind}`} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <td className="px-3 py-3 text-slate-400">{(safePage - 1) * PAGE_SIZE + i + 1}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-500">{e.date ? formatDate(e.date) : "—"}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">{initials(e.creator)}</span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">{e.creator}</p>
                          {e.creatorHandle ? <p className="truncate text-[11px] text-slate-400">@{e.creatorHandle}</p> : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-500">{e.campaignCode || "—"}</td>
                    <td className="px-3 py-3">
                      <p className="max-w-[160px] truncate text-ink">{e.productName}</p>
                      {e.asin ? <p className="font-mono text-[11px] text-slate-400">{e.asin}</p> : null}
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={TYPE_VARIANT[e.type]}>{TYPE_LABEL[e.type]}</Badge>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{SUBMISSION_LABEL[e.kind]}</td>
                    <td className="px-3 py-3"><StatusPill state={e.state} /></td>
                    <td className="px-3 py-3">
                      <select
                        value={e.assignedId ?? ""}
                        onChange={(ev) => {
                          setPage(safePage);
                          assign.mutate({ applicationId: e.applicationId, kind: e.kind, assignee: ev.target.value || null });
                        }}
                        className={cn(
                          "max-w-[150px] rounded-lg border px-2 py-1.5 text-xs",
                          e.assignedId ? "border-primary-200 bg-primary-50 font-semibold text-primary" : "border-slate-200 text-slate-500"
                        )}
                      >
                        <option value="">Auto (pool)</option>
                        {employees.map((emp) => (
                          <option key={emp.id} value={emp.id}>{emp.full_name ?? emp.email}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-500">{e.state === "pending" ? "—" : e.date ? formatDate(e.date) : "—"}</td>
                    <td className="px-3 py-3 text-center">
                      <Button variant="ghost" size="sm" onClick={() => navigate(`/applications/${e.applicationId}/review?from=employee-stats`)}>
                        <Eye size={14} /> View
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {queueAll.length > PAGE_SIZE ? (
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
            <span>
              Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, queueAll.length)} of {queueAll.length} submissions
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>Prev</Button>
              <span className="px-2 font-semibold text-ink">{safePage} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>Next</Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Count cells                                                         */
/* ------------------------------------------------------------------ */

function StatusPill({ state }: { state: EventState }) {
  const map: Record<EventState, { cls: string; label: string }> = {
    approved: { cls: "bg-emerald-100 text-emerald-700", label: "Approved" },
    pending: { cls: "bg-amber-100 text-amber-700", label: "Pending" },
    rejected: { cls: "bg-rose-100 text-rose-700", label: "Rejected" },
    revision: { cls: "bg-indigo-100 text-indigo-700", label: "Revision" },
  };
  const m = map[state];
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", m.cls)}>{m.label}</span>;
}

function CountCells({ c, strong }: { c: Counts; strong?: boolean }) {
  const cellBase = "px-1 py-3 text-center tabular-nums";
  return (
    <>
      <td className={cn(cellBase, strong ? "bg-slate-50/60 font-bold text-ink" : "font-semibold text-slate-700")}>{checkedOf(c)}</td>
      <td className={cn(cellBase, strong && "bg-slate-50/60", "text-emerald-600")}>{c.approved}</td>
      <td className={cn(cellBase, strong && "bg-slate-50/60", "text-amber-600")}>{pendingOf(c)}</td>
      <td className={cn(cellBase, strong && "bg-slate-50/60", "text-rose-600")}>{c.rejected}</td>
    </>
  );
}
