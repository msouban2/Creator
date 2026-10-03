import { useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, ImagePlus, Loader2, Trash2, Search, Download } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Campaign, CampaignType, SellerProduct } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Label } from "@/components/ui/input";
import { Badge, Modal } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";

const TYPE_LABEL: Record<CampaignType, string> = {
  reimbursement: "Reimbursement",
  barter: "Barter",
  paid: "Paid",
};
const TYPE_VARIANT: Record<CampaignType, "info" | "warning" | "success"> = {
  reimbursement: "info",
  barter: "warning",
  paid: "success",
};
const DELIVERABLE_OPTIONS = [
  "Review submission",
  "Review submission and seller feedback",
  "Rating submission",
  "Rating and seller feedback",
  "Only order",
] as const;
const REIMBURSEMENT_INSTRUCTIONS = [
  "📦 Reimbursement Campaign — Steps to Follow",
  "",
  "STEP 1 — Open Product Link\nClick on the provided product link and open the product page.",
  "",
  "STEP 2 — Place Your Order\nOrder the product as instructed. After placing the order, take a clear screenshot of your order confirmation.",
  "",
  "STEP 3 — Upload Order Screenshot\nUpload your order screenshot in the Bilkul App.",
  "",
  "STEP 4 — Receive the Product\nWait for the product to be delivered. Keep the product and packaging safe until all campaign requirements are completed.",
  "",
  "STEP 5 — Use the Product\nUse/test the product properly so you can share your genuine experience.",
  "",
  "STEP 6 — Submit an Honest Review\nPost a review based on your actual experience with the product. If naturally relevant to your experience, you may discuss aspects such as:\n\nUse / usability\nDurability\nQuality\nAffordability\nValue for money",
  "",
  "STEP 7 — Record Review Proof\nRecord a clear video showing that you have submitted your review and upload the recording in the Bilkul App.",
  "",
  "STEP 8 — Seller Feedback\nProvide honest and experience-based seller feedback as required by the campaign.",
  "",
  "STEP 9 — Instagram Tag (Optional)\nIf you wish, tag our Instagram account in your post/story. This is completely optional.",
  "",
  "⚠️ Important: Reviews and seller feedback must reflect your genuine experience. Do not copy another person's review or make claims about the product that you have not personally experienced.",
].join("\n");
const STATUS_VARIANT: Record<string, "success" | "default" | "danger"> = {
  active: "success",
  draft: "default",
  closed: "danger",
  deleted: "danger",
};

// A campaign is treated as "closed" once its deadline passes, even if its stored
// status is still "active" — this mirrors the creator app (which hides expired
// campaigns) so admins see them under the Closed filter. Soft-deleted campaigns
// (deleted_at set) report as "deleted".
function effectiveStatus(c: Campaign): string {
  if (c.deleted_at) return "deleted";
  if (c.status !== "active") return c.status;
  const deadline = c.campaign_deadline ?? c.application_deadline;
  if (deadline && new Date(deadline).getTime() < Date.now()) return "closed";
  return "active";
}

const CATEGORIES = ["Fashion", "Beauty", "Food", "Tech", "Fitness", "Travel", "Lifestyle", "Gaming"];
// Preset shopping platforms; staff can also type a custom one via "Other".
const PLATFORMS = ["Amazon", "Flipkart", "Nykaa", "Purplle", "Ajio", "Website", "Google"];

async function fetchCampaigns() {
  const { data, error } = await supabase
    .from("campaigns")
    .select("*, seller:profiles!seller_id(id, full_name, email)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Campaign[];
}

async function fetchSellers() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("role", "seller")
    .order("full_name");
  if (error) throw error;
  return data as { id: string; full_name: string | null; email: string | null }[];
}

async function fetchSellerProducts() {
  const { data, error } = await supabase
    .from("seller_products")
    .select("*, seller:profiles!seller_id(id, full_name, email)")
    .in("status", ["pending", "approved"])
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as SellerProduct[];
}

// Per-campaign roll-up of application + money data for the campaign overview.
export interface CampaignStats {
  total: number; // non-rejected applications
  applied: number; // status === 'applied' (awaiting selection)
  completed: number; // status === 'completed'
  completedOrders: number; // reimbursement order approved or later
  claimedOrderSpend: number; // Σ purchase_amount (what creators reported paying)
  payout: number; // Σ payout_amount for completed (actual money released per creator)
  referral: number; // Σ referral-bonus transactions for the campaign
}

const EMPTY_STATS: CampaignStats = {
  total: 0,
  applied: 0,
  completed: 0,
  completedOrders: 0,
  claimedOrderSpend: 0,
  payout: 0,
  referral: 0,
};

async function fetchCampaignStats(): Promise<Record<string, CampaignStats>> {
  const [appsRes, txnRes] = await Promise.all([
    supabase.from("applications").select("campaign_id, status, purchase_amount, payout_amount"),
    supabase.from("transactions").select("campaign_id, amount").eq("type", "referral_bonus"),
  ]);
  if (appsRes.error) throw appsRes.error;
  if (txnRes.error) throw txnRes.error;

  const map: Record<string, CampaignStats> = {};
  const get = (id: string) => (map[id] ??= { ...EMPTY_STATS });

  for (const a of (appsRes.data ?? []) as { campaign_id: string | null; status: string; purchase_amount: number | null; payout_amount: number | null }[]) {
    if (!a.campaign_id || a.status === "rejected") continue;
    const s = get(a.campaign_id);
    s.total += 1;
    if (a.status === "applied") s.applied += 1;
    if (["order_approved", "product_received", "content_creation", "submitted", "review", "payment_in_progress", "completed"].includes(a.status)) {
      s.completedOrders += 1;
    }
    if (a.status === "completed") {
      s.completed += 1;
      s.payout += Number(a.payout_amount) || 0;
    }
    s.claimedOrderSpend += Number(a.purchase_amount) || 0;
  }
  for (const t of (txnRes.data ?? []) as { campaign_id: string | null; amount: number | null }[]) {
    if (!t.campaign_id) continue;
    get(t.campaign_id).referral += Number(t.amount) || 0;
  }
  return map;
}

// Planned spend for a campaign — uses the budget the brand allocated when set,
// otherwise falls back to an estimate: reimbursement refunds the product price
// plus cashback; barter/paid pay the reward per slot.
function computedBudget(c: Campaign): number {
  const slots = Number(c.slots) || 0;
  return c.campaign_type === "reimbursement"
    ? (Number(c.reward_amount) + Number(c.cashback_percentage)) * slots
    : Number(c.reward_amount) * slots;
}
function campaignBudget(c: Campaign): number {
  return c.budget != null && Number(c.budget) > 0 ? Number(c.budget) : computedBudget(c);
}

function parsePaidPayoutRange(input: string): number {
  const raw = input.trim();
  if (!raw) return 0;
  const range = raw.match(/^\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*$/);
  if (range) return Number(range[2]);
  const single = Number(raw);
  return Number.isFinite(single) ? single : 0;
}

type FormState = Partial<Campaign> & { campaign_type: CampaignType };

const EMPTY: FormState = {
  title: "",
  brand_name: "",
  campaign_type: "reimbursement",
  campaign_image: "",
  campaign_images: [],
  description: "",
  deliverables: "",
  instructions: "",
  category: "Fashion",
  min_followers: 0,
  max_followers: null,
  slots: 10,
  reward_amount: 0,
  cashback_percentage: 0,
  budget: null,
  cashback_budget: null,
  commission_budget: null,
  referral_amount: null,
  application_deadline: "",
  campaign_deadline: "",
  product_url: "",
  product_name: "",
  asin: "",
  platform: "",
  review_upload_hours: null,
  sample_video_url: "",
  sample_screenshots: [],
  status: "draft",
  seller_id: null,
  seller_name: "",
  campaign_code: "",
};

// Derive the shopping platform from a product purchase link (no extra field to fill).
function platformFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const u = url.toLowerCase();
  if (/amazon\.|amzn\./.test(u)) return "Amazon";
  if (/flipkart\./.test(u)) return "Flipkart";
  if (/nykaa\./.test(u)) return "Nykaa";
  if (/myntra\./.test(u)) return "Myntra";
  if (/meesho\./.test(u)) return "Meesho";
  if (/ajio\./.test(u)) return "Ajio";
  return null;
}

// Human-friendly campaign code — uses the stored code, else auto-generates one
// from the type prefix, year and a short slice of the id (stable per campaign).
function campaignCode(c: Campaign): string {
  if (c.campaign_code && c.campaign_code.trim()) return c.campaign_code.trim();
  const prefix = c.campaign_type === "barter" ? "BR" : c.campaign_type === "paid" ? "PD" : "RB";
  const year = new Date(c.created_at).getFullYear();
  return `${prefix}${year}-${c.id.replace(/-/g, "").slice(0, 5).toUpperCase()}`;
}

// Build a CSV from rows of objects and trigger a download (opens in Excel).
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

// A small labelled metric cell used in the per-campaign overview grid.
function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-sm font-bold ${accent ? "text-primary" : "text-ink"}`}>{value}</p>
    </div>
  );
}

// Per-campaign metrics rendered inline (RevGrowX-style columns, no nested box):
// a group of stat columns followed by the budget block with a usage bar.
function CampaignOverview({ c, stats }: { c: Campaign; stats: CampaignStats }) {
  const budget = campaignBudget(c);
  const budgetLabel = c.budget != null && Number(c.budget) > 0 ? "Campaign Budget" : "Campaign Budget (est.)";
  const isReimb = c.campaign_type === "reimbursement";
  const spent = stats.payout + stats.referral;
  const budgetLeft = Math.max(budget - spent, 0);
  const pct = budget > 0 ? Math.min(Math.round((spent / budget) * 100), 100) : 0;
  const overBudget = spent > budget && budget > 0;
  return (
    <div className="flex flex-1 flex-wrap items-start gap-x-8 gap-y-4">
      {/* Count + amount columns */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {isReimb ? (
          <>
            <Metric label="Total Orders" value={String(stats.total)} />
            <Metric label="Completed Orders" value={String(stats.completedOrders)} />
            <Metric label="Pending Orders" value={String(stats.total - stats.completedOrders)} />
            <Metric label="Used Order Amount" value={formatCurrency(stats.payout)} accent />
            <Metric label="Referral Amount" value={formatCurrency(stats.referral)} />
            <Metric label="Claimed Spend" value={formatCurrency(stats.claimedOrderSpend)} />
          </>
        ) : (
          <>
            <Metric label="Total Creators" value={String(stats.total)} />
            <Metric label="Approved Creators" value={String(stats.total - stats.applied)} />
            <Metric label="Pending Creators" value={String(stats.applied)} />
            <Metric label="Campaign Payout" value={formatCurrency(stats.payout)} accent />
            <Metric label="Referral Amount" value={formatCurrency(stats.referral)} />
            <Metric label="Completed" value={String(stats.completed)} />
          </>
        )}
      </div>

      {/* Budget block with usage bar */}
      <div className="min-w-[220px] flex-1">
        <div className="grid grid-cols-3 gap-x-4">
          <Metric label={budgetLabel} value={formatCurrency(budget)} accent />
          <Metric label="Spent (payout + referral)" value={formatCurrency(spent)} />
          <Metric label="Budget Left" value={formatCurrency(budgetLeft)} accent />
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div className={`h-full rounded-full ${overBudget ? "bg-rose-500" : "bg-primary"}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-[10px] text-slate-400">{overBudget ? "Over budget — " : ""}{pct}% of budget used</p>
      </div>
    </div>
  );
}

export default function Campaigns() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["campaigns"], queryFn: fetchCampaigns });
  const { data: campaignStats = {} } = useQuery({ queryKey: ["campaign-stats"], queryFn: fetchCampaignStats });
  const { data: sellers } = useQuery({ queryKey: ["sellers"], queryFn: fetchSellers });
  const { data: sellerProducts } = useQuery({
    queryKey: ["seller-products", "campaignable"],
    queryFn: fetchSellerProducts,
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const typeFilter = (searchParams.get("type") ?? "all") as CampaignType | "all";
  const statusFilter = searchParams.get("status") ?? "all";
  const brandFilter = searchParams.get("brand") ?? "all";
  const search = searchParams.get("q") ?? "";
  const fromDate = searchParams.get("from") ?? "";
  const toDate = searchParams.get("to") ?? "";

  const setFilter = (key: "type" | "status" | "brand" | "q" | "from" | "to", value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === "all" || value === "") next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromMs = fromDate ? new Date(fromDate).getTime() : null;
    const toMs = toDate ? new Date(toDate).getTime() + 86_400_000 : null; // inclusive of the whole day
    return (data ?? []).filter((c) => {
      const st = effectiveStatus(c);
      // Deleted campaigns only appear under the explicit "deleted" filter.
      if (st === "deleted" && statusFilter !== "deleted") return false;
      const created = new Date(c.created_at).getTime();
      if (fromMs != null && created < fromMs) return false;
      if (toMs != null && created > toMs) return false;
      const matchesSearch =
        !q ||
        [c.title, c.brand_name, c.asin, c.product_name]
          .some((v) => (v ?? "").toLowerCase().includes(q));
      return (
        matchesSearch &&
        (typeFilter === "all" || c.campaign_type === typeFilter) &&
        (statusFilter === "all" || st === statusFilter) &&
        (brandFilter === "all" ||
          (brandFilter === "none" ? !c.brand_name?.trim() : c.brand_name?.trim() === brandFilter))
      );
    });
  }, [data, typeFilter, statusFilter, brandFilter, search, fromDate, toDate]);

  // Headline counts + total planned budget (excludes deleted campaigns).
  const summary = useMemo(() => {
    const all = data ?? [];
    let active = 0, draft = 0, closed = 0, deleted = 0, budget = 0, live = 0;
    for (const c of all) {
      const st = effectiveStatus(c);
      if (st === "deleted") { deleted += 1; continue; }
      live += 1;
      if (st === "active") active += 1;
      else if (st === "draft") draft += 1;
      else if (st === "closed") closed += 1;
      budget += campaignBudget(c);
    }
    return { total: live, active, draft, closed, deleted, budget };
  }, [data]);

  // Distinct brand names typed on campaigns (the "Brand Name" field), for the
  // brand filter dropdown.
  const brandOptions = useMemo(() => {
    const names = new Set<string>();
    (data ?? []).forEach((c) => {
      const n = c.brand_name?.trim();
      if (n) names.add(n);
    });
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [data]);

  const hasUnnamed = useMemo(() => (data ?? []).some((c) => !c.brand_name?.trim()), [data]);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [paidPayoutInput, setPaidPayoutInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // True when the platform is a custom value (not one of the presets).
  const [platformOther, setPlatformOther] = useState(false);

  const isEdit = Boolean(form.id);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const applyProduct = (p: SellerProduct) =>
    setForm((f) => ({
      ...f,
      campaign_type: "reimbursement",
      title: f.title || p.product_name,
      brand_name: p.brand_name || f.brand_name,
      product_name: p.product_name || f.product_name,
      asin: p.asin ?? "",
      product_url: p.product_url ?? "",
      campaign_image: p.image_url ?? f.campaign_image,
      reward_amount: p.price ?? f.reward_amount,
      description: p.description ?? f.description,
      seller_id: p.seller_id,
    }));

  const openCreate = () => {
    setForm(EMPTY);
    setPaidPayoutInput("");
    setPlatformOther(false);
    setError(null);
    setOpen(true);
  };
  const openEdit = (c: Campaign) => {
    setForm({
      ...c,
      campaign_images: c.campaign_images ?? [],
      application_deadline: c.application_deadline?.slice(0, 16) ?? "",
      campaign_deadline: c.campaign_deadline?.slice(0, 16) ?? "",
    });
    setPaidPayoutInput(c.campaign_type === "paid" ? String(c.reward_amount ?? "") : "");
    setPlatformOther(Boolean(c.platform && !PLATFORMS.includes(c.platform)));
    setError(null);
    setOpen(true);
  };

  const onImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    const path = `${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
    const { error: upErr } = await supabase.storage.from("campaign-images").upload(path, file, {
      cacheControl: "3600",
      upsert: true,
    });
    if (upErr) {
      setError(upErr.message);
      setUploading(false);
      return;
    }
    const { data: pub } = supabase.storage.from("campaign-images").getPublicUrl(path);
    set("campaign_image", pub.publicUrl);
    setUploading(false);
  };

  const onCampaignGalleryImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    setError(null);
    const urls: string[] = [];
    for (const file of files) {
      const path = `gallery/${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name.replace(/\s+/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("campaign-images").upload(path, file, { cacheControl: "3600", upsert: true });
      if (upErr) {
        setError(upErr.message);
        setUploading(false);
        return;
      }
      urls.push(supabase.storage.from("campaign-images").getPublicUrl(path).data.publicUrl);
    }
    set("campaign_images", [...(form.campaign_images ?? []), ...urls]);
    setUploading(false);
    e.target.value = "";
  };

  const onReviewSampleVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setError("Choose a video file for the review sample.");
      return;
    }
    setUploading(true);
    setError(null);
    const path = `samples/videos/${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
    const { error: uploadError } = await supabase.storage.from("campaign-images").upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: true,
    });
    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from("campaign-images").getPublicUrl(path);
    set("sample_video_url", data.publicUrl);
    setUploading(false);
    e.target.value = "";
  };

  const onSampleImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    setError(null);
    const urls: string[] = [];
    for (const file of files) {
      const path = `samples/${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name.replace(/\s+/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("campaign-images").upload(path, file, { cacheControl: "3600", upsert: true });
      if (upErr) {
        setError(upErr.message);
        setUploading(false);
        return;
      }
      urls.push(supabase.storage.from("campaign-images").getPublicUrl(path).data.publicUrl);
    }
    set("sample_screenshots", [...(form.sample_screenshots ?? []), ...urls]);
    setUploading(false);
    e.target.value = "";
  };

  const save = useMutation({
    mutationFn: async (payload: FormState) => {
      const record = {
        title: payload.title,
        brand_name: payload.brand_name,
        campaign_type: payload.campaign_type,
        campaign_image: payload.campaign_image || null,
        campaign_images: payload.campaign_images ?? [],
        description: payload.description || null,
        deliverables: payload.deliverables || null,
        instructions:
          payload.campaign_type === "reimbursement"
            ? REIMBURSEMENT_INSTRUCTIONS
            : payload.instructions || null,
        category: payload.category || null,
        min_followers: Number(payload.min_followers) || 0,
        max_followers: payload.max_followers ? Number(payload.max_followers) : null,
        slots: Number(payload.slots) || 1,
        reward_amount: Number(payload.reward_amount) || 0,
        // Reimbursement: the creator only gets the product price refunded, so
        // there is no additional cashback on top.
        cashback_percentage:
          payload.campaign_type === "reimbursement" ? 0 : Number(payload.cashback_percentage) || 0,
        budget: payload.budget != null && String(payload.budget) !== "" ? Number(payload.budget) : null,
        cashback_budget: payload.cashback_budget != null && String(payload.cashback_budget) !== "" ? Number(payload.cashback_budget) : null,
        commission_budget: payload.commission_budget != null && String(payload.commission_budget) !== "" ? Number(payload.commission_budget) : null,
        referral_amount: payload.referral_amount != null && String(payload.referral_amount) !== "" ? Number(payload.referral_amount) : null,
        campaign_deadline: payload.campaign_deadline
          ? new Date(payload.campaign_deadline).toISOString()
          : null,
        application_deadline: payload.application_deadline
          ? new Date(payload.application_deadline).toISOString()
          : null,
        // product link is only used for reimbursement (creator buys it)
        product_url: payload.campaign_type === "reimbursement" ? payload.product_url || null : null,
        product_name: payload.product_name?.trim() || payload.title?.trim() || null,
        platform: payload.platform?.trim() || null,
        // expected ASIN — used across types so staff can match the purchased product
        asin: payload.asin?.trim() || null,
        review_upload_hours:
          payload.campaign_type === "reimbursement" && payload.review_upload_hours
            ? Number(payload.review_upload_hours)
            : null,
        // sample content shown to creators (all campaign types)
        sample_video_url: payload.sample_video_url || null,
        sample_screenshots: payload.sample_screenshots ?? [],
        status: payload.status ?? "draft",
        seller_id: payload.seller_id || null,
        seller_name: payload.seller_name?.trim() || null,
        campaign_code: payload.campaign_code?.trim() || null,
      };
      if (payload.id) {
        const { error } = await supabase.from("campaigns").update(record).eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("campaigns").insert(record);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      setOpen(false);
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "Failed to save"),
  });

  // Reactivate a closed campaign: set it live and clear any deadline that has
  // already passed (a past deadline would immediately re-close it).
  const reactivate = useMutation({
    mutationFn: async (c: Campaign) => {
      const now = Date.now();
      const patch: Record<string, unknown> = { status: "active" };
      if (c.campaign_deadline && new Date(c.campaign_deadline).getTime() < now) patch.campaign_deadline = null;
      if (c.application_deadline && new Date(c.application_deadline).getTime() < now) patch.application_deadline = null;
      const { error } = await supabase.from("campaigns").update(patch).eq("id", c.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaigns"] }),
  });

  // Soft-delete / restore. Deleting keeps all applications, payouts and referral
  // history — the campaign is just hidden from creators and default lists.
  const setDeleted = useMutation({
    mutationFn: async ({ id, deleted }: { id: string; deleted: boolean }) => {
      const { error } = await supabase
        .from("campaigns")
        .update({ deleted_at: deleted ? new Date().toISOString() : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaigns"] }),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.brand_name) {
      setError("Title and brand name are required.");
      return;
    }
    save.mutate(form);
  };

  // Export the currently filtered campaigns (with their live metrics) to CSV.
  const onExportCampaigns = () => {
    const rows = filtered.map((c) => {
      const s = campaignStats[c.id] ?? EMPTY_STATS;
      const budget = campaignBudget(c);
      return {
        Title: c.title,
        Type: TYPE_LABEL[c.campaign_type],
        Status: effectiveStatus(c),
        Brand: c.brand_name ?? "",
        "Campaign Code": campaignCode(c),
        ASIN: c.asin ?? "",
        Slots: c.slots,
        Total: s.total,
        Completed: s.completed,
        Pending: s.total - s.completed,
        Budget: budget,
        Payout: s.payout,
        Referral: s.referral,
        "Budget Left": Math.max(budget - s.payout - s.referral, 0),
        Posted: formatDate(c.created_at),
      };
    });
    exportCsv("campaigns.csv", rows);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{filtered.length} of {data?.length ?? 0} campaigns</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onExportCampaigns}>
            <Download size={16} /> Export CSV
          </Button>
          <Button onClick={openCreate}>
            <Plus size={18} /> New Campaign
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Total Campaigns", value: String(summary.total), tone: "text-ink" },
          { label: "Active", value: String(summary.active), tone: "text-emerald-600" },
          { label: "Draft", value: String(summary.draft), tone: "text-slate-500" },
          { label: "Closed", value: String(summary.closed), tone: "text-rose-600" },
          { label: "Deleted", value: String(summary.deleted), tone: "text-slate-400" },
          { label: "Total Budget", value: formatCurrency(summary.budget), tone: "text-primary" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-slate-100 bg-white p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{s.label}</p>
            <p className={`mt-0.5 text-xl font-extrabold ${s.tone}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setFilter("q", e.target.value)}
            placeholder="Search by title, brand name or ASIN…"
            className="h-10 w-full rounded-full pl-9"
          />
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5">
          <span className="text-xs font-medium text-slate-400">Posted</span>
          <input type="date" value={fromDate} onChange={(e) => setFilter("from", e.target.value)} className="border-0 bg-transparent text-sm text-slate-600 outline-none" />
          <span className="text-slate-300">–</span>
          <input type="date" value={toDate} onChange={(e) => setFilter("to", e.target.value)} className="border-0 bg-transparent text-sm text-slate-600 outline-none" />
          {(fromDate || toDate) && (
            <button onClick={() => { setFilter("from", ""); setFilter("to", ""); }} className="ml-1 text-xs font-semibold text-primary hover:underline">Clear</button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "paid", "barter", "reimbursement"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFilter("type", t)}
            className={
              "rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition-colors " +
              (typeFilter === t ? "bg-primary text-white" : "bg-white text-slate-600 hover:bg-slate-100")
            }
          >
            {t === "all" ? "All types" : t}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-slate-200" />
        {(["all", "active", "draft", "closed", "deleted"] as const).map((st) => (
          <button
            key={st}
            onClick={() => setFilter("status", st)}
            className={
              "rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition-colors " +
              (statusFilter === st ? "bg-ink text-white" : "bg-white text-slate-600 hover:bg-slate-100")
            }
          >
            {st === "all" ? "All status" : st}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <Select
          value={brandFilter}
          onChange={(e) => setFilter("brand", e.target.value)}
          className="h-9 w-auto min-w-[10rem] rounded-full py-0 text-sm"
        >
          <option value="all">All brands</option>
          {hasUnnamed && <option value="none">No brand name</option>}
          {brandOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>
      </div>

      {isLoading ? (
        <p className="text-slate-400">Loading…</p>
      ) : (
        <div className="space-y-4">
          {filtered.map((c) => {
            const est = effectiveStatus(c);
            return (
            <Card key={c.id} className="overflow-hidden">
              <CardContent className="flex flex-col gap-4 p-4 xl:flex-row xl:items-stretch">
                {/* Image */}
                <div className="h-32 w-full shrink-0 overflow-hidden rounded-xl bg-slate-100 xl:w-44">
                  {c.campaign_image ? (
                    <img src={c.campaign_image} alt={c.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-slate-300"><ImagePlus size={28} /></div>
                  )}
                </div>

                {/* Details */}
                <div className="min-w-0 xl:w-72 xl:shrink-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={STATUS_VARIANT[est]}>{est}</Badge>
                    <Badge variant={TYPE_VARIANT[c.campaign_type]}>{TYPE_LABEL[c.campaign_type]}</Badge>
                  </div>
                  <p className="mt-1.5 font-bold leading-snug text-ink">{c.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {c.campaign_type === "reimbursement" ? (
                      <>
                        {(c.platform || platformFromUrl(c.product_url)) ? <>Platform: <span className="text-slate-600">{c.platform || platformFromUrl(c.product_url)}</span> · </> : null}
                        Brand: <span className="text-slate-600">{c.brand_name || "—"}</span>
                        {c.asin ? <> · ASIN: <span className="font-mono text-slate-600">{c.asin}</span></> : null}
                      </>
                    ) : (
                      <>
                        Brand: <span className="text-slate-600">{c.brand_name || "—"}</span>
                        {" · "}Campaign Code: <span className="font-mono text-slate-600">{campaignCode(c)}</span>
                      </>
                    )}
                  </p>
                  {c.product_name ? <p className="truncate text-[11px] text-slate-400">{c.product_name}</p> : null}
                  <div className="mt-2 inline-flex rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary">
                    {c.campaign_type === "reimbursement"
                      ? `Cashback upto ${formatCurrency(c.reward_amount + c.cashback_percentage)}`
                      : c.campaign_type === "barter"
                        ? `Product worth ${formatCurrency(c.reward_amount)}`
                        : `Payout upto ${formatCurrency(c.reward_amount)}`}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-400">
                    <span>Slots: <b className="text-slate-600">{c.slots}</b></span>
                    <span>Posted: <b className="text-slate-600">{formatDate(c.created_at)}</b></span>
                    {c.campaign_deadline ? <span>Deadline: <b className="text-slate-600">{formatDate(c.campaign_deadline)}</b></span> : null}
                  </div>
                </div>

                {/* Metrics + budget */}
                <CampaignOverview c={c} stats={campaignStats[c.id] ?? EMPTY_STATS} />

                {/* Actions */}
                <div className="flex flex-row flex-wrap items-end justify-end gap-2 xl:flex-col xl:items-end">
                  {est === "deleted" ? (
                    <Button variant="success" size="sm" disabled={setDeleted.isPending} onClick={() => setDeleted.mutate({ id: c.id, deleted: false })}>Restore</Button>
                  ) : (
                    <>
                      {est === "closed" && (
                        <Button variant="success" size="sm" disabled={reactivate.isPending} onClick={() => reactivate.mutate(c)}>Reactivate</Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => openEdit(c)}><Pencil size={14} /> Edit</Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-rose-200 text-rose-600 hover:bg-rose-50"
                        disabled={setDeleted.isPending}
                        onClick={() => {
                          if (window.confirm(`Delete "${c.title}"? It will be hidden from creators. Applications and payments are kept and you can restore it later.`)) {
                            setDeleted.mutate({ id: c.id, deleted: true });
                          }
                        }}
                      >
                        <Trash2 size={14} /> Delete
                      </Button>
                      <Button size="sm" onClick={() => navigate(`/campaigns/${c.id}`)}>View Details →</Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );})}
          {filtered.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-slate-400">No campaigns match your filters.</p>
          ) : null}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={isEdit ? "Edit Campaign" : "Create Campaign"}>
        <form onSubmit={onSubmit} className="space-y-4">
          {!isEdit && (sellerProducts?.length ?? 0) > 0 && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <Label>Start from a brand's product</Label>
              <Select
                value=""
                onChange={(e) => {
                  const p = sellerProducts?.find((x) => x.id === e.target.value);
                  if (p) applyProduct(p);
                }}
              >
                <option value="">Choose a product a brand submitted…</option>
                {sellerProducts?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.brand_name} · {p.product_name}
                    {p.asin ? ` · ${p.asin}` : ""}
                    {p.seller?.full_name ? ` (${p.seller.full_name})` : ""}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-emerald-700">
                Prefills brand, product, ASIN, link, price &amp; image from what the brand uploaded.
              </p>
            </div>
          )}
          {/* ─── Section 1 · Posting Campaign ─────────────────────────── */}
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-bold uppercase tracking-wide text-primary">Posting Campaign</h3>

            {/* Campaign type selector */}
            <div>
              <Label>Campaign Type</Label>
              <div className="grid grid-cols-3 gap-2">
                {(["reimbursement", "barter", "paid"] as CampaignType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set("campaign_type", t)}
                    className={
                      "rounded-xl border px-3 py-2 text-sm font-semibold transition-colors " +
                      (form.campaign_type === t
                        ? "border-primary bg-primary text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
                    }
                  >
                    {TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Campaign Title</Label>
                <Input value={form.title ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="Summer Glow Collab" />
              </div>
              <div>
                <Label>Brand Name</Label>
                <Input value={form.brand_name ?? ""} onChange={(e) => set("brand_name", e.target.value)} placeholder="Nykaa" />
              </div>
            </div>

            {form.campaign_type === "reimbursement" && (
              <div>
                <Label>Platform</Label>
                <Select
                  value={platformOther ? "__other__" : (form.platform ?? "")}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "__other__") {
                      setPlatformOther(true);
                      set("platform", "");
                    } else {
                      setPlatformOther(false);
                      set("platform", v);
                    }
                  }}
                >
                  <option value="">Select platform…</option>
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                  <option value="__other__">Other (type below)…</option>
                </Select>
                {platformOther && (
                  <Input
                    className="mt-2"
                    value={form.platform ?? ""}
                    onChange={(e) => set("platform", e.target.value)}
                    placeholder="Type platform name (e.g. Snapdeal, Meesho…)"
                  />
                )}
              </div>
            )}

            {/* Banner image */}
            <div>
              <Label>Banner Image</Label>
              <div className="flex items-center gap-3">
                <div className="h-16 w-24 overflow-hidden rounded-xl bg-slate-100">
                  {form.campaign_image ? (
                    <img src={form.campaign_image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-slate-300">
                      <ImagePlus size={20} />
                    </div>
                  )}
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50">
                  {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
                  {uploading ? "Uploading…" : "Upload banner image"}
                  <input type="file" accept="image/*" className="hidden" onChange={onImage} />
                </label>
              </div>
            </div>

            <div>
              <Label>Gallery Images</Label>
              <p className="mb-2 text-xs text-slate-400">Upload multiple product photos. These are separate from the banner and sample screenshots.</p>
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
                {(form.campaign_images ?? []).map((url, index) => (
                  <div key={`${url}-${index}`} className="relative flex h-20 w-20 items-center justify-center rounded-lg bg-white p-2 ring-1 ring-slate-200">
                    <img src={url} alt={`Campaign gallery ${index + 1}`} className="h-full w-full object-contain" />
                    <button
                      type="button"
                      onClick={() => set("campaign_images", (form.campaign_images ?? []).filter((_, imageIndex) => imageIndex !== index))}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-xs text-white"
                      aria-label={`Remove gallery image ${index + 1}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <label className="flex h-20 min-w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 bg-white px-3 text-primary hover:border-primary">
                  <ImagePlus size={18} />
                  <span className="text-[10px] font-semibold">Upload multiple images</span>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={onCampaignGalleryImages} />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <Select value={form.category ?? ""} onChange={(e) => set("category", e.target.value)}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Slots (creators needed)</Label>
                <Input type="number" min={1} value={form.slots ?? 1} onChange={(e) => set("slots", Number(e.target.value))} />
              </div>
            </div>

            {form.campaign_type === "reimbursement" && (
              <div>
                <Label>Product Purchase Link</Label>
                <Input
                  type="url"
                  value={form.product_url ?? ""}
                  onChange={(e) => set("product_url", e.target.value)}
                  placeholder="https://brand.com/product/123"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Selected creators open this to buy the product, then upload their order proof.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <Label>Product ASIN</Label>
                    <Input
                      value={form.asin ?? ""}
                      onChange={(e) => set("asin", e.target.value)}
                      placeholder="B0XXXXXXX"
                    />
                    <p className="mt-1 text-xs text-slate-400">
                      Staff compare the purchase video against this ASIN.
                    </p>
                  </div>
                  <div>
                    <Label>Product Price (₹)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.reward_amount ?? 0}
                      onChange={(e) => set("reward_amount", Number(e.target.value))}
                      placeholder="Amount the creator pays and gets refunded"
                    />
                  </div>
                </div>
              </div>
            )}

            {form.campaign_type === "barter" && (
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-amber-50/60 p-3">
                <div>
                  <Label>Product Worth (₹)</Label>
                  <Input type="number" min={0} value={form.reward_amount ?? 0} onChange={(e) => set("reward_amount", Number(e.target.value))} placeholder="Value of free product" />
                </div>
                <div>
                  <Label>Minimum Followers</Label>
                  <Input type="number" min={0} value={form.min_followers ?? 500} onChange={(e) => set("min_followers", Number(e.target.value))} />
                </div>
                <p className="col-span-2 text-xs text-slate-400">Brand ships this product to the creator's address (collected in-app).</p>
              </div>
            )}

            {form.campaign_type === "paid" && (
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-emerald-50/60 p-3">
                <div className="col-span-2">
                  <Label>Payout Range (₹)</Label>
                  <Input
                    type="text"
                    value={paidPayoutInput}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPaidPayoutInput(v);
                      if (!v.trim()) {
                        set("reward_amount", 0);
                        return;
                      }
                      set("reward_amount", parsePaidPayoutRange(v));
                    }}
                    placeholder="3000-5000"
                  />
                  <p className="mt-1 text-xs text-slate-400">Enter a simple range like 3000-5000.</p>
                </div>
                <div>
                  <Label>Min Followers</Label>
                  <Input type="number" min={0} value={form.min_followers ?? 0} onChange={(e) => set("min_followers", Number(e.target.value))} />
                </div>
                <div>
                  <Label>Max Followers</Label>
                  <Input type="number" min={0} value={form.max_followers ?? ""} onChange={(e) => set("max_followers", e.target.value ? Number(e.target.value) : null)} placeholder="Optional" />
                </div>
                <p className="col-span-2 text-xs text-slate-400">Product is shipped to the creator's address. Creator uploads a draft video for approval before posting.</p>
              </div>
            )}

            {form.campaign_type !== "reimbursement" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Apply Before</Label>
                  <Input type="datetime-local" value={form.application_deadline ?? ""} onChange={(e) => set("application_deadline", e.target.value)} />
                  <p className="mt-1 text-xs text-slate-400">When applications close (drives the creator's “Applications close in” countdown).</p>
                </div>
                <div>
                  <Label>Campaign Deadline</Label>
                  <Input type="datetime-local" value={form.campaign_deadline ?? ""} onChange={(e) => set("campaign_deadline", e.target.value)} />
                  <p className="mt-1 text-xs text-slate-400">The overall campaign end date shown to creators.</p>
                </div>
              </div>
            )}

            <div>
              <Label>Status</Label>
              <Select value={form.status ?? "draft"} onChange={(e) => set("status", e.target.value as Campaign["status"])}>
                <option value="draft">Draft (hidden)</option>
                <option value="active">Active (live to creators)</option>
                <option value="closed">Closed</option>
              </Select>
            </div>

            <div>
              <Label>Brand (owner)</Label>
              <Select value={form.seller_id ?? ""} onChange={(e) => set("seller_id", e.target.value || null)}>
                <option value="">No brand assigned</option>
                {sellers?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name || s.email || s.id}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-slate-400">
                The assigned brand can see this campaign's creators and their engagement in their Performance view.
              </p>
            </div>

            <div>
              <Label>Brand Name (internal)</Label>
              <Input
                value={form.seller_name ?? ""}
                onChange={(e) => set("seller_name", e.target.value)}
                placeholder="e.g. Acme Retail Pvt Ltd"
              />
              <p className="mt-1 text-xs text-slate-400">
                Shown to the assigned brand only. Never displayed to creators.
              </p>
            </div>
          </div>

          {/* ─── Section 2 · Deliverables ─────────────────────────────── */}
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-bold uppercase tracking-wide text-primary">Deliverables</h3>

            <div>
              <Label>Description</Label>
              <Textarea value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} placeholder="What is this campaign about?" />
            </div>
            <div>
              <Label>Deliverables</Label>
              <Select value={form.deliverables ?? ""} onChange={(e) => set("deliverables", e.target.value)}>
                <option value="">Select deliverables…</option>
                {form.deliverables && !DELIVERABLE_OPTIONS.includes(form.deliverables as (typeof DELIVERABLE_OPTIONS)[number]) && (
                  <option value={form.deliverables}>Current value (custom)</option>
                )}
                {DELIVERABLE_OPTIONS.map((deliverable) => (
                  <option key={deliverable} value={deliverable}>{deliverable}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Instructions</Label>
              {form.campaign_type === "reimbursement" ? (
                <Textarea
                  value={REIMBURSEMENT_INSTRUCTIONS}
                  disabled
                  rows={18}
                  className="cursor-not-allowed border-slate-300 bg-slate-200 text-slate-600 opacity-100"
                />
              ) : (
                <Textarea value={form.instructions ?? ""} onChange={(e) => set("instructions", e.target.value)} placeholder="Tag @brand, use #hashtag…" />
              )}
            </div>

            {form.campaign_type === "reimbursement" ? (
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <Label>Review Sample Video</Label>
                {form.sample_video_url ? (
                  <div className="mt-2 space-y-2">
                    <video src={form.sample_video_url} controls className="max-h-56 w-full rounded-lg bg-black object-contain" />
                    <Button type="button" variant="outline" size="sm" onClick={() => set("sample_video_url", "")}>Remove sample video</Button>
                  </div>
                ) : null}
                <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50">
                  <ImagePlus size={16} /> {uploading ? "Uploading…" : form.sample_video_url ? "Replace review sample video" : "Upload review sample video"}
                  <input type="file" accept="video/*" className="hidden" onChange={onReviewSampleVideo} disabled={uploading} />
                </label>
                <p className="mt-1 text-xs text-slate-400">
                  This campaign-specific video appears when creators tap the review sample eye button.
                </p>
              </div>
            ) : null}

            {form.campaign_type !== "reimbursement" && (
              <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3">
                <p className="mb-2 text-sm font-semibold text-ink">Sample content (shown to creators)</p>
                <div>
                  <Label>Sample / Reference Video URL</Label>
                  <Input type="url" value={form.sample_video_url ?? ""} onChange={(e) => set("sample_video_url", e.target.value)} placeholder="https://… a reference reel creators can watch" />
                </div>
                <div className="mt-3">
                  <Label>Sample screenshots</Label>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {(form.sample_screenshots ?? []).map((url, i) => (
                      <div key={url + i} className="relative">
                        <img src={url} alt="" className="h-20 w-20 rounded-lg object-cover ring-1 ring-slate-200" />
                        <button
                          type="button"
                          onClick={() => set("sample_screenshots", (form.sample_screenshots ?? []).filter((_, j) => j !== i))}
                          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-xs text-white"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-lg border border-dashed border-slate-300 text-2xl text-slate-400 hover:border-primary hover:text-primary">
                      +
                      <input type="file" accept="image/*" multiple className="hidden" onChange={onSampleImages} />
                    </label>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">Add example screenshots so creators know what content to make.</p>
                </div>
              </div>
            )}
          </div>

          {/* ─── Section 3 · Finance ──────────────────────────────────── */}
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-bold uppercase tracking-wide text-primary">Finance</h3>

            <div>
              <Label>Brand Budget (₹)</Label>
              <Input
                type="number"
                min={0}
                value={form.budget ?? ""}
                onChange={(e) => set("budget", e.target.value === "" ? null : Number(e.target.value))}
                placeholder="Total amount allocated for this campaign"
              />
              {(() => {
                const slots = Number(form.slots) || 0;
                const est =
                  form.campaign_type === "reimbursement"
                    ? (Number(form.reward_amount) + Number(form.cashback_percentage)) * slots
                    : Number(form.reward_amount) * slots;
                return (
                  <p className="mt-1 text-xs text-slate-400">
                    Estimated from slots × reward: <b className="text-slate-500">{formatCurrency(est)}</b>. Leave blank to
                    use this estimate. Spend (order refunds / payouts + referral bonuses) is tracked against this budget.
                  </p>
                );
              })()}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {form.campaign_type === "reimbursement" && (
                <div>
                  <Label>Cashback Budget (₹)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.cashback_budget ?? ""}
                    onChange={(e) => set("cashback_budget", e.target.value === "" ? null : Number(e.target.value))}
                    placeholder="0"
                  />
                </div>
              )}
              <div>
                <Label>Commission Budget (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.commission_budget ?? ""}
                  onChange={(e) => set("commission_budget", e.target.value === "" ? null : Number(e.target.value))}
                  placeholder="0"
                />
              </div>
              <div>
                <Label>Referral Amount (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.referral_amount ?? ""}
                  onChange={(e) => set("referral_amount", e.target.value === "" ? null : Number(e.target.value))}
                  placeholder="0"
                />
              </div>
              <div>
                <Label>Total Referral Amount (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  value={
                    Number(form.referral_amount ?? 0) * (Number(form.slots) || 0)
                  }
                  readOnly
                  className="bg-slate-50"
                />
              </div>
            </div>

            {/* Type-specific fields */}
            {form.campaign_type === "reimbursement" && (
              <div className="rounded-xl bg-indigo-50/60 p-3">
                <p className="text-xs font-semibold text-indigo-700">
                  Creator earns {formatCurrency(Number(form.reward_amount) || 0)} total
                  <span className="font-normal text-slate-400"> (product price refunded — no additional amount)</span>
                </p>
                <p className="mt-1 text-xs text-slate-400">No follower requirement — anyone can apply.</p>
              </div>
            )}

          </div>

          {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={save.isPending || uploading}>
              {save.isPending ? "Saving…" : isEdit ? "Save changes" : "Create campaign"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
