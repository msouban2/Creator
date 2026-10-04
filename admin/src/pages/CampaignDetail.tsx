import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ShoppingCart, CheckCircle2, Clock, Wallet, Users, IndianRupee, Gift, ExternalLink, Loader2, Instagram, Youtube, Play, Eye, Heart, MessageCircle, Download, Save } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";
import { supabase } from "@/lib/supabase";
import type { Application, Campaign } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { signedUrl } from "@/lib/storage";
import { campaignCode, formatCurrency, formatDate } from "@/lib/utils";
import { statusLabel } from "@/lib/workflow";

const TYPE_LABEL: Record<string, string> = { reimbursement: "Reimbursement", barter: "Barter", paid: "Paid" };
const TYPE_VARIANT: Record<string, "info" | "warning" | "success"> = { reimbursement: "info", barter: "warning", paid: "success" };

// Build a CSV from rows of objects (keys become the header) and trigger a
// download. Opens directly in Excel / Google Sheets.
function exportCsv(filename: string, rows: Record<string, string | number>[]) {
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

// Green/amber/rose badge for an application's live status.
function statusVariant(s: string): "success" | "warning" | "danger" | "info" | "default" {
  if (s === "completed") return "success";
  if (s === "rejected") return "danger";
  if (["applied", "selected"].includes(s)) return "info";
  return "warning";
}

// Small colored pill for a per-item approval state (Approved / Pending / Rejected).
function Pill({ state }: { state: "approved" | "pending" | "rejected" | "none" }) {
  if (state === "none") return <span className="text-slate-300">-</span>;
  const map = {
    approved: "bg-emerald-100 text-emerald-700",
    pending: "bg-amber-100 text-amber-700",
    rejected: "bg-rose-100 text-rose-700",
  } as const;
  const label = { approved: "Approved", pending: "Pending", rejected: "Rejected" }[state];
  return <span className={`mt-1 inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold ${map[state]}`}>{label}</span>;
}

const ORDER_STAGES = ["ordered", "order_approved", "product_received", "content_creation", "submitted", "review", "payment_in_progress", "completed"];
type OrderStatusFilter =
  | "all"
  | "order_screenshot"
  | "review_recording"
  | "seller_feedback"
  | "payout_amount"
  | "added_to_wallet";

function filterCampaignOrders(apps: Application[], query: string, filter: OrderStatusFilter, asin: string | null) {
  const search = query.trim().toLowerCase();
  return apps.filter((app) => {
    const submission = app.submissions?.[0];
    if (filter === "order_screenshot" && !app.purchase_proof) return false;
    if (filter === "review_recording" && !submission?.video_url) return false;
    if (filter === "seller_feedback" && !(
      app.seller_feedback || submission?.seller_feedback_screenshot || submission?.seller_feedback_video
    )) return false;
    if (filter === "payout_amount" && !(Number(app.payout_amount) > 0)) return false;
    if (filter === "added_to_wallet" && !app.completed_at) return false;
    if (!search) return true;
    return [app.creator?.full_name, app.creator?.instagram_username, app.order_id, asin]
      .some((value) => (value ?? "").toLowerCase().includes(search));
  });
}

// Has the reimbursement order screenshot been approved yet?
function orderShotState(a: Application): "approved" | "pending" | "rejected" | "none" {
  if (!a.purchase_proof && a.status !== "ordered") return "none";
  if (a.status === "rejected") return "rejected";
  const i = ORDER_STAGES.indexOf(a.status);
  return i >= 1 ? "approved" : "pending"; // order_approved or later = approved
}
// Approval state of the content/review submission (screenshot + recording).
function reviewState(a: Application): "approved" | "pending" | "rejected" | "none" {
  const sub = a.submissions?.[0];
  if (!sub) return "none";
  if (sub.review_status === "approved") return "approved";
  if (sub.review_status === "rejected") return "rejected";
  return "pending";
}

// A "View Link" cell that lazily resolves a signed URL for a stored file.
function LinkCell({ bucket, path, label = "View Link" }: { bucket: string; path: string | null | undefined; label?: string }) {
  const { data: url } = useQuery({
    queryKey: ["cd-file", bucket, path],
    queryFn: () => signedUrl(bucket, path),
    enabled: !!path,
  });
  if (!path) return <span className="text-slate-300">-</span>;
  if (!url) return <span className="text-slate-300">…</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
      <ExternalLink size={12} /> {label}
    </a>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Wallet; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary">
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs text-slate-500">{label}</p>
        <p className="text-lg font-extrabold text-ink">{value}</p>
      </div>
    </div>
  );
}

// Turn a YouTube watch/short/youtu.be URL into an embeddable /embed/ URL.
function youtubeEmbed(url: string): string | null {
  const m =
    url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/) ||
    url.match(/[?&]v=([\w-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

type ContentKind = "rejected_draft" | "live" | "draft";

// A single content card: plays the draft video inline (private bucket, signed
// URL) and/or embeds the live reel. Barter & paid both show the draft video
// and the Instagram/YouTube reel here rather than as bare links.
function ContentCard({ app: a, kind }: { app: Application; kind: ContentKind }) {
  const isYt = !!a.reel_link && /(youtube|youtu\.be)/i.test(a.reel_link);
  const ytEmbed = a.reel_link && isYt ? youtubeEmbed(a.reel_link) : null;
  // Prefer the draft video (draft→live flow); fall back to the review video
  // uploaded via the "Submit Content" flow (campaign_submissions.video_url) so
  // no submitted video is ever hidden.
  const sub = a.submissions?.[0];
  const videoPath = a.draft_video_url ?? sub?.video_url ?? null;
  const { data: draftUrl } = useQuery({
    queryKey: ["cd-draft", a.id, videoPath],
    queryFn: () => signedUrl("submission-videos", videoPath),
    enabled: !!videoPath,
  });
  const c = a.creator;
  const cs =
    kind === "live"
      ? { label: "Live", cls: "bg-emerald-100 text-emerald-700" }
      : kind === "rejected_draft"
        ? { label: "Rejected Draft", cls: "bg-rose-100 text-rose-700" }
        : a.status === "draft_submitted"
          ? { label: "Draft — In Review", cls: "bg-amber-100 text-amber-700" }
          : a.status === "draft_approved"
            ? { label: "Draft Approved", cls: "bg-indigo-100 text-indigo-700" }
            : { label: statusLabel(a.status), cls: "bg-slate-100 text-slate-600" };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between px-3 pt-3">
        <CreatorCell app={a} />
        {isYt ? <Youtube size={16} className="text-rose-600" /> : <Instagram size={16} className="text-primary" />}
      </div>

      {/* Inline media: draft video plays right here; else embed/preview the reel */}
      <div className="relative mt-3 aspect-[4/5] w-full overflow-hidden bg-gradient-to-br from-primary-100 to-slate-100">
        {draftUrl ? (
          <video src={draftUrl} controls playsInline className="h-full w-full bg-black object-contain" />
        ) : ytEmbed ? (
          <iframe src={ytEmbed} title="reel" allowFullScreen className="h-full w-full" />
        ) : videoPath ? (
          <div className="absolute inset-0 flex items-center justify-center text-primary">
            <Loader2 size={22} className="animate-spin" />
          </div>
        ) : a.reel_link ? (
          <a href={a.reel_link} target="_blank" rel="noreferrer" className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/80 text-primary shadow"><Play size={18} /></span>
          </a>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-slate-300">
            <Play size={22} />
          </div>
        )}
      </div>

      {/* Which pieces exist: draft/review video (inline above) + live reel link */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-[11px]">
        <span className="font-semibold text-slate-400">Video:</span>
        {videoPath ? <span className="font-semibold text-emerald-600">Shown above</span> : <span className="text-slate-300">-</span>}
        <span className="ml-1 font-semibold text-slate-400">Reel:</span>
        {a.reel_link ? (
          <a href={a.reel_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
            <ExternalLink size={12} /> {isYt ? "YouTube" : "Instagram"}
          </a>
        ) : (
          <span className="text-slate-300">-</span>
        )}
      </div>

      {/* Real per-campaign engagement (likes+comments recorded for this reel) + audience size */}
      <div className="flex items-center gap-3 border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
        <span className="flex items-center gap-1"><Heart size={13} /> {(Number(a.reel_engagement) || 0).toLocaleString("en-IN")} eng.</span>
        <span className="flex items-center gap-1"><Users size={13} /> {(c?.instagram_followers || c?.youtube_subscribers || 0).toLocaleString("en-IN")}</span>
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2">
        <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${cs.cls}`}>{cs.label}</span>
        <span className="text-[11px] text-slate-400">{a.completed_at ? `Posted ${formatDate(a.completed_at)}` : a.selected_at ? formatDate(a.selected_at) : ""}</span>
      </div>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400 ${className}`}>{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-3 align-top text-sm text-slate-600 ${className}`}>{children}</td>;
}

function CreatorCell({ app }: { app: Application }) {
  const c = app.creator;
  const initial = (c?.full_name ?? "?").charAt(0).toUpperCase();
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary">{initial}</div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ink">{c?.full_name ?? "Creator"}</p>
        {c?.instagram_username ? <p className="truncate text-[11px] text-slate-400">@{c.instagram_username}</p> : null}
      </div>
    </div>
  );
}

type ShipStatus = "not_shipped" | "shipped" | "delivered";
function shipStatusOf(a: Application): ShipStatus {
  if (a.seller_shipment_status === "delivered" || a.delivered_at) return "delivered";
  if (a.seller_shipment_status === "shipped" || a.shipped_at) return "shipped";
  return "not_shipped";
}
// ISO timestamp → yyyy-mm-dd for a <input type="date">; "" when empty.
function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// yyyy-mm-dd (local) → ISO timestamp (noon, to avoid TZ day-shifts); null when empty.
function fromDateInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(`${v}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Editable shipping row: admins can add/edit the tracking ID, the expected &
// delivered dates, and move the parcel through not shipped → shipped →
// delivered. Saving writes the tracking id, shipment status, the expected /
// delivered dates and the matching shipped_at / delivered_at timestamps.
function ShipperRow({ app, index, address, onSaved }: { app: Application; index: number; address: string; onSaved: () => void }) {
  const [tracking, setTracking] = useState(app.seller_tracking_id ?? app.seller_tracking_code ?? "");
  const [status, setStatus] = useState<ShipStatus>(shipStatusOf(app));
  const [expected, setExpected] = useState(toDateInput(app.expected_delivery_at));
  const [delivered, setDelivered] = useState(toDateInput(app.delivered_at));

  const initialTracking = app.seller_tracking_id ?? app.seller_tracking_code ?? "";
  const dirty =
    tracking.trim() !== initialTracking.trim() ||
    status !== shipStatusOf(app) ||
    expected !== toDateInput(app.expected_delivery_at) ||
    delivered !== toDateInput(app.delivered_at);

  const save = useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString();
      const deliveredIso = fromDateInput(delivered);
      const patch: Record<string, unknown> = {
        seller_tracking_id: tracking.trim() || null,
        expected_delivery_at: fromDateInput(expected),
      };
      if (status === "not_shipped") {
        patch.seller_shipment_status = "pending";
        patch.shipped_at = null;
        patch.delivered_at = deliveredIso;
      } else if (status === "shipped") {
        patch.seller_shipment_status = "shipped";
        patch.shipped_at = app.shipped_at ?? now;
        patch.delivered_at = deliveredIso;
        if (app.status === "selected") patch.status = "product_shipped";
      } else {
        patch.seller_shipment_status = "delivered";
        patch.shipped_at = app.shipped_at ?? now;
        // Use the edited delivered date if given, else keep/stamp now.
        patch.delivered_at = deliveredIso ?? app.delivered_at ?? now;
        if (["selected", "product_shipped"].includes(app.status)) patch.status = "delivered";
      }
      const { error } = await supabase.from("applications").update(patch).eq("id", app.id);
      if (error) throw error;
    },
    onSuccess: onSaved,
  });

  return (
    <tr className="hover:bg-slate-50/50">
      <Td>{index}</Td>
      <Td><CreatorCell app={app} /></Td>
      <Td className="max-w-[240px]">{address}</Td>
      <Td>
        <Input
          value={tracking}
          onChange={(e) => setTracking(e.target.value)}
          placeholder="Add tracking ID / URL"
          className="h-9 w-56 text-sm"
        />
      </Td>
      <Td>
        <Input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} className="h-9 w-40 text-sm" />
      </Td>
      <Td>
        <Input type="date" value={delivered} onChange={(e) => setDelivered(e.target.value)} className="h-9 w-40 text-sm" />
      </Td>
      <Td>
        <Select value={status} onChange={(e) => setStatus(e.target.value as ShipStatus)} className="h-9 w-36 text-sm">
          <option value="not_shipped">Not shipped</option>
          <option value="shipped">Shipped</option>
          <option value="delivered">Delivered</option>
        </Select>
      </Td>
      <Td className="text-right">
        <Button
          size="sm"
          variant={dirty ? "default" : "outline"}
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {save.isSuccess && !dirty ? "Saved" : "Save"}
        </Button>
      </Td>
    </tr>
  );
}

export default function CampaignDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: campaign, isLoading } = useQuery({
    queryKey: ["campaign-detail", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("campaigns").select("*").eq("id", id).single();
      if (error) throw error;
      return data as Campaign;
    },
  });

  const { data: apps = [] } = useQuery({
    queryKey: ["campaign-detail-apps", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("*, creator:profiles!creator_id(*), submissions:campaign_submissions(*)")
        .eq("campaign_id", id)
        .order("applied_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Application[];
    },
  });

  // Addresses aren't FK-linked to applications, so fetch them per creator.
  const creatorIds = useMemo(() => Array.from(new Set(apps.map((a) => a.creator_id))), [apps]);
  const { data: addrMap = {} } = useQuery({
    queryKey: ["campaign-detail-addr", id, creatorIds.length],
    enabled: creatorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creator_addresses")
        .select("user_id, name, address, city, state, postal_code, phone")
        .in("user_id", creatorIds);
      if (error) throw error;
      const m: Record<string, { address: string | null; city: string | null; state: string | null; postal_code: string | null }> = {};
      for (const r of (data ?? []) as { user_id: string; address: string | null; city: string | null; state: string | null; postal_code: string | null }[]) {
        if (!m[r.user_id]) m[r.user_id] = r;
      }
      return m;
    },
  });
  const addrText = (uid: string) => {
    const a = addrMap[uid];
    return a ? [a.address, a.city, a.state, a.postal_code].filter(Boolean).join(", ") : "-";
  };

  const { data: referralAmount = 0 } = useQuery({
    queryKey: ["campaign-detail-referral", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("amount")
        .eq("type", "referral_bonus")
        .eq("campaign_id", id);
      if (error) throw error;
      return (data ?? []).reduce((s: number, t: { amount: number | null }) => s + (Number(t.amount) || 0), 0);
    },
  });

  const active = useMemo(() => apps.filter((a) => a.status !== "rejected"), [apps]);
  const [tab, setTab] = useState<"main" | "shipper" | "content" | "reports">("main");
  const [orderSearch, setOrderSearch] = useState("");
  const [orderStatus, setOrderStatus] = useState<OrderStatusFilter>("all");
  const [contentFilter, setContentFilter] = useState<"all" | "draft" | "live" | "rejected_draft">("all");

  if (isLoading || !campaign) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" /></div>;
  }

  const isReimb = campaign.campaign_type === "reimbursement";
  const completed = active.filter((a) =>
    isReimb
      ? ["order_approved", "product_received", "content_creation", "submitted", "review", "payment_in_progress", "completed"].includes(a.status)
      : a.status === "completed"
  ).length;
  const applied = active.filter((a) => a.status === "applied").length;
  const budget = campaign.budget != null && Number(campaign.budget) > 0
    ? Number(campaign.budget)
    : (isReimb ? (campaign.reward_amount + campaign.cashback_percentage) : campaign.reward_amount) * (campaign.slots || 0);
  const payout = active.filter((a) => a.status === "completed").reduce((s, a) => s + (Number(a.payout_amount) || 0), 0);
  const orderSpend = active.reduce((s, a) => s + (Number(a.purchase_amount) || 0), 0);
  const walletLeft = Math.max(budget - payout - referralAmount, 0);

  // Export the current tab's table to CSV (opens in Excel).
  const onExport = () => {
    const codeSafe = (campaign.title || "campaign").replace(/[^\w-]+/g, "_").slice(0, 40);
    if (isReimb) {
      const rows = filterCampaignOrders(active, orderSearch, orderStatus, campaign.asin).map((a, i) => ({
        "#": i + 1,
        "Order Date": a.applied_at ? formatDate(a.applied_at) : "",
        "Delivery Date": a.expected_delivery_at ? formatDate(a.expected_delivery_at) : "",
        Creator: a.creator?.full_name ?? "",
        Instagram: a.creator?.instagram_username ?? "",
        Product: campaign.product_name ?? campaign.title,
        ASIN: campaign.asin ?? "",
        "Order ID": a.order_id ?? "",
        "Order Amount": a.purchase_amount == null ? "" : Number(a.purchase_amount),
        "Payout Amount": Number(a.payout_amount) || 0,
        "Added to Wallet": a.completed_at ? formatDate(a.completed_at) : "",
        Status: a.status === "completed" ? "Completed" : "In Progress",
      }));
      exportCsv(`${codeSafe}_orders.csv`, rows);
    } else {
      const rows = active.map((a, i) => ({
        "#": i + 1,
        Creator: a.creator?.full_name ?? "",
        Handle: a.creator?.instagram_username ?? "",
        Followers: a.creator?.instagram_followers || a.creator?.youtube_subscribers || 0,
        "Avg Views": (a.creator?.ig_avg_views ?? a.creator?.youtube_avg_views) || 0,
        Address: addrText(a.creator_id),
        Tracking: a.seller_tracking_id ?? a.seller_tracking_code ?? "",
        "Expected Delivery": a.expected_delivery_at ? formatDate(a.expected_delivery_at) : "",
        "Delivered Date": a.delivered_at ? formatDate(a.delivered_at) : "",
        Published: a.reel_link ?? "",
        "Publish Date": a.completed_at ? formatDate(a.completed_at) : "",
        Payout: Number(a.payout_amount) || 0,
        Status: statusLabel(a.status),
      }));
      exportCsv(`${codeSafe}_creators.csv`, rows);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate("/campaigns")} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-ink">
          <ArrowLeft size={16} /> Back to campaigns
        </button>
        <button onClick={onExport} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary-50">
          <Download size={15} /> Export CSV
        </button>
      </div>

      {/* Header */}
      <div className="rounded-2xl border border-slate-100 bg-white p-4">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-slate-100">
            {campaign.campaign_image ? <img src={campaign.campaign_image} alt="" className="h-full w-full object-cover" /> : null}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={TYPE_VARIANT[campaign.campaign_type]}>{TYPE_LABEL[campaign.campaign_type]}</Badge>
              <Badge variant={campaign.status === "active" ? "success" : "default"}>{campaign.status}</Badge>
            </div>
            <h1 className="mt-1.5 text-xl font-bold text-ink">{campaign.title}</h1>
            <p className="text-sm text-slate-500">
              Brand: {campaign.brand_name}
              {campaign.asin ? ` · ASIN: ${campaign.asin}` : ""}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Campaign Code: <span className="font-mono font-semibold text-slate-700">{campaignCode(campaign)}</span>
            </p>
            {!isReimb ? (
              <div className="mt-2 inline-flex rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary">
                {campaign.campaign_type === "barter"
                  ? `Product worth ${formatCurrency(campaign.reward_amount)}`
                  : `Payout up to ${formatCurrency(campaign.reward_amount)}`}
              </div>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
              <span>Posted: <b className="text-slate-600">{formatDate(campaign.created_at)}</b></span>
              {campaign.application_deadline ? <span>Application deadline: <b className="text-slate-600">{formatDate(campaign.application_deadline)}</b></span> : null}
              {campaign.campaign_deadline ? <span>Campaign deadline: <b className="text-slate-600">{formatDate(campaign.campaign_deadline)}</b></span> : null}
            </div>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {isReimb ? (
          <>
            <StatCard icon={ShoppingCart} label="Total Orders" value={String(active.length)} />
            <StatCard icon={CheckCircle2} label="Completed Orders" value={String(completed)} />
            <StatCard icon={Clock} label="Pending Orders" value={String(active.length - completed)} />
            <StatCard icon={IndianRupee} label="Campaign Budget" value={formatCurrency(budget)} />
            <StatCard icon={Wallet} label="Used Order Amount" value={formatCurrency(payout)} />
            <StatCard icon={Gift} label="Referral Amount" value={formatCurrency(referralAmount)} />
            <StatCard icon={Wallet} label="Wallet Owed" value={formatCurrency(walletLeft)} />
            <StatCard icon={IndianRupee} label="Claimed Spend" value={formatCurrency(orderSpend)} />
          </>
        ) : (
          <>
            <StatCard icon={Users} label="Total Creators" value={String(active.length)} />
            <StatCard icon={CheckCircle2} label="Approved Creators" value={String(active.length - applied)} />
            <StatCard icon={Clock} label="Pending Creators" value={String(applied)} />
            <StatCard icon={IndianRupee} label="Campaign Budget" value={formatCurrency(budget)} />
            <StatCard icon={Wallet} label="Campaign Payout" value={formatCurrency(payout)} />
            <StatCard icon={Gift} label="Referral Amount" value={formatCurrency(referralAmount)} />
            <StatCard icon={Wallet} label="Wallet Owed" value={formatCurrency(walletLeft)} />
          </>
        )}
      </div>

      {/* Tabs (barter/paid) */}
      {!isReimb && (
        <div className="flex flex-wrap gap-2 border-b border-slate-100">
          {([["main", `Creators (${active.length})`], ["shipper", "Shipper"], ["content", "Content"], ["reports", "Reports"]] as const).map(([k, lbl]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={"border-b-2 px-3 py-2 text-sm font-semibold transition-colors " + (tab === k ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-ink")}
            >
              {lbl}
            </button>
          ))}
        </div>
      )}

      {/* ---------- REIMBURSEMENT: Orders ---------- */}
      {isReimb && (
        <div className="rounded-2xl border border-slate-100 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-3">
            <p className="text-sm font-bold text-primary">Orders ({active.length})</p>
            <div className="flex items-center gap-2">
              <div className="relative">
                <ExternalLink size={14} className="absolute left-3 top-1/2 hidden -translate-y-1/2 text-slate-400" />
                <input
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  placeholder="Search by creator, order ID, ASIN…"
                  className="h-9 w-56 rounded-full border border-slate-200 px-3 text-sm outline-none focus:border-primary"
                />
              </div>
              <select
                value={orderStatus}
                onChange={(e) => setOrderStatus(e.target.value as typeof orderStatus)}
                className="h-9 rounded-full border border-slate-200 px-3 text-sm text-slate-600 outline-none focus:border-primary"
              >
                <option value="all">Everything</option>
                <option value="order_screenshot">Order Screenshot</option>
                <option value="review_recording">Review Recording</option>
                <option value="seller_feedback">Seller Feedback</option>
                <option value="payout_amount">Payout Amount</option>
                <option value="added_to_wallet">Added to Wallet</option>
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[1400px]">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <Th>#</Th><Th>Order Date</Th><Th>Delivery Date</Th><Th>Creator</Th><Th>Product / ASIN</Th><Th>Order ID</Th><Th>Order Amount</Th>
                <Th>Order Screenshot</Th><Th>Review Recording</Th><Th>Seller Feedback</Th>
                <Th>Payout Amount</Th><Th>Added to Wallet</Th><Th>Payment Screenshot</Th><Th>Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(() => {
                const orders = filterCampaignOrders(active, orderSearch, orderStatus, campaign.asin);
                if (orders.length === 0) return <tr><Td className="text-center text-slate-400">No orders match.</Td></tr>;
                return orders.map((a, i) => {
                  const sub = a.submissions?.[0];
                  const sellerFb = a.seller_feedback || sub?.seller_feedback_screenshot || sub?.seller_feedback_video;
                  return (
                    <tr key={a.id} className="hover:bg-slate-50/50">
                      <Td>{i + 1}</Td>
                      <Td>{formatDate(a.applied_at)}</Td>
                      <Td>{a.expected_delivery_at ? formatDate(a.expected_delivery_at) : "-"}</Td>
                      <Td><CreatorCell app={a} /></Td>
                      <Td className="max-w-[180px]">
                        <p className="truncate text-xs font-medium text-ink">{campaign.product_name ?? campaign.title}</p>
                        {campaign.asin ? <p className="font-mono text-[11px] text-slate-400">{campaign.asin}</p> : null}
                      </Td>
                      <Td>{a.order_id ?? "-"}</Td>
                      <Td>{a.purchase_amount == null ? "—" : formatCurrency(a.purchase_amount)}</Td>
                      <Td><div><LinkCell bucket="purchase-orders" path={a.purchase_proof} /><div><Pill state={orderShotState(a)} /></div></div></Td>
                      <Td><div><LinkCell bucket="submission-videos" path={sub?.video_url} /><div><Pill state={sub?.video_url ? reviewState(a) : "none"} /></div></div></Td>
                      <Td><div>{sub?.seller_feedback_screenshot ? <LinkCell bucket="submission-screenshots" path={sub.seller_feedback_screenshot} /> : <LinkCell bucket="submission-videos" path={sub?.seller_feedback_video} />}<div><Pill state={sellerFb ? "approved" : "none"} /></div></div></Td>
                      <Td>{a.payout_amount ? formatCurrency(a.payout_amount) : "-"}</Td>
                      <Td>{a.completed_at ? formatDate(a.completed_at) : "-"}</Td>
                      <Td><span className="text-slate-300">-</span></Td>
                      <Td><Badge variant={a.status === "completed" ? "success" : "warning"}>{a.status === "completed" ? "Completed" : "In Progress"}</Badge></Td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* ---------- BARTER/PAID: Creators ---------- */}
      {!isReimb && tab === "main" && (
        <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white">
          <table className="w-full min-w-[1000px]">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <Th>#</Th><Th>Creator</Th><Th>Followers</Th><Th>Avg Views</Th><Th>Shipping Address</Th><Th>Tracking</Th>
                <Th>Draft</Th><Th>Published</Th><Th>Publish Date</Th><Th>Status</Th><Th>Comments</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {active.map((a, i) => (
                <tr key={a.id} className="hover:bg-slate-50/50">
                  <Td>{i + 1}</Td>
                  <Td><CreatorCell app={a} /></Td>
                  <Td>{(a.creator?.instagram_followers || a.creator?.youtube_subscribers || 0).toLocaleString("en-IN")}</Td>
                  <Td>{((a.creator?.ig_avg_views ?? a.creator?.youtube_avg_views) || 0).toLocaleString("en-IN")}</Td>
                  <Td className="max-w-[200px]">
                    {addrMap[a.creator_id] ? <span className="text-xs">{addrText(a.creator_id)}</span> : "-"}
                  </Td>
                  <Td>{a.seller_tracking_id ?? "-"}</Td>
                  <Td><LinkCell bucket="submission-videos" path={a.draft_video_url} label="View" /></Td>
                  <Td>{a.reel_link ? <a href={a.reel_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><ExternalLink size={12} /> Link</a> : "-"}</Td>
                  <Td>{a.completed_at ? formatDate(a.completed_at) : "-"}</Td>
                  <Td><Badge variant={statusVariant(a.status)}>{statusLabel(a.status)}</Badge></Td>
                  <Td className="max-w-[160px] truncate text-xs">{a.draft_feedback ?? "-"}</Td>
                </tr>
              ))}
              {active.length === 0 ? <tr><Td className="text-center text-slate-400">No creators yet.</Td></tr> : null}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------- Shipper ---------- */}
      {!isReimb && tab === "shipper" && (
        <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white">
          <table className="w-full min-w-[900px]">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr><Th>#</Th><Th>Creator</Th><Th>Delivery Address</Th><Th>Tracking ID</Th><Th>Expected</Th><Th>Delivered</Th><Th>Status</Th><Th className="text-right">Action</Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {active.map((a, i) => (
                <ShipperRow
                  key={a.id}
                  app={a}
                  index={i + 1}
                  address={addrText(a.creator_id)}
                  onSaved={() => qc.invalidateQueries({ queryKey: ["campaign-detail-apps", id] })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------- Content ---------- */}
      {!isReimb && tab === "content" && (() => {
        // Classify each submission: a rejected draft (needs changes), a live post,
        // or a draft awaiting/approved. Cards can carry BOTH a draft video and a
        // live reel link, so we show both.
        const kindOf = (a: Application): "rejected_draft" | "live" | "draft" => {
          if (a.status === "draft_revision") return "rejected_draft";
          if (a.reel_link && ["link_submitted", "review", "completed", "posted"].includes(a.status)) return "live";
          return "draft";
        };
        const withContent = active.filter((a) => a.draft_video_url || a.reel_link || a.submissions?.[0]?.video_url);
        const counts = {
          all: withContent.length,
          draft: withContent.filter((a) => kindOf(a) === "draft").length,
          live: withContent.filter((a) => kindOf(a) === "live").length,
          rejected_draft: withContent.filter((a) => kindOf(a) === "rejected_draft").length,
        };
        const shown = withContent.filter((a) => contentFilter === "all" || kindOf(a) === contentFilter);
        const FILTERS: { key: typeof contentFilter; label: string }[] = [
          { key: "all", label: `All (${counts.all})` },
          { key: "draft", label: `Draft (${counts.draft})` },
          { key: "live", label: `Live (${counts.live})` },
          { key: "rejected_draft", label: `Rejected Draft (${counts.rejected_draft})` },
        ];
        return (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setContentFilter(f.key)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${contentFilter === f.key ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shown.map((a) => <ContentCard key={a.id} app={a} kind={kindOf(a)} />)}
          {shown.length === 0 ? (
            <p className="col-span-full rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
              {counts.all === 0 ? "No content submitted yet." : "No content in this view."}
            </p>
          ) : null}
          </div>
        </div>
        );
      })()}

      {/* ---------- Reports ---------- */}
      {!isReimb && tab === "reports" && (() => {
        const done = active.filter((a) => a.status === "completed");
        const posted = active.filter((a) => !!a.reel_link);
        // Reach = combined follower count of creators who actually posted (real).
        const reach = posted.reduce((s, a) => s + (a.creator?.instagram_followers || a.creator?.youtube_subscribers || 0), 0);
        // Engagement = the real likes+comments recorded per posted reel for THIS campaign.
        const totEngagement = active.reduce((s, a) => s + (Number(a.reel_engagement) || 0), 0);
        const engagedPosts = active.filter((a) => (Number(a.reel_engagement) || 0) > 0);
        const avgEngagement = engagedPosts.length ? Math.round(totEngagement / engagedPosts.length) : 0;
        const ig = active.filter((a) => a.reel_link && /instagram/i.test(a.reel_link)).length;
        const yt = active.filter((a) => a.reel_link && /(youtube|youtu\.be)/i.test(a.reel_link)).length;
        const platformData = [
          { name: "Instagram", value: ig, color: "#F5385D" },
          { name: "YouTube", value: yt, color: "#6366F1" },
        ].filter((d) => d.value > 0);
        // Rank creators by their real recorded engagement for this campaign.
        const top = [...active]
          .filter((a) => (Number(a.reel_engagement) || 0) > 0)
          .sort((a, b) => (Number(b.reel_engagement) || 0) - (Number(a.reel_engagement) || 0))
          .slice(0, 5);
        const barData = top.map((a) => ({
          name: (a.creator?.full_name ?? "?").split(" ")[0],
          engagement: Number(a.reel_engagement) || 0,
          followers: a.creator?.instagram_followers || a.creator?.youtube_subscribers || 0,
        }));
        return (
          <div className="space-y-4">
            {/* Overall insights — all sourced from real per-campaign fields */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard icon={Users} label="Total Creators" value={String(active.length)} />
              <StatCard icon={CheckCircle2} label="Completed" value={String(done.length)} />
              <StatCard icon={Play} label="Posts Live" value={String(posted.length)} />
              <StatCard icon={Eye} label="Audience Reach" value={reach.toLocaleString("en-IN")} />
              <StatCard icon={Heart} label="Total Engagement" value={totEngagement.toLocaleString("en-IN")} />
              <StatCard icon={MessageCircle} label="Avg Engagement / Post" value={avgEngagement.toLocaleString("en-IN")} />
              <StatCard icon={Wallet} label="Total Payout" value={formatCurrency(payout)} />
              <StatCard icon={Gift} label="Referral Paid" value={formatCurrency(referralAmount)} />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Creator performance bar — real recorded engagement */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="mb-3 text-sm font-bold text-ink">Top creators — engagement (likes + comments)</p>
                {barData.length ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={barData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef1f4" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="engagement" name="Engagement" fill="#F5385D" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="py-12 text-center text-sm text-slate-400">No reel engagement recorded yet. Add it from the application&apos;s review panel.</p>}
              </div>

              {/* Platform-wise donut — from actual posted links */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="mb-3 text-sm font-bold text-ink">Platform-wise posts</p>
                {platformData.length ? (
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width="55%" height={200}>
                      <PieChart>
                        <Pie data={platformData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                          {platformData.map((d) => <Cell key={d.name} fill={d.color} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-1.5 text-sm">
                      {platformData.map((d) => (
                        <div key={d.name} className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full" style={{ background: d.color }} />
                          <span className="text-slate-600">{d.name}</span>
                          <b className="text-ink">{d.value}</b>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : <p className="py-12 text-center text-sm text-slate-400">No published posts yet.</p>}
              </div>
            </div>

            {/* Top performing creators table — real per-campaign engagement & payout */}
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <p className="border-b border-slate-200 p-3 text-sm font-bold text-ink">Top Performing Creators</p>
              <table className="w-full min-w-[760px] border-collapse">
                <thead className="bg-slate-50/60">
                  <tr>
                    <Th className="border-b border-slate-200">#</Th>
                    <Th className="border-b border-slate-200">Creator</Th>
                    <Th className="border-b border-slate-200">Followers</Th>
                    <Th className="border-b border-slate-200">Engagement</Th>
                    <Th className="border-b border-slate-200">Payout</Th>
                    <Th className="border-b border-slate-200">Post</Th>
                    <Th className="border-b border-slate-200">Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((a, i) => (
                    <tr key={a.id} className="border-b border-slate-100 last:border-0">
                      <Td>{i + 1}</Td>
                      <Td><CreatorCell app={a} /></Td>
                      <Td>{(a.creator?.instagram_followers || a.creator?.youtube_subscribers || 0).toLocaleString("en-IN")}</Td>
                      <Td>{(Number(a.reel_engagement) || 0).toLocaleString("en-IN")}</Td>
                      <Td>{a.payout_amount ? formatCurrency(a.payout_amount) : "-"}</Td>
                      <Td>{a.reel_link ? <a href={a.reel_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><ExternalLink size={12} /> Link</a> : "-"}</Td>
                      <Td><Badge variant={statusVariant(a.status)}>{statusLabel(a.status)}</Badge></Td>
                    </tr>
                  ))}
                  {top.length === 0 ? <tr><Td className="text-center text-slate-400">No reel engagement recorded yet.</Td></tr> : null}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
