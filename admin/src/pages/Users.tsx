import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Mail,
  Phone,
  Instagram,
  Youtube,
  Eye,
  Heart,
  MessageCircle,
  Repeat2,
  Download,
  Users as UsersIcon,
  ShieldCheck,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  X,
  ExternalLink,
  Wallet as WalletIcon,
  ArrowLeftRight,
  RotateCcw,
  MoreVertical,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Application, KycStatus, Profile } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { presetRange, inRange, type DateRange } from "@/components/DateRangeFilter";
import { formatCurrency, formatDate } from "@/lib/utils";

const PAGE_SIZE = 8;

function fmtCompact(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return v.toLocaleString("en-IN");
}

// KYC: DB uses verified/pending/rejected/not_submitted; UI shows Approved/Pending/Rejected.
const kycUi = (s: KycStatus): { label: string; variant: "success" | "warning" | "danger"; icon: typeof CheckCircle2 } => {
  if (s === "verified") return { label: "Approved", variant: "success", icon: CheckCircle2 };
  if (s === "rejected") return { label: "Rejected", variant: "danger", icon: XCircle };
  return { label: "Pending", variant: "warning", icon: Clock };
};

function Avatar({ profile, size = 40 }: { profile?: Pick<Profile, "full_name" | "profile_image"> | null; size?: number }) {
  const initial = (profile?.full_name ?? "?").charAt(0).toUpperCase();
  if (profile?.profile_image) {
    return (
      <img src={profile.profile_image} alt={profile.full_name ?? "creator"} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
    );
  }
  return (
    <div className="flex shrink-0 items-center justify-center rounded-full bg-primary-100 font-bold text-primary" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initial}
    </div>
  );
}

function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  const nums: (number | "…")[] = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page === 1} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40">
        <ChevronLeft size={16} />
      </button>
      {nums.map((n, i) =>
        n === "…" ? (
          <span key={`e${i}`} className="px-1 text-slate-400">…</span>
        ) : (
          <button key={n} onClick={() => onPage(n)} className={"flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm font-semibold " + (n === page ? "bg-primary text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50")}>
            {n}
          </button>
        )
      )}
      <button onClick={() => onPage(Math.min(pages, page + 1))} disabled={page === pages} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40">
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

// ---------- data ----------
async function fetchCreators() {
  const { data, error } = await supabase.from("profiles").select("*").eq("role", "creator").order("created_at", { ascending: false });
  if (error) throw error;
  return data as Profile[];
}

async function fetchReferralCounts() {
  const { data, error } = await supabase.from("referrals").select("referrer_id");
  if (error) throw error;
  const map = new Map<string, number>();
  for (const r of (data ?? []) as { referrer_id: string }[]) {
    map.set(r.referrer_id, (map.get(r.referrer_id) ?? 0) + 1);
  }
  return map;
}

function exportCsv(rows: Profile[], refCounts: Map<string, number>) {
  const headers = ["Name", "Handle", "Email", "Phone", "IG Followers", "YT Subscribers", "IG Avg Views", "YT Avg Views", "KYC", "Referrals", "Joined"];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((p) =>
    [p.full_name, p.instagram_username, p.email, p.phone, p.instagram_followers, p.youtube_subscribers, p.ig_avg_views, p.youtube_avg_views, kycUi(p.kyc_status).label, refCounts.get(p.id) ?? 0, p.created_at]
      .map(esc)
      .join(",")
  );
  const csv = [headers.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `creators-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const PERIODS = [
  { key: "all", label: "All time" },
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "month", label: "Last month" },
  { key: "year", label: "Last year" },
];

export default function Users() {
  const { data: creators = [], isLoading } = useQuery({ queryKey: ["creators"], queryFn: fetchCreators });
  const { data: refCounts = new Map<string, number>() } = useQuery({ queryKey: ["referral-counts"], queryFn: fetchReferralCounts });

  const [tab, setTab] = useState<"all" | "verified" | "pending" | "rejected">("all");
  const [period, setPeriod] = useState("all");
  const [platform, setPlatform] = useState("all");
  const [kyc, setKyc] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);

  // Keep the tab and the KYC dropdown in sync.
  const setKycFilter = (v: string) => {
    setKyc(v);
    setTab(v === "verified" ? "verified" : v === "pending" ? "pending" : v === "rejected" ? "rejected" : "all");
    setPage(1);
  };
  const setTabFilter = (t: typeof tab) => {
    setTab(t);
    setKyc(t === "all" ? "all" : t);
    setPage(1);
  };

  const matchesKyc = (p: Profile, key: string) => {
    if (key === "all") return true;
    if (key === "verified") return p.kyc_status === "verified";
    if (key === "pending") return p.kyc_status === "pending" || p.kyc_status === "not_submitted";
    if (key === "rejected") return p.kyc_status === "rejected";
    return true;
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const range: DateRange = presetRange(period);
    return creators.filter((p) => {
      if (!matchesKyc(p, kyc)) return false;
      if (!inRange(p.created_at, range)) return false;
      if (platform === "instagram" && !p.instagram_username) return false;
      if (platform === "youtube" && !(p.youtube_verified || (p.youtube_subscribers ?? 0) > 0)) return false;
      if (!q) return true;
      return (
        (p.full_name ?? "").toLowerCase().includes(q) ||
        (p.email ?? "").toLowerCase().includes(q) ||
        (p.phone ?? "").toLowerCase().includes(q) ||
        (p.instagram_username ?? "").toLowerCase().includes(q) ||
        (p.referral_code ?? "").toLowerCase().includes(q)
      );
    });
  }, [creators, kyc, period, platform, search]);

  const verified = creators.filter((c) => c.kyc_status === "verified").length;
  const pending = creators.filter((c) => c.kyc_status === "pending" || c.kyc_status === "not_submitted").length;
  const pct = (n: number) => (creators.length ? `${((n / creators.length) * 100).toFixed(1)}%` : "0%");

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pages);
  const rows = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const resetFilters = () => {
    setTab("all"); setPeriod("all"); setPlatform("all"); setKyc("all"); setSearch(""); setPage(1);
  };

  return (
    <div className="space-y-5" onClick={() => setMenuId(null)}>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Creators</h1>
          <p className="text-sm text-slate-500">Manage all creators, their KYC status, social stats and engagement.</p>
        </div>
        <button onClick={() => exportCsv(filtered, refCounts)} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600">
          <Download size={15} /> Export CSV
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-4 rounded-2xl border border-rose-100 bg-rose-50/50 p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-100 text-rose-600"><UsersIcon size={22} /></div>
          <div>
            <p className="text-xs font-medium text-slate-500">Total Creators</p>
            <p className="text-2xl font-black text-ink">{isLoading ? "…" : creators.length.toLocaleString("en-IN")}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600"><ShieldCheck size={22} /></div>
          <div>
            <p className="text-xs font-medium text-slate-500">KYC Verified</p>
            <p className="flex items-center gap-2 text-2xl font-black text-ink">
              {isLoading ? "…" : verified.toLocaleString("en-IN")}
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">{pct(verified)}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-2xl border border-amber-100 bg-amber-50/50 p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-600"><Clock size={22} /></div>
          <div>
            <p className="text-xs font-medium text-slate-500">KYC Pending</p>
            <p className="flex items-center gap-2 text-2xl font-black text-ink">
              {isLoading ? "…" : pending.toLocaleString("en-IN")}
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">{pct(pending)}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Filter row 1: tabs + period */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {([["all", "All Creators"], ["verified", "Verified KYC"], ["pending", "Pending KYC"], ["rejected", "Rejected"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTabFilter(k)} className={"rounded-full px-4 py-1.5 text-sm font-semibold transition-colors " + (tab === k ? "bg-primary text-white" : "bg-white text-slate-600 hover:bg-slate-100")}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Joined</span>
          {PERIODS.map((p) => (
            <button key={p.key} onClick={() => { setPeriod(p.key); setPage(1); }} className={"rounded-full px-3 py-1.5 text-xs font-semibold transition-colors " + (period === p.key ? "bg-ink text-white" : "bg-white text-slate-600 hover:bg-slate-100")}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filter row 2: search + platform + kyc + reset */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Search by name, email, phone, @handle, referral…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div>
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Social Platform</p>
          <Select value={platform} onChange={(e) => { setPlatform(e.target.value); setPage(1); }} className="h-9 w-40 py-0 text-sm">
            <option value="all">All</option>
            <option value="instagram">Instagram</option>
            <option value="youtube">YouTube</option>
          </Select>
        </div>
        <div>
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">KYC Status</p>
          <Select value={kyc} onChange={(e) => setKycFilter(e.target.value)} className="h-9 w-40 py-0 text-sm">
            <option value="all">All</option>
            <option value="verified">Approved</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected</option>
          </Select>
        </div>
        <button onClick={resetFilters} className="mt-4 flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50">
          <RotateCcw size={14} /> Reset Filters
        </button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-left text-sm">
              <thead className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">Joined ↓</th>
                  <th className="px-4 py-3 font-semibold">Creator</th>
                  <th className="px-4 py-3 font-semibold">Contact</th>
                  <th className="px-4 py-3 font-semibold">Socials</th>
                  <th className="px-4 py-3 font-semibold">Engagement (Avg Views)</th>
                  <th className="px-4 py-3 font-semibold">KYC</th>
                  <th className="px-4 py-3 font-semibold">Referral</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">Loading…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">No creators found.</td></tr>
                ) : (
                  rows.map((p) => {
                    const k = kycUi(p.kyc_status);
                    const refN = refCounts.get(p.id) ?? 0;
                    return (
                      <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                        <td className="px-4 py-3 text-slate-500">{formatDate(p.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <Avatar profile={p} />
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-ink">{p.full_name ?? "Creator"}</p>
                              {p.instagram_username && <p className="truncate text-xs text-slate-400">@{p.instagram_username}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-slate-600">{p.email ?? "—"}</p>
                          <p className="text-xs text-slate-400">{p.phone ?? "—"}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="flex items-center gap-1.5 text-slate-600"><Instagram size={13} className="text-pink-500" />{fmtCompact(p.instagram_followers)}</p>
                          <p className="flex items-center gap-1.5 text-slate-600"><Youtube size={13} className="text-red-500" />{fmtCompact(p.youtube_subscribers)}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="flex items-center gap-1.5 text-slate-600"><Eye size={13} className="text-pink-500" />{fmtCompact(p.ig_avg_views)}</p>
                          <p className="flex items-center gap-1.5 text-slate-600"><Eye size={13} className="text-red-500" />{fmtCompact(p.youtube_avg_views)}</p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={k.variant}><k.icon size={12} className="mr-1" />{k.label}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => setSelected(p)} className="font-semibold text-primary hover:underline">{refN}</button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="relative flex items-center gap-1.5">
                            <button onClick={() => setSelected(p)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">View</button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setMenuId(menuId === p.id ? null : p.id); }}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
                            >
                              <MoreVertical size={16} />
                            </button>
                            {menuId === p.id && (
                              <div className="absolute right-0 top-9 z-10 w-40 rounded-xl border border-slate-100 bg-white py-1 shadow-lg" onClick={(e) => e.stopPropagation()}>
                                <button onClick={() => { setSelected(p); setMenuId(null); }} className="block w-full px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50">View details</button>
                                <button onClick={() => { navigator.clipboard.writeText(p.email ?? ""); setMenuId(null); }} className="block w-full px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50">Copy email</button>
                                <button onClick={() => { navigator.clipboard.writeText(p.referral_code ?? ""); setMenuId(null); }} className="block w-full px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50">Copy referral code</button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <p className="text-xs text-slate-400">
              {filtered.length === 0 ? "No creators" : `Showing ${(pageSafe - 1) * PAGE_SIZE + 1}–${Math.min(pageSafe * PAGE_SIZE, filtered.length)} of ${filtered.length.toLocaleString("en-IN")} creators`}
            </p>
            <Pagination page={pageSafe} pages={pages} onPage={setPage} />
          </div>
        </CardContent>
      </Card>

      {selected && <CreatorDetail creator={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

// ==================== Creator Details modal ====================

function InsightTile({ icon: Icon, value, label, color }: { icon: typeof Eye; value: string; label: string; color: string }) {
  return (
    <div className="flex-1 px-2 py-2 text-center">
      <Icon size={16} className={`mx-auto mb-1 ${color}`} />
      <p className="text-base font-black leading-none text-ink">{value}</p>
      <p className="mt-1 text-[10px] text-slate-400">{label}</p>
    </div>
  );
}

function MoneyTile({ icon: Icon, label, value, tint, iconTint }: { icon: typeof WalletIcon; label: string; value: string; tint: string; iconTint: string }) {
  return (
    <div className={`flex items-center gap-3 rounded-2xl border p-4 ${tint}`}>
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconTint}`}><Icon size={18} /></div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-lg font-black text-ink">{value}</p>
      </div>
    </div>
  );
}

function OverviewTile({ icon: Icon, label, value, tint, iconTint }: { icon: typeof WalletIcon; label: string; value: number; tint: string; iconTint: string }) {
  return (
    <div className={`flex items-center gap-3 rounded-2xl border p-4 ${tint}`}>
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconTint}`}><Icon size={18} /></div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-xl font-black text-ink">{value}</p>
      </div>
    </div>
  );
}

const campaignStatusUi = (s: string): { label: string; variant: "success" | "warning" | "danger" } => {
  if (s === "completed") return { label: "Completed", variant: "success" };
  if (s === "rejected") return { label: "Rejected", variant: "danger" };
  return { label: "Ongoing", variant: "warning" };
};
const TYPE_LABEL: Record<string, string> = { reimbursement: "Reimbursement", barter: "Barter", paid: "Paid" };

interface Wallet { available_balance: number; pending_balance: number; lifetime_earnings: number; }
interface ReferredRow { id: string; created_at: string; referred: { id: string; full_name: string | null; email: string | null; kyc_status: KycStatus; profile_image: string | null } | null; }

function CreatorDetail({ creator, onClose }: { creator: Profile; onClose: () => void }) {
  const navigate = useNavigate();
  const [campSearch, setCampSearch] = useState("");
  const [campType, setCampType] = useState("all");
  const [campPage, setCampPage] = useState(1);
  const [refPage, setRefPage] = useState(1);

  const apps = useQuery({
    queryKey: ["creator-apps", creator.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("applications").select("*, campaign:campaigns(*)").eq("creator_id", creator.id).order("applied_at", { ascending: false });
      if (error) throw error;
      return data as Application[];
    },
  });
  const wallet = useQuery({
    queryKey: ["creator-wallet", creator.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("wallets").select("available_balance, pending_balance, lifetime_earnings").eq("user_id", creator.id).maybeSingle();
      if (error) throw error;
      return data as Wallet | null;
    },
  });
  const withdrawn = useQuery({
    queryKey: ["creator-withdrawn", creator.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("withdrawals").select("amount, status").eq("user_id", creator.id).eq("status", "paid");
      if (error) throw error;
      return (data ?? []).reduce((s, w) => s + Number((w as { amount: number }).amount ?? 0), 0);
    },
  });
  const referred = useQuery({
    queryKey: ["creator-referred", creator.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referrals")
        .select("id, created_at, referred:profiles!referrals_referred_creator_id_fkey(id, full_name, email, kyc_status, profile_image)")
        .eq("referrer_id", creator.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ReferredRow[];
    },
  });

  const appList = apps.data ?? [];
  const totalApplied = appList.length;
  const completed = appList.filter((a) => a.status === "completed").length;
  const rejected = appList.filter((a) => a.status === "rejected").length;
  const ongoing = totalApplied - completed - rejected;

  const filteredCamps = useMemo(() => {
    const q = campSearch.trim().toLowerCase();
    return appList.filter((a) => {
      if (campType !== "all" && a.campaign?.campaign_type !== campType) return false;
      if (!q) return true;
      const c = a.campaign;
      return (
        (c?.title ?? "").toLowerCase().includes(q) ||
        (c?.brand_name ?? "").toLowerCase().includes(q) ||
        (c?.product_name ?? "").toLowerCase().includes(q) ||
        (c?.asin ?? "").toLowerCase().includes(q)
      );
    });
  }, [appList, campSearch, campType]);

  const campPages = Math.max(1, Math.ceil(filteredCamps.length / 10));
  const campRows = filteredCamps.slice((Math.min(campPage, campPages) - 1) * 10, Math.min(campPage, campPages) * 10);

  const refList = referred.data ?? [];
  const refPages = Math.max(1, Math.ceil(refList.length / 5));
  const refRows = refList.slice((Math.min(refPage, refPages) - 1) * 5, Math.min(refPage, refPages) * 5);

  const igUser = creator.instagram_username;
  const ytTitle = creator.youtube_channel_title || creator.youtube_channel;
  const campCode = (a: Application) => (a.ref_no != null ? `CMP${String(a.ref_no).padStart(3, "0")}` : a.id.slice(0, 6).toUpperCase());

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div className="my-4 w-full max-w-4xl rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* Sticky header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-bold text-ink">Creator Details</h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="space-y-5 p-6">
          {/* Profile header */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div className="flex gap-4">
                <Avatar profile={creator} size={88} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-black text-ink">{creator.full_name ?? "Creator"}</h3>
                    <Badge variant={kycUi(creator.kyc_status).variant}>
                      {(() => { const K = kycUi(creator.kyc_status); return <><K.icon size={12} className="mr-1" />KYC {K.label}</>; })()}
                    </Badge>
                  </div>
                  {igUser && <p className="text-sm text-slate-400">@{igUser}</p>}
                  <p className="mt-0.5 text-xs text-slate-400">Joined on {formatDate(creator.created_at)}</p>
                  <div className="mt-2 space-y-1 text-sm">
                    <p className="flex items-center gap-2 text-slate-600"><Mail size={14} className="text-slate-400" />{creator.email ?? "—"}</p>
                    <p className="flex items-center gap-2 text-slate-600"><Phone size={14} className="text-slate-400" />{creator.phone ?? "—"}</p>
                  </div>
                </div>
              </div>
            </div>
            {/* Referral count card */}
            <div className="rounded-2xl border border-rose-100 bg-rose-50/40 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-600"><UsersIcon size={18} /></div>
                <div>
                  <p className="text-xs text-slate-500">Referral Count</p>
                  <p className="text-2xl font-black text-ink">{referred.isLoading ? "…" : refList.length}</p>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500">{refList.length} creators joined using {creator.full_name?.split(" ")[0] ?? "this"}'s referral link</p>
            </div>
          </div>

          {/* Social insight cards */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Instagram */}
            <div className="rounded-2xl border border-slate-100 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Instagram size={20} className="text-pink-500" />
                  <div>
                    <p className="text-sm font-bold text-ink">Instagram</p>
                    <p className="text-xs text-slate-400">{igUser ? `@${igUser}` : "Not connected"}</p>
                  </div>
                </div>
                {igUser && (
                  <a href={`https://instagram.com/${igUser}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                    View Profile <ExternalLink size={12} />
                  </a>
                )}
              </div>
              <div className="flex divide-x divide-slate-100 rounded-xl bg-slate-50/60 py-1">
                <InsightTile icon={UsersIcon} value={fmtCompact(creator.instagram_followers)} label="Followers" color="text-pink-500" />
                <InsightTile icon={Eye} value={fmtCompact(creator.ig_avg_views)} label="Avg. Views" color="text-pink-500" />
                <InsightTile icon={Heart} value={fmtCompact(creator.ig_avg_likes)} label="Avg. Likes" color="text-pink-500" />
                <InsightTile icon={MessageCircle} value={fmtCompact(creator.ig_avg_comments)} label="Avg. Comments" color="text-pink-500" />
                <InsightTile icon={Repeat2} value={fmtCompact(creator.ig_reach)} label="Reach" color="text-pink-500" />
              </div>
            </div>
            {/* YouTube */}
            <div className="rounded-2xl border border-slate-100 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Youtube size={20} className="text-red-500" />
                  <div>
                    <p className="text-sm font-bold text-ink">YouTube</p>
                    <p className="text-xs text-slate-400">{ytTitle || "Not connected"}</p>
                  </div>
                </div>
                {creator.youtube_channel_id && (
                  <a href={`https://youtube.com/channel/${creator.youtube_channel_id}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                    View Channel <ExternalLink size={12} />
                  </a>
                )}
              </div>
              <div className="flex divide-x divide-slate-100 rounded-xl bg-slate-50/60 py-1">
                <InsightTile icon={UsersIcon} value={fmtCompact(creator.youtube_subscribers)} label="Subscribers" color="text-red-500" />
                <InsightTile icon={Eye} value={fmtCompact(creator.youtube_avg_views)} label="Avg. Views" color="text-red-500" />
                <InsightTile icon={Heart} value={fmtCompact(creator.youtube_avg_likes)} label="Avg. Likes" color="text-red-500" />
                <InsightTile icon={Eye} value={fmtCompact(creator.youtube_views)} label="Total Views" color="text-red-500" />
              </div>
            </div>
          </div>

          {/* Wallet & Earnings */}
          <div className="rounded-2xl border border-slate-100 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-base font-bold text-ink">Wallet &amp; Earnings</h4>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <MoneyTile icon={WalletIcon} label="Total Earned" value={formatCurrency(wallet.data?.lifetime_earnings ?? creator.total_earnings)} tint="border-emerald-100 bg-emerald-50/50" iconTint="bg-emerald-100 text-emerald-600" />
              <MoneyTile icon={ArrowLeftRight} label="Withdrawn" value={formatCurrency(withdrawn.data ?? 0)} tint="border-sky-100 bg-sky-50/50" iconTint="bg-sky-100 text-sky-600" />
              <MoneyTile icon={Clock} label="Pending" value={formatCurrency(wallet.data?.pending_balance ?? 0)} tint="border-amber-100 bg-amber-50/50" iconTint="bg-amber-100 text-amber-600" />
            </div>
          </div>

          {/* Campaigns overview */}
          <div className="rounded-2xl border border-slate-100 p-4">
            <h4 className="mb-3 text-base font-bold text-ink">Campaigns Overview</h4>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <OverviewTile icon={UsersIcon} label="Total Applied" value={totalApplied} tint="border-violet-100 bg-violet-50/50" iconTint="bg-violet-100 text-violet-600" />
              <OverviewTile icon={Clock} label="Ongoing" value={ongoing} tint="border-emerald-100 bg-emerald-50/50" iconTint="bg-emerald-100 text-emerald-600" />
              <OverviewTile icon={CheckCircle2} label="Completed" value={completed} tint="border-sky-100 bg-sky-50/50" iconTint="bg-sky-100 text-sky-600" />
              <OverviewTile icon={XCircle} label="Rejected" value={rejected} tint="border-rose-100 bg-rose-50/50" iconTint="bg-rose-100 text-rose-600" />
            </div>
          </div>

          {/* Campaigns table */}
          <div className="rounded-2xl border border-slate-100 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-base font-bold text-ink">Campaigns ({filteredCamps.length})</h4>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input className="h-9 w-56 pl-9 text-sm" placeholder="Search by campaign, brand, ASIN…" value={campSearch} onChange={(e) => { setCampSearch(e.target.value); setCampPage(1); }} />
                </div>
                <Select value={campType} onChange={(e) => { setCampType(e.target.value); setCampPage(1); }} className="h-9 w-32 py-0 text-sm">
                  <option value="all">All Types</option>
                  <option value="reimbursement">Reimbursement</option>
                  <option value="barter">Barter</option>
                  <option value="paid">Paid</option>
                </Select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-3 py-2 font-semibold">#</th>
                    <th className="px-3 py-2 font-semibold">Campaign Code</th>
                    <th className="px-3 py-2 font-semibold">Brand</th>
                    <th className="px-3 py-2 font-semibold">Product / ASIN</th>
                    <th className="px-3 py-2 font-semibold">Type</th>
                    <th className="px-3 py-2 font-semibold">Applied On</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {apps.isLoading ? (
                    <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400">Loading…</td></tr>
                  ) : campRows.length === 0 ? (
                    <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400">No campaigns.</td></tr>
                  ) : (
                    campRows.map((a, i) => {
                      const cs = campaignStatusUi(a.status);
                      return (
                        <tr key={a.id} className="border-b border-slate-50">
                          <td className="px-3 py-2.5 text-slate-400">{(Math.min(campPage, campPages) - 1) * 10 + i + 1}</td>
                          <td className="px-3 py-2.5 font-mono text-xs font-semibold text-ink">{campCode(a)}</td>
                          <td className="px-3 py-2.5 text-slate-600">{a.campaign?.brand_name ?? "—"}</td>
                          <td className="px-3 py-2.5 text-slate-600">{a.campaign?.product_name ?? a.campaign?.title ?? "—"}{a.campaign?.asin ? ` (${a.campaign.asin})` : ""}</td>
                          <td className="px-3 py-2.5 text-slate-600">{a.campaign?.campaign_type ? TYPE_LABEL[a.campaign.campaign_type] : "—"}</td>
                          <td className="px-3 py-2.5 text-slate-500">{formatDate(a.applied_at)}</td>
                          <td className="px-3 py-2.5"><Badge variant={cs.variant}>{cs.label}</Badge></td>
                          <td className="px-3 py-2.5">
                            <button onClick={() => { navigate(`/applications/${a.id}/review`); onClose(); }} className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">View</button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between pt-3">
              <p className="text-xs text-slate-400">{filteredCamps.length ? `Showing ${(Math.min(campPage, campPages) - 1) * 10 + 1}–${Math.min(Math.min(campPage, campPages) * 10, filteredCamps.length)} of ${filteredCamps.length} campaigns` : "No campaigns"}</p>
              <Pagination page={Math.min(campPage, campPages)} pages={campPages} onPage={setCampPage} />
            </div>
          </div>

          {/* Referred creators */}
          <div className="rounded-2xl border border-slate-100 p-4">
            <h4 className="mb-3 text-base font-bold text-ink">Referred Creators ({refList.length})</h4>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-3 py-2 font-semibold">#</th>
                    <th className="px-3 py-2 font-semibold">Joined On</th>
                    <th className="px-3 py-2 font-semibold">Creator Name</th>
                    <th className="px-3 py-2 font-semibold">Email</th>
                    <th className="px-3 py-2 font-semibold">KYC Status</th>
                  </tr>
                </thead>
                <tbody>
                  {referred.isLoading ? (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">Loading…</td></tr>
                  ) : refRows.length === 0 ? (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">No referred creators yet.</td></tr>
                  ) : (
                    refRows.map((r, i) => {
                      const rk = r.referred ? kycUi(r.referred.kyc_status) : null;
                      return (
                        <tr key={r.id} className="border-b border-slate-50">
                          <td className="px-3 py-2.5 text-slate-400">{(Math.min(refPage, refPages) - 1) * 5 + i + 1}</td>
                          <td className="px-3 py-2.5 text-slate-500">{formatDate(r.created_at)}</td>
                          <td className="px-3 py-2.5 font-semibold text-ink">{r.referred?.full_name ?? "—"}</td>
                          <td className="px-3 py-2.5 text-slate-600">{r.referred?.email ?? "—"}</td>
                          <td className="px-3 py-2.5">{rk ? <Badge variant={rk.variant}>{rk.label}</Badge> : "—"}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between pt-3">
              <p className="text-xs text-slate-400">{refList.length ? `Showing ${(Math.min(refPage, refPages) - 1) * 5 + 1}–${Math.min(Math.min(refPage, refPages) * 5, refList.length)} of ${refList.length} referred creators` : "No referred creators"}</p>
              <Pagination page={Math.min(refPage, refPages)} pages={refPages} onPage={setRefPage} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
