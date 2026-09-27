import { useMemo, useState, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Store, IndianRupee, X, Plus, Search, ChevronRight, ChevronDown, Truck, Package, Megaphone } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Modal, Badge } from "@/components/ui/badge";
import { OrderThread } from "@/components/OrderThread";
import { DateRangeFilter, inRange, type DateRange } from "@/components/DateRangeFilter";
import { formatCurrency, formatDate, orderRef } from "@/lib/utils";

type Seller = { id: string; full_name: string | null; email: string | null };
type SellerPayment = { id: string; seller_id: string; amount: number; note: string | null; brand: string | null; received_on: string | null; created_at: string };
type CampaignRow = {
  id: string;
  seller_id: string | null;
  title: string | null;
  brand_name: string | null;
  status: string | null;
  reward_amount: number;
  cashback_percentage: number;
  campaign_type: string;
};
type AppRow = {
  campaign_id: string;
  status: string;
  payout_amount: number | null;
  applied_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  seller_shipment_status: string | null;
};
type TxnRow = { amount: number; type: string; campaign_id: string | null; created_at: string | null };
type SellerBrand = { id: string; seller_id: string; brand: string };

const PAYOUT_TYPES = ["campaign_payment", "reimbursement"];
const NO_BRAND = "Unassigned";

async function fetchSellersData() {
  const [sellers, payments, campaigns, apps, txns, brands] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email").eq("role", "seller").order("full_name"),
    supabase.from("seller_payments").select("id, seller_id, amount, note, brand, received_on, created_at").order("created_at", { ascending: false }),
    supabase.from("campaigns").select("id, seller_id, title, brand_name, status, reward_amount, cashback_percentage, campaign_type"),
    supabase.from("applications").select("campaign_id, status, payout_amount, applied_at, shipped_at, delivered_at, seller_shipment_status"),
    supabase.from("transactions").select("amount, type, campaign_id, created_at"),
    supabase.from("seller_brands").select("id, seller_id, brand"),
  ]);
  return {
    sellers: (sellers.data ?? []) as Seller[],
    payments: (payments.data ?? []) as SellerPayment[],
    campaigns: (campaigns.data ?? []) as CampaignRow[],
    apps: (apps.data ?? []) as AppRow[],
    txns: (txns.data ?? []) as TxnRow[],
    brands: (brands.data ?? []) as SellerBrand[],
  };
}

// Compact pending campaign-requests panel shown on Seller Management, with quick
// approve/reject and a link to the full Campaign Requests page.
function CampaignRequestsPanel() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: requests = [] } = useQuery({
    queryKey: ["campaign-requests", "all"],
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_requests")
        .select("id, brand_name, product_name, slots, budget, status, created_at, seller:profiles!seller_id(full_name)")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as {
        id: string;
        brand_name: string;
        product_name: string | null;
        slots: number;
        budget: number | null;
        status: string;
        created_at: string;
        seller?: { full_name: string | null } | null;
      }[];
    },
  });

  const decide = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const { error } = await supabase
        .from("campaign_requests")
        .update({ status, reviewed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaign-requests"] }),
  });

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-bold text-ink">
          <Megaphone size={16} /> Campaign requests
          {requests.length > 0 ? (
            <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[11px] font-bold text-rose-600">{requests.length}</span>
          ) : null}
        </p>
        <button onClick={() => navigate("/campaign-requests")} className="text-xs font-semibold text-primary hover:underline">
          View all →
        </button>
      </div>
      {requests.length === 0 ? (
        <p className="text-sm text-slate-400">No pending campaign requests.</p>
      ) : (
        <div className="space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 p-2.5">
              <button onClick={() => navigate("/campaign-requests")} className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-semibold text-ink">
                  {r.brand_name}
                  {r.product_name ? <span className="font-normal text-slate-400"> · {r.product_name}</span> : null}
                </p>
                <p className="text-xs text-slate-400">
                  {r.seller?.full_name ?? "Brand"} · {r.slots} slot{r.slots === 1 ? "" : "s"}
                  {r.budget != null ? ` · ${formatCurrency(r.budget)}` : ""}
                </p>
              </button>
              <Button variant="outline" className="border-rose-200 text-rose-600 hover:bg-rose-50" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, status: "rejected" })}>
                Reject
              </Button>
              <Button disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, status: "approved" })}>
                Approve
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sellers() {
  const qc = useQueryClient();
  const { data: rawData, isLoading } = useQuery({ queryKey: ["sellers-money"], queryFn: fetchSellersData });
  const [dateRange, setDateRange] = useState<DateRange>({ from: null, to: null });

  // Apply the date-range filter to the time-based rows (money received,
  // applications/orders, payout transactions) before aggregating.
  const data = useMemo(() => {
    if (!rawData) return rawData;
    return {
      ...rawData,
      payments: rawData.payments.filter((p) => inRange(p.received_on ?? p.created_at, dateRange)),
      apps: rawData.apps.filter((a) => inRange(a.applied_at, dateRange)),
      txns: rawData.txns.filter((t) => inRange(t.created_at, dateRange)),
    };
  }, [rawData, dateRange]);

  const [payFor, setPayFor] = useState<Seller | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [brand, setBrand] = useState("");
  const [receivedOn, setReceivedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState("Bank Transfer");
  const [reference, setReference] = useState("");
  const [campaignCode, setCampaignCode] = useState("");
  const [payStatus, setPayStatus] = useState("received");
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleRow = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const addPayment = useMutation({
    mutationFn: async () => {
      const value = Number(amount);
      if (!value || value <= 0) throw new Error("Enter a valid amount.");
      const { error } = await supabase.from("seller_payments").insert({
        seller_id: payFor!.id,
        amount: value,
        note: note.trim() || null,
        brand: brand.trim() || null,
        received_on: receivedOn || null,
        payment_mode: paymentMode || null,
        reference: reference.trim() || null,
        campaign_code: campaignCode.trim() || null,
        status: payStatus,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sellers-money"] });
      qc.invalidateQueries({ queryKey: ["brand-payments"] });
      setPayFor(null);
      setAmount("");
      setNote("");
      setBrand("");
      setReceivedOn(new Date().toISOString().slice(0, 10));
      setPaymentMode("Bank Transfer");
      setReference("");
      setCampaignCode("");
      setPayStatus("received");
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "Failed to record payment"),
  });

  const addBrand = useMutation({
    mutationFn: async ({ sellerId, brand }: { sellerId: string; brand: string }) => {
      const value = brand.trim();
      if (!value) return;
      const { error } = await supabase.from("seller_brands").insert({ seller_id: sellerId, brand: value });
      if (error && !String(error.message).includes("duplicate")) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sellers-money"] }),
  });

  const removeBrand = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("seller_brands").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sellers-money"] }),
  });

  // Per-seller money summary + per-brand breakdown. Received comes from
  // recorded deposits (optionally tagged with a brand); Used comes from the
  // real payout transactions on that seller's campaigns, grouped by the
  // campaign's brand.
  const rows = useMemo(() => {
    if (!data) return [];
    const campaignById = new Map(data.campaigns.map((c) => [c.id, c]));

    // Per-seller totals
    const receivedBySeller = new Map<string, number>();
    data.payments.forEach((p) => receivedBySeller.set(p.seller_id, (receivedBySeller.get(p.seller_id) ?? 0) + Number(p.amount)));

    const usedBySeller = new Map<string, number>();
    const doneBySeller = new Map<string, number>();
    const totalBySeller = new Map<string, number>();
    data.apps.forEach((a) => {
      const c = campaignById.get(a.campaign_id);
      if (!c?.seller_id) return;
      if (a.status === "rejected") return;
      totalBySeller.set(c.seller_id, (totalBySeller.get(c.seller_id) ?? 0) + 1);
      if (a.status === "completed") {
        doneBySeller.set(c.seller_id, (doneBySeller.get(c.seller_id) ?? 0) + 1);
      }
    });

    data.txns.forEach((t) => {
      if (!PAYOUT_TYPES.includes(t.type) || !t.campaign_id) return;
      const c = campaignById.get(t.campaign_id);
      if (!c?.seller_id) return;
      usedBySeller.set(c.seller_id, (usedBySeller.get(c.seller_id) ?? 0) + Number(t.amount ?? 0));
    });

    const campaignsBySeller = new Map<string, number>();
    data.campaigns.forEach((c) => {
      if (c.seller_id) campaignsBySeller.set(c.seller_id, (campaignsBySeller.get(c.seller_id) ?? 0) + 1);
    });

    // Per (seller, brand) received & used
    const key = (seller: string, brand: string) => `${seller}::${brand}`;
    const receivedByBrand = new Map<string, number>();
    data.payments.forEach((p) => {
      const b = p.brand?.trim() || NO_BRAND;
      receivedByBrand.set(key(p.seller_id, b), (receivedByBrand.get(key(p.seller_id, b)) ?? 0) + Number(p.amount));
    });
    const usedByBrand = new Map<string, number>();
    data.txns.forEach((t) => {
      if (!PAYOUT_TYPES.includes(t.type) || !t.campaign_id) return;
      const c = campaignById.get(t.campaign_id);
      if (!c?.seller_id) return;
      const b = c.brand_name?.trim() || NO_BRAND;
      usedByBrand.set(key(c.seller_id, b), (usedByBrand.get(key(c.seller_id, b)) ?? 0) + Number(t.amount ?? 0));
    });

    // Applications grouped by campaign, so we can show per-campaign progress and
    // an order/shipment breakdown for each seller.
    const appsByCampaign = new Map<string, AppRow[]>();
    data.apps.forEach((a) => {
      const list = appsByCampaign.get(a.campaign_id) ?? [];
      list.push(a);
      appsByCampaign.set(a.campaign_id, list);
    });

    return data.sellers.map((s) => {
      const received = receivedBySeller.get(s.id) ?? 0;
      const used = usedBySeller.get(s.id) ?? 0;

      // All brands for this seller: managed list + campaign brands + any brand
      // they've received money for.
      const brandSet = new Set<string>();
      data.brands.forEach((sb) => {
        if (sb.seller_id === s.id && sb.brand?.trim()) brandSet.add(sb.brand.trim());
      });
      data.campaigns.forEach((c) => {
        if (c.seller_id === s.id) brandSet.add(c.brand_name?.trim() || NO_BRAND);
      });
      data.payments.forEach((p) => {
        if (p.seller_id === s.id) brandSet.add(p.brand?.trim() || NO_BRAND);
      });
      const managed = data.brands.filter((sb) => sb.seller_id === s.id);
      const brands = [...brandSet]
        .map((b) => {
          const br = receivedByBrand.get(key(s.id, b)) ?? 0;
          const bu = usedByBrand.get(key(s.id, b)) ?? 0;
          const managedRow = managed.find((m) => m.brand.trim() === b);
          return { brand: b, received: br, used: bu, remaining: br - bu, managedId: managedRow?.id ?? null };
        })
        .sort((a, b) => b.used - a.used || b.received - a.received);

      // This seller's campaigns with per-campaign application progress.
      const sellerCampaigns = data.campaigns
        .filter((c) => c.seller_id === s.id)
        .map((c) => {
          const cApps = appsByCampaign.get(c.id) ?? [];
          const active = cApps.filter((a) => a.status !== "rejected");
          return {
            id: c.id,
            title: c.title,
            brand: c.brand_name?.trim() || NO_BRAND,
            type: c.campaign_type,
            status: c.status ?? "—",
            reward: c.reward_amount,
            apps: active.length,
            completed: cApps.filter((a) => a.status === "completed").length,
          };
        })
        .sort((a, b) => b.apps - a.apps);

      // Order/shipment breakdown across this seller's SHIPPABLE campaigns
      // (barter & paid only — reimbursement is bought by the creator, not shipped).
      const shippableCampaignIds = new Set(
        data.campaigns
          .filter((c) => c.seller_id === s.id && (c.campaign_type === "barter" || c.campaign_type === "paid"))
          .map((c) => c.id)
      );
      const sellerApps = data.apps.filter((a) => shippableCampaignIds.has(a.campaign_id) && a.status !== "rejected");
      const shipment = sellerApps.reduce(
        (acc, a) => {
          const shipStatus = (a.seller_shipment_status ?? "").toLowerCase();
          if (a.delivered_at || shipStatus === "delivered") acc.delivered += 1;
          else if (a.shipped_at || shipStatus === "shipped") acc.shipped += 1;
          else if (a.status === "selected" || a.status === "approved" || a.status === "accepted") acc.toShip += 1;
          return acc;
        },
        { toShip: 0, shipped: 0, delivered: 0 }
      );

      return {
        seller: s,
        received,
        used,
        remaining: received - used,
        ordersDone: doneBySeller.get(s.id) ?? 0,
        ordersTotal: totalBySeller.get(s.id) ?? 0,
        campaigns: campaignsBySeller.get(s.id) ?? 0,
        payments: data.payments.filter((p) => p.seller_id === s.id),
        brands,
        managedBrands: managed,
        sellerCampaigns,
        shipment,
      };
    });
  }, [data]);

  // Distinct brands for the currently-selected seller (for the Record-payment picker).
  const brandOptions = useMemo(() => {
    if (!payFor || !data) return [] as string[];
    const set = new Set<string>();
    data.brands.forEach((sb) => {
      if (sb.seller_id === payFor.id && sb.brand?.trim()) set.add(sb.brand.trim());
    });
    data.campaigns.forEach((c) => {
      if (c.seller_id === payFor.id && c.brand_name?.trim()) set.add(c.brand_name.trim());
    });
    data.payments.forEach((p) => {
      if (p.seller_id === payFor.id && p.brand?.trim()) set.add(p.brand.trim());
    });
    return [...set].sort();
  }, [payFor, data]);

  // Overall totals across all sellers (the full picture, independent of search).
  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.received += r.received;
        acc.used += r.used;
        acc.remaining += r.remaining;
        return acc;
      },
      { received: 0, used: 0, remaining: 0 }
    );
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [r.seller.full_name ?? "", r.seller.email ?? "", ...r.brands.map((b) => b.brand)]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-black text-ink">
          <Store size={20} /> Brand Management
        </h2>
        <p className="text-sm text-slate-500">
          Your workspace for handling brands end-to-end. Manage brand accounts, their brands,
          review their campaigns &amp; order progress, track shipments, and record payments received.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">What to do here</p>
        <ul className="mt-2 grid gap-1.5 text-sm text-slate-600 sm:grid-cols-2">
          <li className="flex items-start gap-2"><span className="text-primary">•</span> Keep each brand account&apos;s <b>brands</b> up to date (add/remove).</li>
          <li className="flex items-start gap-2"><span className="text-primary">•</span> Check their <b>campaigns</b> &amp; how many orders are done.</li>
          <li className="flex items-start gap-2"><span className="text-primary">•</span> Track <b>shipments</b> — what&apos;s to ship, in transit, delivered.</li>
          <li className="flex items-start gap-2"><span className="text-primary">•</span> <b>Record payments</b> received and watch remaining budget.</li>
        </ul>
      </div>

      <CampaignRequestsPanel />

      <DateRangeFilter value={dateRange} onChange={setDateRange} />

      {/* Totals across all sellers */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
          <p className="text-lg font-black text-ink">{rows.length}</p>
          <p className="text-[11px] text-slate-400">Brands</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
          <p className="text-lg font-black text-ink">{formatCurrency(totals.received)}</p>
          <p className="text-[11px] text-slate-400">Total received</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
          <p className="text-lg font-black text-amber-600">{formatCurrency(totals.used)}</p>
          <p className="text-[11px] text-slate-400">Total used</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
          <p className={`text-lg font-black ${totals.remaining < 0 ? "text-rose-600" : "text-emerald-600"}`}>
            {formatCurrency(totals.remaining)}
          </p>
          <p className="text-[11px] text-slate-400">Total remaining</p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input
          className="pl-9"
          placeholder="Search brands by name, email or brand…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <p className="text-slate-400">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center text-slate-400">
          No brands yet.
        </div>
      ) : filteredRows.length === 0 ? (
        <p className="text-slate-400">No brands match “{search}”.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="w-8 px-2 py-2.5"></th>
                <th className="px-3 py-2.5 font-semibold">Brand</th>
                <th className="px-3 py-2.5 font-semibold">Brands</th>
                <th className="px-3 py-2.5 text-right font-semibold">Received</th>
                <th className="px-3 py-2.5 text-right font-semibold">Used</th>
                <th className="px-3 py-2.5 text-right font-semibold">Remaining</th>
                <th className="px-3 py-2.5 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => {
                const isOpen = expanded.has(r.seller.id);
                return (
                  <Fragment key={r.seller.id}>
                    <tr className="border-b border-slate-50 align-top hover:bg-slate-50/60">
                      <td className="px-2 py-2.5">
                        <button onClick={() => toggleRow(r.seller.id)} className="text-slate-400 hover:text-slate-700" title="Show details">
                          {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-semibold text-ink">{r.seller.full_name ?? "Brand"}</p>
                        <p className="text-xs text-slate-400">{r.seller.email}</p>
                        <p className="text-[11px] text-slate-400">{r.campaigns} campaigns · {r.ordersDone}/{r.ordersTotal} done</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex max-w-[220px] flex-wrap gap-1">
                          {r.managedBrands.length ? (
                            r.managedBrands.map((b) => (
                              <span key={b.id} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{b.brand}</span>
                            ))
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right text-ink">{formatCurrency(r.received)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right text-amber-600">{formatCurrency(r.used)}</td>
                      <td className={`whitespace-nowrap px-3 py-2.5 text-right font-semibold ${r.remaining < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                        {formatCurrency(r.remaining)}
                      </td>
                      <td className="px-3 py-2.5">
                        <Button size="sm" onClick={() => { setError(null); setPayFor(r.seller); }}>
                          <IndianRupee size={14} /> Record payment
                        </Button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-slate-100 bg-slate-50/40">
                        <td colSpan={7} className="px-4 py-3">
                          <BrandsManager
                            managed={r.managedBrands}
                            adding={addBrand.isPending}
                            onAdd={(brand) => addBrand.mutate({ sellerId: r.seller.id, brand })}
                            onRemove={(id) => removeBrand.mutate(id)}
                          />

                          {/* Order & shipment tracking summary */}
                          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <div className="rounded-xl border border-slate-100 bg-white px-3 py-2">
                              <p className="text-base font-black text-ink">{r.sellerCampaigns.length}</p>
                              <p className="text-[11px] text-slate-400">Campaigns</p>
                            </div>
                            <div className="rounded-xl border border-slate-100 bg-white px-3 py-2">
                              <p className="text-base font-black text-slate-600">{r.shipment.toShip}</p>
                              <p className="text-[11px] text-slate-400">To ship</p>
                            </div>
                            <div className="rounded-xl border border-slate-100 bg-white px-3 py-2">
                              <p className="text-base font-black text-amber-600">{r.shipment.shipped}</p>
                              <p className="text-[11px] text-slate-400">In transit</p>
                            </div>
                            <div className="rounded-xl border border-slate-100 bg-white px-3 py-2">
                              <p className="text-base font-black text-emerald-600">{r.shipment.delivered}</p>
                              <p className="text-[11px] text-slate-400">Delivered</p>
                            </div>
                          </div>

                          {/* This seller's campaigns */}
                          {r.sellerCampaigns.length > 0 && (
                            <div className="mt-3 overflow-hidden rounded-2xl border border-slate-100 bg-white">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-400">
                                    <th className="px-3 py-2 font-semibold">Campaign</th>
                                    <th className="px-3 py-2 font-semibold">Type</th>
                                    <th className="px-3 py-2 font-semibold">Status</th>
                                    <th className="px-3 py-2 text-right font-semibold">Reward</th>
                                    <th className="px-3 py-2 text-right font-semibold">Orders</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {r.sellerCampaigns.map((c) => (
                                    <tr key={c.id} className="border-t border-slate-50">
                                      <td className="px-3 py-2">
                                        <p className="font-medium text-ink">{c.title ?? "Untitled"}</p>
                                        <p className="text-[11px] text-slate-400">{c.brand}</p>
                                      </td>
                                      <td className="px-3 py-2 capitalize text-slate-600">{c.type}</td>
                                      <td className="px-3 py-2">
                                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] capitalize text-slate-600">{c.status}</span>
                                      </td>
                                      <td className="px-3 py-2 text-right text-slate-600">{formatCurrency(c.reward)}</td>
                                      <td className="px-3 py-2 text-right text-slate-600">{c.completed}/{c.apps}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {/* Order fulfilment — synced with the seller */}
                          <SellerOrders sellerId={r.seller.id} />

                          {r.brands.length > 0 && (
                            <div className="mt-3 overflow-hidden rounded-2xl border border-slate-100 bg-white">
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
                                  {r.brands.map((b) => (
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
                          )}

                          {r.payments.length > 0 && (
                            <details className="mt-3">
                              <summary className="cursor-pointer text-xs font-medium text-slate-400 hover:text-slate-600">
                                Payment history ({r.payments.length})
                              </summary>
                              <div className="mt-2 space-y-1">
                                {r.payments.map((p) => (
                                  <div key={p.id} className="flex items-center justify-between text-xs">
                                    <span className="text-slate-500">
                                      {formatDate(p.received_on ?? p.created_at)}
                                      {p.brand ? ` · ${p.brand}` : ""}
                                      {p.note ? ` · ${p.note}` : ""}
                                    </span>
                                    <span className="font-semibold text-ink">{formatCurrency(p.amount)}</span>
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!payFor} onClose={() => setPayFor(null)} title="Record payment received">
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-50 p-3 text-sm">
            <p className="font-semibold text-ink">{payFor?.full_name}</p>
            <p className="text-slate-500">{payFor?.email}</p>
          </div>
          <div>
            <Label>Amount received (₹)</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} min={1} />
          </div>
          <div>
            <Label>Date received</Label>
            <Input type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Payment mode</Label>
              <Select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="UPI">UPI</option>
                <option value="Cash">Cash</option>
                <option value="Cheque">Cheque</option>
                <option value="Other">Other</option>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={payStatus} onChange={(e) => setPayStatus(e.target.value)}>
                <option value="received">Received</option>
                <option value="in_progress">In progress</option>
                <option value="failed">Failed</option>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>UTR / Reference (optional)</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. UPI/bank ref" />
            </div>
            <div>
              <Label>Campaign (optional)</Label>
              <Input value={campaignCode} onChange={(e) => setCampaignCode(e.target.value)} placeholder="e.g. CMP001" />
            </div>
          </div>
          <div>
            <Label>Brand (optional)</Label>
            <Input
              list="seller-brands"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder={brandOptions.length ? "Pick or type a brand" : "e.g. Nykaa"}
            />
            <datalist id="seller-brands">
              {brandOptions.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
            <p className="mt-1 text-xs text-slate-400">Attribute this money to a specific brand this account runs.</p>
          </div>
          <div>
            <Label>Note (optional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. UPI ref / product batch" />
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPayFor(null)}>Cancel</Button>
            <Button onClick={() => addPayment.mutate()} disabled={addPayment.isPending}>
              {addPayment.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function BrandsManager({
  managed,
  adding,
  onAdd,
  onRemove,
}: {
  managed: { id: string; brand: string }[];
  adding: boolean;
  onAdd: (brand: string) => void;
  onRemove: (id: string) => void;
}) {
  const [value, setValue] = useState("");
  const submit = () => {
    const v = value.trim();
    if (!v) return;
    onAdd(v);
    setValue("");
  };
  return (
    <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Brands this account runs</p>
      <div className="flex flex-wrap items-center gap-2">
        {managed.map((b) => (
          <span key={b.id} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
            {b.brand}
            <button onClick={() => onRemove(b.id)} className="text-slate-400 hover:text-rose-600" title="Remove brand">
              <X size={12} />
            </button>
          </span>
        ))}
        {managed.length === 0 && <span className="text-xs text-slate-400">No brands added yet.</span>}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
          placeholder="Type a brand name…"
          className="h-9 max-w-xs"
        />
        <Button size="sm" variant="outline" disabled={adding || !value.trim()} onClick={submit}>
          <Plus size={14} /> Add brand
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Order fulfilment (employee view): which creator, which product, ship-to
// address, shipment status + tracking/code, and a two-way thread with the
// seller. The employee sees the creator; the seller never does.
// ---------------------------------------------------------------------------

type FulfilOrder = {
  id: string;
  status: string;
  ref_no: number | null;
  creator_id: string;
  seller_tracking_id: string | null;
  seller_tracking_code: string | null;
  seller_shipment_status: string | null;
  campaign: { title: string | null; product_name: string | null; brand_name: string | null; campaign_type: string } | null;
  creator: { full_name: string | null } | null;
};

type Addr = { user_id: string; name: string | null; address: string | null; city: string | null; state: string | null; country: string | null; postal_code: string | null; phone: string | null };

const SHIP_VARIANT: Record<string, "success" | "warning" | "default"> = {
  delivered: "success",
  shipped: "warning",
  pending: "default",
};

function SellerOrders({ sellerId }: { sellerId: string }) {
  const [manage, setManage] = useState<FulfilOrder | null>(null);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["seller-fulfil", sellerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select(
          "id, status, ref_no, creator_id, seller_tracking_id, seller_tracking_code, seller_shipment_status, campaign:campaigns!inner(title, product_name, brand_name, campaign_type, seller_id), creator:profiles!creator_id(full_name)"
        )
        .eq("campaign.seller_id", sellerId)
        .in("campaign.campaign_type", ["barter", "paid"])
        .not("status", "in", "(applied,rejected)")
        .order("applied_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as FulfilOrder[];
    },
  });

  const creatorIds = useMemo(() => [...new Set((orders ?? []).map((o) => o.creator_id))], [orders]);

  const { data: addresses } = useQuery({
    queryKey: ["seller-fulfil-addr", sellerId, creatorIds.join(",")],
    enabled: creatorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creator_addresses")
        .select("user_id, name, address, city, state, country, postal_code, phone")
        .in("user_id", creatorIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Keep the latest address per creator.
      const map = new Map<string, Addr>();
      (data ?? []).forEach((a) => {
        if (!map.has((a as Addr).user_id)) map.set((a as Addr).user_id, a as Addr);
      });
      return map;
    },
  });

  if (isLoading) return <p className="mt-3 text-xs text-slate-400">Loading orders…</p>;
  if (!orders || orders.length === 0)
    return <p className="mt-3 text-xs text-slate-400">No orders to fulfil for this brand yet.</p>;

  return (
    <div className="mt-3">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        <Truck size={13} /> Orders to fulfil
      </p>
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className="px-3 py-2 font-semibold">Ref</th>
              <th className="px-3 py-2 font-semibold">Creator</th>
              <th className="px-3 py-2 font-semibold">Product</th>
              <th className="px-3 py-2 font-semibold">Ship to</th>
              <th className="px-3 py-2 font-semibold">Shipment</th>
              <th className="px-3 py-2 font-semibold">Tracking / code</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const addr = addresses?.get(o.creator_id);
              const ship = (o.seller_shipment_status ?? "pending").toLowerCase();
              return (
                <tr key={o.id} className="border-t border-slate-50 align-top">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-500">{orderRef(o.ref_no, "ship")}</td>
                  <td className="px-3 py-2">
                    <p className="font-medium text-ink">{o.creator?.full_name ?? "Creator"}</p>
                    <p className="text-[11px] capitalize text-slate-400">{o.status.replace(/_/g, " ")}</p>
                  </td>
                  <td className="px-3 py-2">
                    <p className="text-slate-700">{o.campaign?.product_name || o.campaign?.title || "—"}</p>
                    <p className="text-[11px] capitalize text-slate-400">{o.campaign?.campaign_type}</p>
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {addr ? `${addr.city ?? ""}${addr.city && addr.postal_code ? " · " : ""}${addr.postal_code ?? ""}` || "—" : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={SHIP_VARIANT[ship] ?? "default"}>{ship}</Badge>
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {o.seller_tracking_id ? <p className="text-xs">📦 {o.seller_tracking_id}</p> : null}
                    {o.seller_tracking_code ? <p className="text-xs">🏷️ {o.seller_tracking_code}</p> : null}
                    {!o.seller_tracking_id && !o.seller_tracking_code ? <span className="text-xs text-slate-300">—</span> : null}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="outline" onClick={() => setManage(o)}>
                      <Package size={14} /> Manage
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal open={!!manage} onClose={() => setManage(null)} title="Manage order">
        {manage && <ManageOrder order={manage} address={addresses?.get(manage.creator_id) ?? null} onClose={() => setManage(null)} sellerId={sellerId} />}
      </Modal>
    </div>
  );
}

function ManageOrder({ order, address, onClose, sellerId }: { order: FulfilOrder; address: Addr | null; onClose: () => void; sellerId: string }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState((order.seller_shipment_status ?? "pending").toLowerCase());
  const [tracking, setTracking] = useState(order.seller_tracking_id ?? "");
  const [code, setCode] = useState(order.seller_tracking_code ?? "");

  const save = useMutation({
    mutationFn: async () => {
      const patch: Record<string, unknown> = {
        seller_shipment_status: status,
        seller_tracking_id: tracking.trim() || null,
        seller_tracking_code: code.trim() || null,
      };
      if (status === "shipped" || status === "delivered") patch.shipped_at = new Date().toISOString();
      if (status === "delivered") patch.delivered_at = new Date().toISOString();
      const { error } = await supabase.from("applications").update(patch).eq("id", order.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["seller-fulfil", sellerId] });
      qc.invalidateQueries({ queryKey: ["sellers-money"] });
      onClose();
    },
  });

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-slate-50 p-3 text-sm">
        <p className="font-semibold text-ink">{order.creator?.full_name ?? "Creator"}</p>
        <p className="text-slate-500">{order.campaign?.product_name || order.campaign?.title} · {order.campaign?.brand_name}</p>
      </div>

      <div className="rounded-xl border border-slate-100 p-3 text-sm">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Ship to</p>
        {address ? (
          <div className="text-slate-700">
            <p className="font-medium">{address.name ?? order.creator?.full_name}</p>
            <p>{[address.address, address.city, address.state, address.postal_code, address.country].filter(Boolean).join(", ")}</p>
            {address.phone ? <p className="text-slate-500">📞 {address.phone}</p> : null}
          </div>
        ) : (
          <p className="text-slate-400">No saved address for this creator.</p>
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
          <Label>Tracking ID / link</Label>
          <Input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Courier tracking" />
        </div>
      </div>
      <div>
        <Label>Discount / coupon code</Label>
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code from the brand" />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
      </div>

      <OrderThread applicationId={order.id} />
    </div>
  );
}
