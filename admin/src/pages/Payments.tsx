import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Download,
  Wallet as WalletIcon,
  Upload,
  Clock,
  Landmark,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Profile, SellerPayment, Withdrawal } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, Modal } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/input";
import { presetRange, inRange, type DateRange } from "@/components/DateRangeFilter";
import { formatCurrency, formatDate } from "@/lib/utils";

type BrandRow = SellerPayment & { addedBy?: { id: string; full_name: string | null } | null };

async function fetchWithdrawals() {
  const { data, error } = await supabase
    .from("withdrawals")
    .select("*, profile:profiles!withdrawals_user_id_fkey(*)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Withdrawal[];
}

async function fetchWalletTotal() {
  const { data, error } = await supabase.from("wallets").select("available_balance");
  if (error) throw error;
  return (data ?? []).reduce((s, w) => s + Number((w as { available_balance: number }).available_balance ?? 0), 0);
}

async function fetchBrandPayments() {
  const { data, error } = await supabase
    .from("seller_payments")
    .select(
      "*, seller:profiles!seller_payments_seller_id_fkey(id, full_name, email), addedBy:profiles!seller_payments_created_by_fkey(id, full_name)"
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as BrandRow[];
}

const PAGE_SIZE = 8;
const PERIODS = [
  { key: "all", label: "All time" },
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
];

const wdStatusVariant = (s: string) =>
  s === "paid" ? "success" : s === "rejected" || s === "failed" ? "danger" : "warning";
const brandStatusVariant = (s: string) => (s === "received" ? "success" : s === "failed" ? "danger" : "warning");
const brandStatusLabel = (s: string) => (s === "in_progress" ? "In Progress" : s.charAt(0).toUpperCase() + s.slice(1));
const maskAccount = (acc: string | null) => (!acc ? "—" : acc.length > 4 ? `•••• ${acc.slice(-4)}` : acc);

function Avatar({ profile, size = 36 }: { profile?: Profile | null; size?: number }) {
  const initial = (profile?.full_name ?? "?").charAt(0).toUpperCase();
  if (profile?.profile_image) {
    return (
      <img
        src={profile.profile_image}
        alt={profile.full_name ?? "creator"}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-primary-100 font-bold text-primary"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initial}
    </div>
  );
}

function PeriodSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-auto min-w-[8.5rem] py-0 text-sm">
      {PERIODS.map((p) => (
        <option key={p.key} value={p.key}>
          {p.label}
        </option>
      ))}
    </Select>
  );
}

function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  // Compact page list: 1 … around-current … last
  const nums: (number | "…")[] = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }
  return (
    <div className="flex items-center justify-end gap-1 px-4 py-3">
      <button
        onClick={() => onPage(Math.max(1, page - 1))}
        disabled={page === 1}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 disabled:opacity-40 hover:bg-slate-50"
      >
        <ChevronLeft size={16} />
      </button>
      {nums.map((n, i) =>
        n === "…" ? (
          <span key={`e${i}`} className="px-1 text-slate-400">
            …
          </span>
        ) : (
          <button
            key={n}
            onClick={() => onPage(n)}
            className={
              "flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm font-semibold " +
              (n === page ? "bg-primary text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50")
            }
          >
            {n}
          </button>
        )
      )}
      <button
        onClick={() => onPage(Math.min(pages, page + 1))}
        disabled={page === pages}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 disabled:opacity-40 hover:bg-slate-50"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

function SectionControls({
  search,
  onSearch,
  status,
  onStatus,
  statuses,
  period,
  onPeriod,
  onExport,
  placeholder,
}: {
  search: string;
  onSearch: (v: string) => void;
  status: string;
  onStatus: (v: string) => void;
  statuses: { key: string; label: string }[];
  period: string;
  onPeriod: (v: string) => void;
  onExport: () => void;
  placeholder: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[220px] flex-1">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input className="h-9 pl-9 text-sm" placeholder={placeholder} value={search} onChange={(e) => onSearch(e.target.value)} />
      </div>
      <Select value={status} onChange={(e) => onStatus(e.target.value)} className="h-9 w-auto min-w-[8rem] py-0 text-sm">
        {statuses.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </Select>
      <PeriodSelect value={period} onChange={onPeriod} />
      <button
        onClick={onExport}
        className="flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-600"
      >
        <Download size={15} /> Export CSV
      </button>
    </div>
  );
}

function csvDownload(name: string, headers: string[], rows: (string | number | null)[][]) {
  const esc = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function StatCard({
  icon: Icon,
  label,
  hint,
  value,
  tint,
  cardTint,
}: {
  icon: typeof WalletIcon;
  label: string;
  hint: string;
  value: string;
  tint: string;
  cardTint: string;
}) {
  return (
    <div className={`flex items-start gap-3 rounded-2xl border p-4 ${cardTint}`}>
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tint}`}>
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-slate-500">{label}</p>
        <p className="text-xl font-black text-ink">{value}</p>
        <p className="truncate text-[11px] text-slate-400">{hint}</p>
      </div>
    </div>
  );
}

export default function Payments() {
  const qc = useQueryClient();
  const withdrawals = useQuery({ queryKey: ["withdrawals"], queryFn: fetchWithdrawals });
  const walletTotal = useQuery({ queryKey: ["wallet-total"], queryFn: fetchWalletTotal });
  const brandPayments = useQuery({ queryKey: ["brand-payments"], queryFn: fetchBrandPayments });

  // Per-section filter state
  const [wdSearch, setWdSearch] = useState("");
  const [wdStatus, setWdStatus] = useState("all");
  const [wdPeriod, setWdPeriod] = useState("all");
  const [wdPage, setWdPage] = useState(1);

  const [bpSearch, setBpSearch] = useState("");
  const [bpStatus, setBpStatus] = useState("all");
  const [bpPeriod, setBpPeriod] = useState("all");
  const [bpPage, setBpPage] = useState(1);

  // Detail + processing modal state
  const [viewWd, setViewWd] = useState<Withdrawal | null>(null);
  const [processWd, setProcessWd] = useState<Withdrawal | null>(null);
  const [wdAction, setWdAction] = useState<"paid" | "failed" | "rejected">("paid");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");

  const process = useMutation({
    mutationFn: async ({ id, action, ref, why }: { id: string; action: "paid" | "failed" | "rejected"; ref?: string; why?: string }) => {
      const { error } = await supabase.rpc("process_withdrawal", {
        p_withdrawal: id,
        p_action: action,
        p_reference: ref || null,
        p_reason: why || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["withdrawals"] });
      qc.invalidateQueries({ queryKey: ["wallet-total"] });
      setProcessWd(null);
      setReference("");
      setReason("");
    },
  });

  // ---- summary figures (all-time / current) ----
  const wdList = withdrawals.data ?? [];
  const bpList = brandPayments.data ?? [];
  const totalWithdrawn = wdList.filter((w) => w.status === "paid").reduce((s, w) => s + Number(w.amount ?? 0), 0);
  const pendingList = wdList.filter((w) => w.status === "requested");
  const pendingTotal = pendingList.reduce((s, w) => s + Number(w.amount ?? 0), 0);
  const brandReceived = bpList.filter((p) => p.status === "received").reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const companyBalance = brandReceived - totalWithdrawn;

  // ---- filtered + paginated rows ----
  const filteredWd = useMemo(() => {
    const q = wdSearch.trim().toLowerCase();
    const range: DateRange = presetRange(wdPeriod);
    return wdList.filter((w) => {
      if (wdStatus !== "all" && w.status !== wdStatus) return false;
      if (!inRange(w.created_at, range)) return false;
      if (!q) return true;
      return (
        (w.profile?.full_name ?? "").toLowerCase().includes(q) ||
        (w.profile?.instagram_username ?? "").toLowerCase().includes(q) ||
        (w.upi_id ?? "").toLowerCase().includes(q) ||
        (w.account_name ?? "").toLowerCase().includes(q) ||
        (w.reference_id ?? "").toLowerCase().includes(q)
      );
    });
  }, [wdList, wdStatus, wdPeriod, wdSearch]);

  const filteredBp = useMemo(() => {
    const q = bpSearch.trim().toLowerCase();
    const range: DateRange = presetRange(bpPeriod);
    return bpList.filter((p) => {
      if (bpStatus !== "all" && p.status !== bpStatus) return false;
      if (!inRange(p.received_on ?? p.created_at, range)) return false;
      if (!q) return true;
      return (
        (p.brand ?? "").toLowerCase().includes(q) ||
        (p.reference ?? "").toLowerCase().includes(q) ||
        (p.campaign_code ?? "").toLowerCase().includes(q) ||
        (p.seller?.full_name ?? "").toLowerCase().includes(q) ||
        (p.note ?? "").toLowerCase().includes(q)
      );
    });
  }, [bpList, bpStatus, bpPeriod, bpSearch]);

  const wdPages = Math.max(1, Math.ceil(filteredWd.length / PAGE_SIZE));
  const bpPages = Math.max(1, Math.ceil(filteredBp.length / PAGE_SIZE));
  const wdPageSafe = Math.min(wdPage, wdPages);
  const bpPageSafe = Math.min(bpPage, bpPages);
  const wdRows = filteredWd.slice((wdPageSafe - 1) * PAGE_SIZE, wdPageSafe * PAGE_SIZE);
  const bpRows = filteredBp.slice((bpPageSafe - 1) * PAGE_SIZE, bpPageSafe * PAGE_SIZE);

  const exportWd = () =>
    csvDownload(
      "withdrawals",
      ["Creator", "Handle", "Amount", "UPI", "Account name", "Bank account", "IFSC", "Requested on", "Status", "UTR"],
      filteredWd.map((w) => [
        w.profile?.full_name ?? "",
        w.profile?.instagram_username ?? "",
        w.amount,
        w.upi_id,
        w.account_name,
        w.bank_account,
        w.ifsc_code,
        w.created_at,
        w.status,
        w.reference_id,
      ])
    );

  const exportBp = () =>
    csvDownload(
      "brand-payments",
      ["Date", "Brand", "Amount", "Payment mode", "UTR/Reference", "Campaign", "Added by", "Status", "Note"],
      filteredBp.map((p) => [
        p.received_on ?? p.created_at,
        p.brand,
        p.amount,
        p.payment_mode,
        p.reference,
        p.campaign_code,
        p.addedBy?.full_name ?? "",
        p.status,
        p.note,
      ])
    );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-ink">Payments</h1>
        <p className="text-sm text-slate-500">Track creator withdrawals, brand payments and overall wallet balance.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={WalletIcon}
          label="Total Valid Balance (Creators)"
          hint="Amount available in creators' wallets"
          value={walletTotal.isLoading ? "…" : formatCurrency(walletTotal.data ?? 0)}
          tint="bg-emerald-100 text-emerald-600"
          cardTint="border-emerald-100 bg-emerald-50/50"
        />
        <StatCard
          icon={Upload}
          label="Total Withdrawn Till Date"
          hint="Total amount paid to creators"
          value={withdrawals.isLoading ? "…" : formatCurrency(totalWithdrawn)}
          tint="bg-sky-100 text-sky-600"
          cardTint="border-sky-100 bg-sky-50/50"
        />
        <StatCard
          icon={Clock}
          label="Pending Withdrawals"
          hint="Requested & not yet paid"
          value={withdrawals.isLoading ? "…" : formatCurrency(pendingTotal)}
          tint="bg-amber-100 text-amber-600"
          cardTint="border-amber-100 bg-amber-50/50"
        />
        <StatCard
          icon={Landmark}
          label="Company Bank Balance"
          hint="Valid amount in company account"
          value={brandPayments.isLoading ? "…" : formatCurrency(companyBalance)}
          tint="bg-fuchsia-100 text-fuchsia-600"
          cardTint="border-fuchsia-100 bg-fuchsia-50/50"
        />
      </div>

      {/* Withdrawal Requests */}
      <Card>
        <CardContent className="p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-ink">Withdrawal Requests ({filteredWd.length})</h2>
              <p className="text-sm text-slate-500">Creators who have requested to withdraw their wallet balance.</p>
            </div>
            <SectionControls
              search={wdSearch}
              onSearch={(v) => { setWdSearch(v); setWdPage(1); }}
              status={wdStatus}
              onStatus={(v) => { setWdStatus(v); setWdPage(1); }}
              statuses={[
                { key: "all", label: "All Status" },
                { key: "requested", label: "Requested" },
                { key: "paid", label: "Paid" },
                { key: "rejected", label: "Rejected" },
                { key: "failed", label: "Failed" },
              ]}
              period={wdPeriod}
              onPeriod={(v) => { setWdPeriod(v); setWdPage(1); }}
              onExport={exportWd}
              placeholder="Search by name, email, UPI…"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">#</th>
                  <th className="px-3 py-2.5 font-semibold">Creator</th>
                  <th className="px-3 py-2.5 font-semibold">Amount</th>
                  <th className="px-3 py-2.5 font-semibold">UPI ID</th>
                  <th className="px-3 py-2.5 font-semibold">Bank Details</th>
                  <th className="px-3 py-2.5 font-semibold">Requested On</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.isLoading ? (
                  <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">Loading…</td></tr>
                ) : wdRows.length === 0 ? (
                  <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">No withdrawal requests.</td></tr>
                ) : (
                  wdRows.map((w, i) => (
                    <tr key={w.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                      <td className="px-3 py-3 text-slate-400">{(wdPageSafe - 1) * PAGE_SIZE + i + 1}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar profile={w.profile} />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-ink">{w.profile?.full_name ?? "Creator"}</p>
                            {w.profile?.instagram_username && (
                              <p className="truncate text-xs text-slate-400">@{w.profile.instagram_username}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-bold text-ink">{formatCurrency(w.amount)}</td>
                      <td className="px-3 py-3 text-slate-600">{w.upi_id ?? "—"}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-slate-500">{maskAccount(w.bank_account)}</span>
                          <Button variant="outline" size="sm" onClick={() => setViewWd(w)}>View</Button>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-500">{formatDate(w.created_at)}</td>
                      <td className="px-3 py-3"><Badge variant={wdStatusVariant(w.status)}>{w.status}</Badge></td>
                      <td className="px-3 py-3">
                        {w.status === "requested" ? (
                          <div className="flex gap-2">
                            <Button variant="success" size="sm" onClick={() => { setProcessWd(w); setWdAction("paid"); setReference(""); setReason(""); }}>Mark Paid</Button>
                            <Button variant="danger" size="sm" onClick={() => { setProcessWd(w); setWdAction("rejected"); setReference(""); setReason(""); }}>Reject</Button>
                          </div>
                        ) : w.status === "paid" ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">UTR: {w.reference_id ?? "—"}</span>
                            <Button variant="outline" size="sm" onClick={() => setViewWd(w)}>View</Button>
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={wdPageSafe} pages={wdPages} onPage={setWdPage} />
        </CardContent>
      </Card>

      {/* Brand Payment Updates */}
      <Card>
        <CardContent className="p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-ink">Brand Payment Updates ({filteredBp.length})</h2>
              <p className="text-sm text-slate-500">Payments received from brands for campaigns.</p>
            </div>
            <SectionControls
              search={bpSearch}
              onSearch={(v) => { setBpSearch(v); setBpPage(1); }}
              status={bpStatus}
              onStatus={(v) => { setBpStatus(v); setBpPage(1); }}
              statuses={[
                { key: "all", label: "All Status" },
                { key: "received", label: "Received" },
                { key: "in_progress", label: "In Progress" },
                { key: "failed", label: "Failed" },
              ]}
              period={bpPeriod}
              onPeriod={(v) => { setBpPeriod(v); setBpPage(1); }}
              onExport={exportBp}
              placeholder="Search by brand name, campaign code…"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">#</th>
                  <th className="px-3 py-2.5 font-semibold">Date</th>
                  <th className="px-3 py-2.5 font-semibold">Brand</th>
                  <th className="px-3 py-2.5 font-semibold">Amount</th>
                  <th className="px-3 py-2.5 font-semibold">Payment Mode</th>
                  <th className="px-3 py-2.5 font-semibold">UTR / Reference</th>
                  <th className="px-3 py-2.5 font-semibold">Campaign</th>
                  <th className="px-3 py-2.5 font-semibold">Added By</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 font-semibold">Note</th>
                </tr>
              </thead>
              <tbody>
                {brandPayments.isLoading ? (
                  <tr><td colSpan={10} className="px-3 py-8 text-center text-slate-400">Loading…</td></tr>
                ) : bpRows.length === 0 ? (
                  <tr><td colSpan={10} className="px-3 py-8 text-center text-slate-400">No brand payments yet. Add one from Brands → Record payment.</td></tr>
                ) : (
                  bpRows.map((p, i) => (
                    <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                      <td className="px-3 py-3 text-slate-400">{(bpPageSafe - 1) * PAGE_SIZE + i + 1}</td>
                      <td className="px-3 py-3 text-slate-500">{formatDate(p.received_on ?? p.created_at)}</td>
                      <td className="px-3 py-3 font-semibold text-ink">{p.brand ?? p.seller?.full_name ?? "—"}</td>
                      <td className="px-3 py-3 font-bold text-ink">{formatCurrency(p.amount)}</td>
                      <td className="px-3 py-3 text-slate-600">{p.payment_mode ?? "—"}</td>
                      <td className="px-3 py-3 font-mono text-xs text-slate-600">{p.reference ?? "—"}</td>
                      <td className="px-3 py-3 text-slate-600">{p.campaign_code ?? "—"}</td>
                      <td className="px-3 py-3 text-slate-600">{p.addedBy?.full_name ?? "—"}</td>
                      <td className="px-3 py-3"><Badge variant={brandStatusVariant(p.status)}>{brandStatusLabel(p.status)}</Badge></td>
                      <td className="px-3 py-3 max-w-[16rem] truncate text-slate-500" title={p.note ?? ""}>{p.note ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={bpPageSafe} pages={bpPages} onPage={setBpPage} />
        </CardContent>
      </Card>

      {/* Withdrawal detail (View) */}
      <Modal open={!!viewWd} onClose={() => setViewWd(null)} title="Withdrawal details">
        {viewWd && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar profile={viewWd.profile} size={48} />
              <div>
                <p className="font-bold text-ink">{viewWd.profile?.full_name ?? "Creator"}</p>
                {viewWd.profile?.instagram_username && (
                  <p className="text-xs text-slate-400">@{viewWd.profile.instagram_username}</p>
                )}
              </div>
              <div className="ml-auto text-right">
                <p className="text-xl font-black text-ink">{formatCurrency(viewWd.amount)}</p>
                <Badge variant={wdStatusVariant(viewWd.status)}>{viewWd.status}</Badge>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-sm">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Method</p>
                <p className="font-medium text-ink capitalize">{viewWd.method === "upi" ? "UPI" : "Bank transfer"}</p>
              </div>
              {viewWd.method === "upi" ? (
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">UPI ID</p>
                  <p className="font-medium text-ink">{viewWd.upi_id ?? "—"}</p>
                </div>
              ) : (
                <>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">Account name</p>
                    <p className="font-medium text-ink">{viewWd.account_name ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">Account number</p>
                    <p className="font-mono font-medium text-ink">{viewWd.bank_account ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">IFSC</p>
                    <p className="font-mono font-medium text-ink">{viewWd.ifsc_code ?? "—"}</p>
                  </div>
                </>
              )}
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Requested on</p>
                <p className="font-medium text-ink">{formatDate(viewWd.created_at)}</p>
              </div>
              {viewWd.reference_id && (
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">UTR / Reference</p>
                  <p className="font-mono font-medium text-emerald-600">{viewWd.reference_id}</p>
                </div>
              )}
              {viewWd.processed_at && (
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">Processed on</p>
                  <p className="font-medium text-ink">{formatDate(viewWd.processed_at)}</p>
                </div>
              )}
              {viewWd.failure_reason && (
                <div className="col-span-2">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">Reason</p>
                  <p className="font-medium text-rose-600">{viewWd.failure_reason}</p>
                </div>
              )}
            </div>
            {viewWd.status === "requested" && (
              <div className="flex justify-end gap-2">
                <Button variant="danger" onClick={() => { setProcessWd(viewWd); setWdAction("rejected"); setReference(""); setReason(""); setViewWd(null); }}>Reject</Button>
                <Button variant="success" onClick={() => { setProcessWd(viewWd); setWdAction("paid"); setReference(""); setReason(""); setViewWd(null); }}>Mark Paid</Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Withdrawal processing modal */}
      <Modal
        open={!!processWd}
        onClose={() => setProcessWd(null)}
        title={wdAction === "paid" ? "Mark Withdrawal Paid" : wdAction === "failed" ? "Payout Failed" : "Reject Withdrawal"}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            {processWd?.profile?.full_name ?? "Creator"} · {processWd ? formatCurrency(processWd.amount) : ""} ·{" "}
            {processWd?.method === "upi"
              ? `UPI: ${processWd?.upi_id}`
              : `${processWd?.account_name} · ${processWd?.bank_account} · ${processWd?.ifsc_code}`}
          </p>

          {wdAction === "paid" ? (
            <div>
              <Label>Reference / UTR number</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. UPI/bank transaction reference" />
              <p className="mt-1 text-xs text-slate-400">Pay the creator manually first, then paste the transaction reference here.</p>
            </div>
          ) : (
            <div>
              <Label>Reason (optional)</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this being rejected?" />
              <p className="mt-1 text-xs text-slate-400">The amount will be refunded to the creator's wallet.</p>
            </div>
          )}

          <div className="flex justify-between gap-2">
            {wdAction === "paid" && processWd && (
              <Button variant="danger" onClick={() => setWdAction("failed")} type="button">Payout failed instead</Button>
            )}
            <div className="ml-auto flex gap-2">
              <Button variant="outline" onClick={() => setProcessWd(null)}>Cancel</Button>
              <Button
                variant={wdAction === "paid" ? "success" : "danger"}
                disabled={process.isPending || (wdAction === "paid" && !reference.trim())}
                onClick={() => processWd && process.mutate({ id: processWd.id, action: wdAction, ref: reference, why: reason })}
              >
                {process.isPending ? "Saving…" : wdAction === "paid" ? "Confirm Paid" : wdAction === "failed" ? "Mark Failed & Refund" : "Reject & Refund"}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
