import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { ExternalLink, Truck, Package } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { signedUrl } from "@/lib/storage";
import type { DealOrder, Application, CampaignSubmission } from "@/lib/types";
import { Badge, Modal } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { OrderThread } from "@/components/OrderThread";
import { DateRangeFilter, inRange, type DateRange } from "@/components/DateRangeFilter";
import { formatDate, formatCurrency, orderRef } from "@/lib/utils";

// Engagement-only creator info (no name/handle — sellers never see identity).
type SafeCreator = {
  id: string;
  instagram_followers: number | null;
  ig_avg_views: number | null;
};

type ReviewVariant = "success" | "danger" | "warning" | "info" | "default";

function reviewState(a: Application): { label: string; variant: ReviewVariant } {
  const rs = a.submissions?.[0]?.review_status;
  if (rs === "approved") return { label: "Approved", variant: "success" };
  if (rs === "rejected") return { label: "Rejected", variant: "danger" };
  if (rs === "revision") return { label: "Needs changes", variant: "warning" };
  if (rs === "pending") return { label: "In review", variant: "info" };
  if (a.status === "completed") return { label: "Completed", variant: "success" };
  return { label: "Awaiting content", variant: "default" };
}

async function fetchSellerOrders() {
  const { data, error } = await supabase
    .from("deal_orders")
    .select("*, campaign:campaigns(id, title, brand_name, product_name, campaign_type, seller_name)")
    .order("deal_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as DealOrder[];
}

async function fetchSellerApplications() {
  const { data, error } = await supabase
    .from("applications")
    .select("*, campaign:campaigns(*), submissions:campaign_submissions(*)")
    .order("applied_at", { ascending: false });
  if (error) throw error;
  return data as Application[];
}

async function fetchSellerPayments() {
  // RLS: seller reads only their own recorded payments.
  const { data, error } = await supabase.from("seller_payments").select("amount, brand");
  if (error) throw error;
  return (data ?? []) as { amount: number; brand: string | null }[];
}

// Cost committed to the creator when an order completes.
function sellerOrderCost(c: { campaign_type?: string; reward_amount?: number; cashback_percentage?: number } | undefined | null): number {
  if (!c) return 0;
  if (c.campaign_type === "reimbursement") return Number(c.reward_amount ?? 0) + Number(c.cashback_percentage ?? 0);
  return Number(c.reward_amount ?? 0);
}

async function fetchSellerCreators() {
  const { data, error } = await supabase.rpc("seller_creators");
  if (error) throw error;
  return (data ?? []) as SafeCreator[];
}

function igFmt(v: number | null | undefined) {
  if (v == null) return "—";
  return v.toLocaleString("en-IN");
}

// ---------------------------------------------------------------------------
// Orders to fulfil (seller view): the seller ships the product and shares the
// tracking / discount code. They see the ship-to address but NEVER the creator's
// identity (anonymous label + name-free address). The team sees the full picture.
// ---------------------------------------------------------------------------

const SHIP_VARIANT: Record<string, "success" | "warning" | "default"> = {
  delivered: "success",
  shipped: "warning",
  pending: "default",
};

type ShipAddr = { user_id: string; name: string | null; address: string | null; city: string | null; state: string | null; country: string | null; postal_code: string | null; phone: string | null };

function SellerFulfilment({ apps, label, highlightRef }: { apps: Application[]; label: (id: string | null | undefined) => string; highlightRef?: string | null }) {
  const [manage, setManage] = useState<Application | null>(null);

  const creatorIds = useMemo(() => [...new Set(apps.map((a) => a.creator_id).filter(Boolean))] as string[], [apps]);

  const { data: addrMap } = useQuery({
    queryKey: ["seller-ship-addr", creatorIds.join(",")],
    enabled: creatorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creator_addresses")
        .select("user_id, name, address, city, state, country, postal_code, phone")
        .in("user_id", creatorIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const map = new Map<string, ShipAddr>();
      (data ?? []).forEach((a) => {
        if (!map.has((a as ShipAddr).user_id)) map.set((a as ShipAddr).user_id, a as ShipAddr);
      });
      return map;
    },
  });

  if (apps.length === 0) return null;

  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink">
        <Truck size={15} /> Orders to fulfil
      </p>
      <p className="mb-2 text-xs text-slate-400">
        Ship each product to the address shown and share the tracking / discount code. You only see the delivery name &amp; address — never the creator&apos;s social profile.
      </p>
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className="px-3 py-2 font-semibold">Ref</th>
              <th className="px-3 py-2 font-semibold">Ship to</th>
              <th className="px-3 py-2 font-semibold">Product</th>
              <th className="px-3 py-2 font-semibold">Shipment</th>
              <th className="px-3 py-2 font-semibold">Tracking / code</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {apps.map((a) => {
              const ship = (a.seller_shipment_status ?? "pending").toLowerCase();
              const addr = a.creator_id ? addrMap?.get(a.creator_id) : null;
              const hit = !!highlightRef && a.ref_no != null && String(a.ref_no) === highlightRef;
              return (
                <tr key={a.id} className={"border-t border-slate-50 align-top " + (hit ? "bg-primary-50/60 ring-1 ring-primary-200" : "")}>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-500">{orderRef(a.ref_no, "ship")}</td>
                  <td className="px-3 py-2">
                    <p className="font-medium text-ink">{addr?.name || label(a.creator_id)}</p>
                    <p className="text-[11px] text-slate-400">{addr?.city ?? ""}{addr?.city && addr?.postal_code ? " · " : ""}{addr?.postal_code ?? ""}</p>
                  </td>
                  <td className="px-3 py-2">
                    <p className="text-slate-700">{a.campaign?.product_name || a.campaign?.title || "—"}</p>
                    <p className="text-[11px] capitalize text-slate-400">{a.campaign?.campaign_type}</p>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={SHIP_VARIANT[ship] ?? "default"}>{ship}</Badge>
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {a.seller_tracking_id ? <p className="text-xs">📦 {a.seller_tracking_id}</p> : null}
                    {a.seller_tracking_code ? <p className="text-xs">🏷️ {a.seller_tracking_code}</p> : null}
                    {!a.seller_tracking_id && !a.seller_tracking_code ? <span className="text-xs text-slate-300">—</span> : null}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="outline" onClick={() => setManage(a)}>
                      <Package size={14} /> Fulfil
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal open={!!manage} onClose={() => setManage(null)} title="Fulfil order">
        {manage && (
          <SellerManageOrder
            app={manage}
            address={manage.creator_id ? addrMap?.get(manage.creator_id) ?? null : null}
            onClose={() => setManage(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function SellerManageOrder({ app, address, onClose }: { app: Application; address: ShipAddr | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState((app.seller_shipment_status ?? "pending").toLowerCase());
  const [tracking, setTracking] = useState(app.seller_tracking_id ?? "");
  const [code, setCode] = useState(app.seller_tracking_code ?? "");
  const [courier, setCourier] = useState(app.seller_courier ?? "");
  const [events, setEvents] = useState(app.seller_tracking_events ?? null);
  const [trackErr, setTrackErr] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("seller_set_tracking", {
        p_application: app.id,
        p_tracking: tracking.trim() || null,
        p_code: code.trim() || null,
        p_status: status,
        p_courier: courier.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["seller-applications"] });
      onClose();
    },
  });

  const track = useMutation({
    mutationFn: async () => {
      // Persist courier + tracking first so the function reads the latest values.
      await supabase.rpc("seller_set_tracking", {
        p_application: app.id,
        p_tracking: tracking.trim() || null,
        p_code: code.trim() || null,
        p_status: status,
        p_courier: courier.trim() || null,
      });
      const { data, error } = await supabase.functions.invoke("track-shipment", { body: { application_id: app.id } });
      if (error) throw error;
      return data as { ok: boolean; error?: string; events?: NonNullable<Application["seller_tracking_events"]> };
    },
    onSuccess: (res) => {
      if (res.ok && res.events) {
        setEvents(res.events);
        setTrackErr(null);
      } else {
        setTrackErr(res.error ?? "Couldn't fetch tracking right now.");
      }
      qc.invalidateQueries({ queryKey: ["seller-applications"] });
    },
    onError: (e: unknown) => setTrackErr(e instanceof Error ? e.message : "Tracking failed."),
  });

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-slate-50 p-3 text-sm">
        <p className="font-semibold text-ink">{app.campaign?.product_name || app.campaign?.title} · {app.campaign?.brand_name}</p>
        <p className="text-slate-500 capitalize">{app.campaign?.campaign_type} order</p>
      </div>

      <div className="rounded-xl border border-slate-100 p-3 text-sm">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Ship to</p>
        {address ? (
          <div className="text-slate-700">
            {address.name ? <p className="font-medium">{address.name}</p> : null}
            <p>{[address.address, address.city, address.state, address.postal_code, address.country].filter(Boolean).join(", ") || "—"}</p>
            {address.phone ? <p className="text-slate-500">📞 {address.phone}</p> : null}
          </div>
        ) : (
          <p className="text-slate-400">No address available yet.</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Shipment status</Label>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="pending">Pending</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
          </Select>
        </div>
        <div>
          <Label>Courier</Label>
          <Select value={courier} onChange={(e) => setCourier(e.target.value)}>
            <option value="">Select courier…</option>
            <option value="delhivery">Delhivery (live)</option>
            <option value="bluedart">Blue Dart</option>
            <option value="dtdc">DTDC</option>
            <option value="ekart">Ekart</option>
            <option value="ecom">Ecom Express</option>
            <option value="dhl">DHL</option>
            <option value="maruti">Maruti</option>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Tracking ID</Label>
          <Input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Courier tracking number" />
        </div>
        <div>
          <Label>Discount / coupon code</Label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code to share with the team" />
        </div>
      </div>

      {/* Live courier tracking */}
      <div className="rounded-xl border border-slate-100 p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <Truck size={13} /> Live tracking
          </p>
          <Button
            variant="outline"
            onClick={() => track.mutate()}
            disabled={track.isPending || !tracking.trim() || !courier}
            title={!courier || !tracking.trim() ? "Add a courier and tracking ID first" : "Fetch live status"}
          >
            {track.isPending ? "Tracking…" : "Track live"}
          </Button>
        </div>
        {trackErr ? <p className="text-xs text-amber-600">{trackErr}</p> : null}
        {events && events.length > 0 ? (
          <ol className="space-y-2">
            {events.map((ev, i) => (
              <li key={i} className="flex gap-2">
                <span className={"mt-1 h-2 w-2 shrink-0 rounded-full " + (i === 0 ? "bg-emerald-500" : "bg-slate-300")} />
                <div className="min-w-0">
                  <p className="text-sm text-slate-700">{ev.detail ?? "Update"}</p>
                  <p className="text-[11px] text-slate-400">
                    {[ev.location, ev.date].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : !trackErr ? (
          <p className="text-xs text-slate-400">No tracking pulled yet. Add courier + tracking ID and tap “Track live”.</p>
        ) : null}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
      </div>

      <OrderThread applicationId={app.id} />
    </div>
  );
}

// Signed-URL image thumbnail for a private bucket object.
function Thumb({ bucket, path, video }: { bucket: string; path: string | null | undefined; video?: boolean }) {
  const { data: url } = useQuery({
    queryKey: ["seller-media", bucket, path],
    queryFn: () => signedUrl(bucket, path),
    enabled: !!path,
  });
  if (!path) return <span className="text-slate-400">—</span>;
  if (!url) return <span className="text-xs text-slate-400">…</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-block">
      {video ? (
        <video src={url} muted className="h-12 w-12 rounded-lg object-cover ring-1 ring-slate-200 transition hover:ring-primary" />
      ) : (
        <img src={url} alt="" className="h-12 w-12 rounded-lg object-cover ring-1 ring-slate-200 transition hover:ring-primary" />
      )}
    </a>
  );
}

function Screens({ paths }: { paths: string[] | null | undefined }) {
  if (!paths?.length) return <span className="text-slate-400">—</span>;
  return (
    <div className="flex gap-1">
      {paths.map((p, i) => (
        <Thumb key={i} bucket="submission-screenshots" path={p} />
      ))}
    </div>
  );
}

function VideoLink({ path }: { path: string | null | undefined }) {
  const { data: url } = useQuery({
    queryKey: ["seller-media", "submission-videos", path],
    queryFn: () => signedUrl("submission-videos", path),
    enabled: !!path,
  });
  if (!path) return <span className="text-slate-400">—</span>;
  if (!url) return <span className="text-xs text-slate-400">…</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
      Watch video
      <ExternalLink size={12} />
    </a>
  );
}

const CONTENT_LINKS: { key: keyof CampaignSubmission; label: string }[] = [
  { key: "reel_url", label: "Reel" },
  { key: "post_url", label: "Post" },
  { key: "story_url", label: "Story" },
  { key: "youtube_url", label: "YouTube" },
];

// The content the creator submitted (reel/post/story/YouTube links, video, note).
function SubmittedContent({ sub }: { sub?: CampaignSubmission }) {
  if (!sub) return <span className="text-slate-400">—</span>;
  const links = CONTENT_LINKS.filter((l) => sub[l.key]);
  if (!links.length && !sub.video_url && !sub.notes) return <span className="text-slate-400">—</span>;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        {links.map((l) => (
          <a
            key={l.key}
            href={sub[l.key] as string}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-200"
          >
            {l.label}
            <ExternalLink size={10} />
          </a>
        ))}
        {sub.video_url ? <VideoLink path={sub.video_url} /> : null}
      </div>
      {sub.notes ? <p className="max-w-[16rem] truncate text-[11px] text-slate-400">“{sub.notes}”</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared data hook — one place to load the seller's orders/applications and
// derive the figures each page needs. React Query dedupes the underlying
// requests, so the three pages share the same cached data.
// ---------------------------------------------------------------------------
function useSellerData(dateRange: DateRange = { from: null, to: null }) {
  const { data: ordersRaw, isLoading: ordersLoading } = useQuery({ queryKey: ["seller-orders"], queryFn: fetchSellerOrders });
  const { data: applicationsRaw, isLoading: appsLoading } = useQuery({
    queryKey: ["seller-applications"],
    queryFn: fetchSellerApplications,
  });
  const { data: creatorRows } = useQuery({ queryKey: ["seller-creators"], queryFn: fetchSellerCreators });
  const { data: sellerPayments } = useQuery({ queryKey: ["seller-payments"], queryFn: fetchSellerPayments });

  // Date-range filter (All time / Today / 7d / 30d / This month / This year / custom).
  const orders = useMemo(
    () => (ordersRaw ?? []).filter((o) => inRange((o.deal_date ?? o.created_at) as string | null, dateRange)),
    [ordersRaw, dateRange]
  );
  const applications = useMemo(
    () => (applicationsRaw ?? []).filter((a) => inRange(a.applied_at, dateRange)),
    [applicationsRaw, dateRange]
  );

  const creatorsById = useMemo(() => {
    const m = new Map<string, SafeCreator>();
    (creatorRows ?? []).forEach((c) => m.set(c.id, c));
    return m;
  }, [creatorRows]);
  const eng = (id: string | null | undefined) => (id ? creatorsById.get(id) : undefined);

  const anonLabel = useMemo(() => {
    const ids = new Set<string>();
    (orders ?? []).forEach((o) => o.creator_id && ids.add(o.creator_id));
    (applications ?? []).forEach((a) => a.creator_id && ids.add(a.creator_id));
    const m = new Map<string, string>();
    Array.from(ids)
      .sort()
      .forEach((id, i) => m.set(id, `Creator ${i + 1}`));
    return m;
  }, [orders, applications]);
  const label = (id: string | null | undefined) => (id ? anonLabel.get(id) ?? "Creator" : "—");

  const productGroups = useMemo(() => {
    const map = new Map<
      string,
      { key: string; product: string; asin: string | null; brand: string | null; orders: DealOrder[] }
    >();
    (orders ?? []).forEach((o) => {
      const key = (o.asin || o.product_name || o.campaign?.product_name || o.campaign?.title || "—").toString();
      const g =
        map.get(key) ?? {
          key,
          product: o.product_name || o.campaign?.product_name || o.campaign?.title || "—",
          asin: o.asin ?? null,
          brand: o.campaign?.brand_name ?? null,
          orders: [],
        };
      g.orders.push(o);
      map.set(key, g);
    });
    return Array.from(map.values());
  }, [orders]);

  const totals = useMemo(() => {
    const received = (sellerPayments ?? []).reduce((s, p) => s + Number(p.amount ?? 0), 0);
    let used = 0;
    let done = 0;
    let num = 0;
    let active = 0;
    const campaignSet = new Set<string>();
    const activeProducts = new Set<string>();
    (applications ?? []).forEach((a) => {
      if (a.status === "applied" || a.status === "rejected") return;
      num += 1;
      if (a.campaign_id) campaignSet.add(a.campaign_id);
      if (a.status === "completed") {
        done += 1;
        used += a.payout_amount != null ? Number(a.payout_amount) : sellerOrderCost(a.campaign);
      } else {
        active += 1;
        activeProducts.add(a.campaign?.product_name || a.campaign?.title || a.campaign_id || "—");
      }
    });
    return { num, done, active, received, used, campaigns: campaignSet.size, activeProducts: activeProducts.size };
  }, [applications, sellerPayments]);

  const brandRows = useMemo(() => {
    const NO_BRAND = "Unassigned";
    const received = new Map<string, number>();
    const used = new Map<string, number>();
    (sellerPayments ?? []).forEach((p) => {
      const b = p.brand?.trim() || NO_BRAND;
      received.set(b, (received.get(b) ?? 0) + Number(p.amount ?? 0));
    });
    (applications ?? []).forEach((a) => {
      if (a.status !== "completed") return;
      const b = a.campaign?.brand_name?.trim() || NO_BRAND;
      const cost = a.payout_amount != null ? Number(a.payout_amount) : sellerOrderCost(a.campaign);
      used.set(b, (used.get(b) ?? 0) + cost);
    });
    const brands = new Set<string>([...received.keys(), ...used.keys()]);
    return [...brands]
      .map((b) => {
        const r = received.get(b) ?? 0;
        const u = used.get(b) ?? 0;
        return { brand: b, received: r, used: u, remaining: r - u };
      })
      .sort((a, b) => b.used - a.used || b.received - a.received);
  }, [applications, sellerPayments]);

  const productStatus = useMemo(() => {
    type Row = {
      product: string;
      brand: string | null;
      type: string | null;
      selected: number;
      shipped: number;
      delivered: number;
      creating: number;
      review: number;
      completed: number;
      total: number;
    };
    const map = new Map<string, Row>();
    (applications ?? []).forEach((a) => {
      if (a.status === "applied" || a.status === "rejected") return;
      const c = a.campaign;
      const key = (c?.product_name || c?.title || a.campaign_id || "—").toString();
      const g: Row =
        map.get(key) ?? {
          product: c?.product_name || c?.title || "—",
          brand: c?.brand_name ?? null,
          type: c?.campaign_type ?? null,
          selected: 0,
          shipped: 0,
          delivered: 0,
          creating: 0,
          review: 0,
          completed: 0,
          total: 0,
        };
      const s = a.status;
      if (s === "completed") g.completed += 1;
      else if (["submitted", "review", "link_submitted"].includes(s)) g.review += 1;
      else if (s === "delivered") g.delivered += 1;
      else if (s === "product_shipped") g.shipped += 1;
      else if (s === "selected") g.selected += 1;
      else g.creating += 1;
      g.total += 1;
      map.set(key, g);
    });
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [applications]);

  const reimbursementApps = useMemo(
    () =>
      (applications ?? []).filter(
        (a) => a.campaign?.campaign_type === "reimbursement" && a.status !== "applied" && a.status !== "rejected"
      ),
    [applications]
  );
  const engagementApps = useMemo(
    () =>
      (applications ?? []).filter(
        (a) =>
          (a.campaign?.campaign_type === "barter" || a.campaign?.campaign_type === "paid") &&
          a.status !== "applied" &&
          a.status !== "rejected"
      ),
    [applications]
  );

  const isLoading = ordersLoading || appsLoading;
  const nothing =
    !isLoading && (orders?.length ?? 0) === 0 && reimbursementApps.length === 0 && engagementApps.length === 0;

  const summary = [
    { label: "Campaigns run", value: String(totals.campaigns) },
    { label: "Active products", value: String(totals.activeProducts) },
    { label: "Active orders", value: String(totals.active) },
    { label: "Orders done/total", value: `${totals.done}/${totals.num}` },
    { label: "Amount received", value: formatCurrency(totals.received) },
    { label: "Amount used", value: formatCurrency(totals.used) },
    { label: "Remaining", value: formatCurrency(totals.received - totals.used) },
  ];

  return {
    isLoading,
    nothing,
    summary,
    label,
    eng,
    brandRows,
    productStatus,
    productGroups,
    reimbursementApps,
    engagementApps,
  };
}

// ---------------------------------------------------------------------------
// Page 1 · Overview — budget & activity at a glance.
// ---------------------------------------------------------------------------
export default function SellerOverview() {
  const [dateRange, setDateRange] = useState<DateRange>({ from: null, to: null });
  const { isLoading, summary, brandRows, nothing } = useSellerData(dateRange);
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-black text-ink">Overview</h2>
        <p className="text-sm text-slate-500">Your budget and activity at a glance. Creators are anonymised.</p>
      </div>

      <DateRangeFilter value={dateRange} onChange={setDateRange} />

      <div className="flex flex-wrap divide-x divide-slate-100 overflow-hidden rounded-2xl border border-slate-100 bg-white">
        {summary.map((s) => (
          <div key={s.label} className="min-w-[8rem] flex-1 px-4 py-3">
            <p className="text-lg font-black text-ink">{isLoading ? "…" : s.value}</p>
            <p className="text-xs text-slate-400">{s.label}</p>
          </div>
        ))}
      </div>

      {brandRows.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-bold text-ink">Budget by brand</p>
          <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2 font-semibold">Brand</th>
                  <th className="px-3 py-2 text-right font-semibold">Received</th>
                  <th className="px-3 py-2 text-right font-semibold">Used</th>
                  <th className="px-3 py-2 text-right font-semibold">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {brandRows.map((b) => (
                  <tr key={b.brand} className="border-t border-slate-50">
                    <td className="px-3 py-2 font-medium text-ink">{b.brand}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{formatCurrency(b.received)}</td>
                    <td className="px-3 py-2 text-right text-amber-600">{formatCurrency(b.used)}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${b.remaining < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                      {formatCurrency(b.remaining)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {nothing && (
        <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center text-slate-400">
          No activity yet. Once creators order and review your products, it will show here.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page 2 · Orders to fulfil — shipping & tracking.
// ---------------------------------------------------------------------------
export function SellerOrdersPage() {
  const [dateRange, setDateRange] = useState<DateRange>({ from: null, to: null });
  const { engagementApps, label, productStatus } = useSellerData(dateRange);
  const [searchParams, setSearchParams] = useSearchParams();
  const [highlightRef, setHighlightRef] = useState<string | null>(null);

  // Deep link from a notification (?ref=<n>): highlight that order.
  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) {
      setHighlightRef(ref);
      const next = new URLSearchParams(searchParams);
      next.delete("ref");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-black text-ink">Orders to fulfil</h2>
        <p className="text-sm text-slate-500">
          Ship products and share the tracking / discount code. You only see the delivery name &amp; address — never the
          creator&apos;s social profile.
        </p>
      </div>

      <DateRangeFilter value={dateRange} onChange={setDateRange} />

      {engagementApps.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center text-slate-400">
          No orders to fulfil right now.
        </div>
      ) : (
        <SellerFulfilment apps={engagementApps} label={label} highlightRef={highlightRef} />
      )}

      {productStatus.length > 0 && (
        <div>
          <p className="mb-1 text-sm font-bold text-ink">Where your orders are</p>
          <p className="mb-2 text-xs text-slate-400">
            Live count of creators at each stage for every product — so you can see exactly what&apos;s happening.
          </p>
          <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2 font-semibold">Product</th>
                  <th className="px-3 py-2 text-center font-semibold">Selected</th>
                  <th className="px-3 py-2 text-center font-semibold">Shipped</th>
                  <th className="px-3 py-2 text-center font-semibold">Delivered</th>
                  <th className="px-3 py-2 text-center font-semibold">Creating</th>
                  <th className="px-3 py-2 text-center font-semibold">In review</th>
                  <th className="px-3 py-2 text-center font-semibold">Completed</th>
                  <th className="px-3 py-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {productStatus.map((p) => (
                  <tr key={p.product} className="border-t border-slate-50">
                    <td className="px-3 py-2">
                      <span className="font-medium text-ink">{p.product}</span>
                      {p.brand ? <span className="ml-1 text-xs text-slate-400">· {p.brand}</span> : null}
                    </td>
                    <td className="px-3 py-2 text-center text-slate-600">{p.selected || "—"}</td>
                    <td className="px-3 py-2 text-center text-slate-600">{p.shipped || "—"}</td>
                    <td className="px-3 py-2 text-center text-slate-600">{p.delivered || "—"}</td>
                    <td className="px-3 py-2 text-center text-slate-600">{p.creating || "—"}</td>
                    <td className="px-3 py-2 text-center font-semibold text-amber-600">{p.review || "—"}</td>
                    <td className="px-3 py-2 text-center font-semibold text-emerald-600">{p.completed || "—"}</td>
                    <td className="px-3 py-2 text-right font-bold text-ink">{p.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page 3 · Products & reviews — per-product journey + submitted content.
// ---------------------------------------------------------------------------
export function SellerProductsPage() {
  const [dateRange, setDateRange] = useState<DateRange>({ from: null, to: null });
  const { productGroups, reimbursementApps, engagementApps, label, eng } = useSellerData(dateRange);
  const nothing = productGroups.length === 0 && reimbursementApps.length === 0 && engagementApps.length === 0;
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-black text-ink">Products &amp; reviews</h2>
        <p className="text-sm text-slate-500">
          How each product is doing — orders, review screenshots &amp; videos, and engagement. Creators are anonymised.
        </p>
      </div>

      <DateRangeFilter value={dateRange} onChange={setDateRange} />

      {nothing && (
        <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center text-slate-400">
          No product activity yet.
        </div>
      )}

      {productGroups.map((g) => {
        const t = g.orders.reduce(
          (a, o) => {
            a.num += o.num_orders || 0;
            a.done += o.delivered_orders || 0;
            a.pending += Math.max((o.num_orders || 0) - (o.delivered_orders || 0), 0);
            a.received += Number(o.total_payment) || 0;
            a.used += Number(o.payment_done) || 0;
            return a;
          },
          { num: 0, done: 0, pending: 0, received: 0, used: 0 }
        );
        const remaining = t.received - t.used;
        return (
          <section key={g.key} className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h3 className="font-black text-ink">{g.product}</h3>
                <p className="text-xs text-slate-400">
                  {g.brand ?? ""}
                  {g.asin ? ` · ${g.asin}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>Orders <b className="text-ink">{t.done}/{t.num}</b></span>
                <span>Pending <b className="text-amber-600">{t.pending}</b></span>
                <span>Received <b className="text-ink">{formatCurrency(t.received)}</b></span>
                <span>Used <b className="text-ink">{formatCurrency(t.used)}</b></span>
                <span>Remaining <b className={remaining > 0 ? "text-rose-600" : "text-emerald-600"}>{formatCurrency(remaining)}</b></span>
              </div>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-2.5">Creator</th>
                    <th className="px-3 py-2.5">Deal date</th>
                    <th className="px-3 py-2.5">Type</th>
                    <th className="px-3 py-2.5 text-right">Orders</th>
                    <th className="px-3 py-2.5 text-right">Delivered</th>
                    <th className="px-3 py-2.5 text-right">Received</th>
                    <th className="px-3 py-2.5 text-right">Used</th>
                    <th className="px-3 py-2.5 text-right">Remaining</th>
                    <th className="px-3 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {g.orders.map((o) => {
                    const r = (Number(o.total_payment) || 0) - (Number(o.payment_done) || 0);
                    return (
                      <tr key={o.id}>
                        <td className="px-3 py-2.5 font-medium text-ink">{label(o.creator_id)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">{o.deal_date ?? "—"}</td>
                        <td className="px-3 py-2.5 text-slate-500">{o.deal_type ?? "—"}</td>
                        <td className="px-3 py-2.5 text-right">{o.num_orders}</td>
                        <td className="px-3 py-2.5 text-right">{o.delivered_orders}</td>
                        <td className="px-3 py-2.5 text-right">{formatCurrency(Number(o.total_payment) || 0)}</td>
                        <td className="px-3 py-2.5 text-right">{formatCurrency(Number(o.payment_done) || 0)}</td>
                        <td className={"px-3 py-2.5 text-right font-semibold " + (r > 0 ? "text-rose-600" : "text-emerald-600")}>
                          {formatCurrency(r)}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge variant={o.status === "done" ? "success" : o.status === "partial" ? "warning" : "default"}>
                            {o.status}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {reimbursementApps.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-black text-ink">Reimbursement reviews</h3>
          <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2.5">Creator</th>
                  <th className="px-3 py-2.5">Product</th>
                  <th className="px-3 py-2.5">Order date</th>
                  <th className="px-3 py-2.5">Order ID</th>
                  <th className="px-3 py-2.5 text-right">Amount</th>
                  <th className="px-3 py-2.5">Review</th>
                  <th className="px-3 py-2.5">Content</th>
                  <th className="px-3 py-2.5">Order proof</th>
                  <th className="px-3 py-2.5">Review screenshots</th>
                  <th className="px-3 py-2.5">Feedback</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {reimbursementApps.map((a) => {
                  const c = a.campaign;
                  const r = reviewState(a);
                  return (
                    <tr key={a.id}>
                      <td className="px-3 py-2.5 font-medium text-ink">{label(a.creator_id)}</td>
                      <td className="px-3 py-2.5 text-slate-500">
                        {c?.product_name ?? c?.title ?? "—"}
                        {c?.asin ? <span className="block font-mono text-[11px] text-slate-400">{c.asin}</span> : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">{a.order_date ? formatDate(a.order_date) : "—"}</td>
                      <td className="px-3 py-2.5 text-slate-500">{a.order_id || "—"}</td>
                      <td className="px-3 py-2.5 text-right">{a.purchase_amount != null ? formatCurrency(a.purchase_amount) : "—"}</td>
                      <td className="px-3 py-2.5"><Badge variant={r.variant}>{r.label}</Badge></td>
                      <td className="px-3 py-2.5"><SubmittedContent sub={a.submissions?.[0]} /></td>
                      <td className="px-3 py-2.5"><Thumb bucket="purchase-orders" path={a.purchase_proof} video /></td>
                      <td className="px-3 py-2.5"><Screens paths={a.submissions?.[0]?.screenshots} /></td>
                      <td className="px-3 py-2.5 text-slate-500">{a.seller_feedback || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {engagementApps.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-black text-ink">Barter &amp; paid creators</h3>
          <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2.5">Creator</th>
                  <th className="px-3 py-2.5">Product</th>
                  <th className="px-3 py-2.5 text-right">Followers</th>
                  <th className="px-3 py-2.5 text-right">Avg views</th>
                  <th className="px-3 py-2.5 text-right">Reel engagement</th>
                  <th className="px-3 py-2.5">Review</th>
                  <th className="px-3 py-2.5">Video</th>
                  <th className="px-3 py-2.5">Reel</th>
                  <th className="px-3 py-2.5">Screenshots</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {engagementApps.map((a) => {
                  const c = a.campaign;
                  const creator = eng(a.creator_id);
                  const reel = a.reel_link || a.submissions?.[0]?.reel_url || null;
                  const r = reviewState(a);
                  return (
                    <tr key={a.id}>
                      <td className="px-3 py-2.5 font-medium text-ink">{label(a.creator_id)}</td>
                      <td className="px-3 py-2.5 text-slate-500">
                        {c?.product_name ?? c?.title ?? "—"}
                        {c?.campaign_type ? (
                          <Badge variant="info" className="ml-1.5 capitalize">
                            {c.campaign_type}
                          </Badge>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-right">{igFmt(creator?.instagram_followers)}</td>
                      <td className="px-3 py-2.5 text-right">{igFmt(creator?.ig_avg_views)}</td>
                      <td className="px-3 py-2.5 text-right">{a.reel_engagement != null ? igFmt(a.reel_engagement) : "—"}</td>
                      <td className="px-3 py-2.5"><Badge variant={r.variant}>{r.label}</Badge></td>
                      <td className="px-3 py-2.5"><VideoLink path={a.submissions?.[0]?.video_url} /></td>
                      <td className="px-3 py-2.5">
                        {reel ? (
                          <a href={reel} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                            Reel
                            <ExternalLink size={12} />
                          </a>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5"><Screens paths={a.submissions?.[0]?.screenshots} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

