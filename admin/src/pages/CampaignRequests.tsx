import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Plus, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/store/auth";
import { Badge, Modal } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { RequestThread } from "@/components/RequestThread";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { CampaignRequest } from "@/lib/types";

function statusVariant(s: string): "warning" | "success" | "danger" {
  return s === "approved" ? "success" : s === "rejected" ? "danger" : "warning";
}

// ---------- Seller: new request form ----------
function NewRequestForm({ sellerId, onDone }: { sellerId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [brand, setBrand] = useState("");
  const [product, setProduct] = useState("");
  const [slots, setSlots] = useState("1");
  const [budget, setBudget] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("campaign_requests").insert({
        seller_id: sellerId,
        brand_name: brand.trim(),
        product_name: product.trim() || null,
        slots: Math.max(1, Number(slots) || 1),
        budget: budget.trim() ? Number(budget) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign-requests"] });
      onDone();
    },
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Brand *</Label>
          <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Acme Beauty" />
        </div>
        <div>
          <Label>Product</Label>
          <Input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="e.g. Vitamin C serum" />
        </div>
        <div>
          <Label>Budget (₹)</Label>
          <Input type="number" min={0} value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="e.g. 5000" />
        </div>
        <div>
          <Label>Slots (creators) *</Label>
          <Input type="number" min={1} value={slots} onChange={(e) => setSlots(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone}>Cancel</Button>
        <Button onClick={() => create.mutate()} disabled={!brand.trim() || create.isPending}>
          {create.isPending ? "Sending…" : "Submit request"}
        </Button>
      </div>
    </div>
  );
}

// ---------- Shared: details + (staff) decision ----------
function RequestDetail({ req, staff, onClose }: { req: CampaignRequest; staff: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [note, setNote] = useState(req.admin_note ?? "");

  const decide = useMutation({
    mutationFn: async (status: "approved" | "rejected") => {
      const { error } = await supabase
        .from("campaign_requests")
        .update({ status, admin_note: note.trim() || null, reviewed_by: profile?.id, reviewed_at: new Date().toISOString() })
        .eq("id", req.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign-requests"] });
      onClose();
    },
  });

  const rows: [string, string][] = [
    ["Brand", req.brand_name],
    ["Product", req.product_name ?? "—"],
    ["Budget", req.budget != null ? formatCurrency(req.budget) : "—"],
    ["Slots", String(req.slots)],
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-slate-50 p-3 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2">
            <span className="text-slate-400">{k}</span>
            <span className="font-medium capitalize text-ink">{v}</span>
          </div>
        ))}
      </div>
      {req.notes ? <p className="whitespace-pre-wrap rounded-xl border border-slate-100 p-3 text-sm text-slate-600">{req.notes}</p> : null}

      {staff && req.status === "pending" ? (
        <div className="space-y-2 rounded-xl border border-slate-100 p-3">
          <Label>Decision note (shared with the brand)</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Optional note…" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="border-rose-200 text-rose-600 hover:bg-rose-50" disabled={decide.isPending} onClick={() => decide.mutate("rejected")}>
              <XCircle size={15} /> Reject
            </Button>
            <Button disabled={decide.isPending} onClick={() => decide.mutate("approved")}>
              <CheckCircle2 size={15} /> Approve
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-400">Status</span>
          <Badge variant={statusVariant(req.status)}>{req.status}</Badge>
          {req.admin_note ? <span className="text-slate-500">· {req.admin_note}</span> : null}
        </div>
      )}

      <RequestThread requestId={req.id} />
    </div>
  );
}

export default function CampaignRequests() {
  const { profile } = useAuth();
  const isSeller = profile?.role === "seller";
  const staff = profile?.role === "admin" || profile?.role === "employee";
  const [creating, setCreating] = useState(false);
  const [active, setActive] = useState<CampaignRequest | null>(null);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">(staff ? "pending" : "all");

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["campaign-requests", isSeller ? profile?.id : "all"],
    queryFn: async () => {
      let q = supabase
        .from("campaign_requests")
        .select("*, seller:profiles!seller_id(id, full_name, email)")
        .order("created_at", { ascending: false });
      if (isSeller && profile?.id) q = q.eq("seller_id", profile.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as CampaignRequest[];
    },
    refetchInterval: 30000,
  });

  const list = requests.filter((r) => (filter === "all" ? true : r.status === filter));
  const pendingCount = requests.filter((r) => r.status === "pending").length;

  // Deep-link: open the specific request when navigated to with ?id=
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const id = searchParams.get("id");
    if (!id || !requests.length) return;
    const found = requests.find((r) => r.id === id);
    if (found) {
      setActive(found);
      setFilter("all");
      const next = new URLSearchParams(searchParams);
      next.delete("id");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, requests]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black text-ink">
            <Megaphone size={20} /> Campaign requests
          </h2>
          <p className="text-sm text-slate-500">
            {isSeller ? "Request your next campaign — brand, slots, and budget. The team reviews it here." : "Brands' campaign requests to review and approve."}
          </p>
        </div>
        {isSeller ? (
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} /> New request
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["pending", "approved", "rejected", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={
              "flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition-colors " +
              (filter === f ? "bg-ink text-white" : "bg-white text-slate-600 hover:bg-slate-100")
            }
          >
            {f}
            {f === "pending" && pendingCount > 0 ? (
              <span className={"rounded-full px-1.5 py-0.5 text-xs font-bold " + (filter === f ? "bg-white text-ink" : "bg-rose-100 text-rose-600")}>
                {pendingCount}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-slate-400">Loading…</p>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center">
          <Megaphone size={30} className="mx-auto text-slate-300" />
          <p className="mt-3 font-semibold text-ink">No {filter === "all" ? "" : filter} requests</p>
          {isSeller ? <p className="mt-1 text-sm text-slate-500">Tap “New request” to propose your next campaign.</p> : null}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-400">
                {!isSeller ? <th className="px-3 py-2.5 font-semibold">Brand</th> : null}
                <th className="px-3 py-2.5 font-semibold">Brand</th>
                <th className="px-3 py-2.5 text-right font-semibold">Slots</th>
                <th className="px-3 py-2.5 text-right font-semibold">Budget</th>
                <th className="px-3 py-2.5 font-semibold">Requested</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {list.map((r) => (
                <tr key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setActive(r)}>
                  {!isSeller ? <td className="px-3 py-2.5 font-medium text-ink">{r.seller?.full_name ?? "Brand"}</td> : null}
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-ink">{r.brand_name}</p>
                    {r.product_name ? <p className="text-xs text-slate-400">{r.product_name}</p> : null}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{r.slots}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{r.budget != null ? formatCurrency(r.budget) : "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">{formatDate(r.created_at)}</td>
                  <td className="px-3 py-2.5">
                    <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Request a campaign">
        {profile?.id ? <NewRequestForm sellerId={profile.id} onDone={() => setCreating(false)} /> : null}
      </Modal>

      <Modal open={!!active} onClose={() => setActive(null)} title={active ? `${active.brand_name} · ${active.campaign_type}` : ""}>
        {active ? <RequestDetail req={active} staff={staff} onClose={() => setActive(null)} /> : null}
      </Modal>
    </div>
  );
}
