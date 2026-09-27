import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Gift, ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Profile } from "@/lib/types";

interface RewardConfig {
  reimbursement: number;
  barter: number;
  paid: number;
}

interface ReferralRow {
  id: string;
  commission_earned: number;
  created_at: string;
  referrer?: Profile | null;
  referred?: Profile | null;
}

async function fetchSettings() {
  const { data, error } = await supabase.from("app_settings").select("*");
  if (error) throw error;
  const map: Record<string, unknown> = {};
  data?.forEach((r: { key: string; value: unknown }) => (map[r.key] = r.value));
  return {
    rewards: (map.referral_rewards as RewardConfig) ?? { reimbursement: 20, barter: 50, paid: 100 },
    barterMin: Number(map.barter_min_followers ?? 500),
  };
}

async function fetchReferralStats() {
  const [total, converted] = await Promise.all([
    supabase.from("referrals").select("id", { count: "exact", head: true }),
    supabase.from("referrals").select("id", { count: "exact", head: true }).gt("commission_earned", 0),
  ]);
  return { total: total.count ?? 0, converted: converted.count ?? 0 };
}

async function fetchReferralList() {
  const { data, error } = await supabase
    .from("referrals")
    .select(
      "id, commission_earned, created_at, referrer:profiles!referrals_referrer_id_fkey(id, full_name, email, profile_image), referred:profiles!referrals_referred_creator_id_fkey(id, full_name, email, profile_image, kyc_status)"
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ReferralRow[];
}

export default function Referrals() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["settings"], queryFn: fetchSettings });
  const stats = useQuery({ queryKey: ["referral-stats"], queryFn: fetchReferralStats });
  const list = useQuery({ queryKey: ["referral-list"], queryFn: fetchReferralList });

  const [rewards, setRewards] = useState<RewardConfig>({ reimbursement: 20, barter: 50, paid: 100 });
  const [barterMin, setBarterMin] = useState(500);

  useEffect(() => {
    if (data) {
      setRewards(data.rewards);
      setBarterMin(data.barterMin);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const updates = [
        supabase.from("app_settings").upsert({ key: "referral_rewards", value: rewards, updated_at: new Date().toISOString() }),
        supabase.from("app_settings").upsert({ key: "barter_min_followers", value: barterMin, updated_at: new Date().toISOString() }),
      ];
      const results = await Promise.all(updates);
      const err = results.find((r) => r.error)?.error;
      if (err) throw err;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Referral Reward Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-500">
            Bonus (₹) paid to the referrer <b>every time</b> their referred creator completes a campaign, based on its type.
          </p>
          <div className="grid grid-cols-3 gap-3">
            {(["reimbursement", "barter", "paid"] as const).map((k) => (
              <div key={k}>
                <Label className="capitalize">{k}</Label>
                <Input
                  type="number"
                  value={rewards[k]}
                  onChange={(e) => setRewards((r) => ({ ...r, [k]: Number(e.target.value) }))}
                />
              </div>
            ))}
          </div>
          <div className="max-w-xs">
            <Label>Barter Minimum Followers</Label>
            <Input type="number" value={barterMin} onChange={(e) => setBarterMin(Number(e.target.value))} />
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save Settings"}
          </Button>
          {save.isSuccess ? <p className="text-sm font-medium text-emerald-600">Saved!</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Referral Analytics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary">
              <Gift size={20} />
            </div>
            <div>
              <p className="text-2xl font-black text-ink">{stats.data?.total ?? 0}</p>
              <p className="text-sm text-slate-500">Total Referrals</p>
            </div>
          </div>
          <div>
            <p className="text-2xl font-black text-ink">{stats.data?.converted ?? 0}</p>
            <p className="text-sm text-slate-500">Bonuses Awarded</p>
          </div>
        </CardContent>
      </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Referrals</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">Referrer</th>
                  <th className="px-4 py-3 font-semibold">Referred creator</th>
                  <th className="px-4 py-3 font-semibold">Commission</th>
                  <th className="px-4 py-3 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody>
                {list.isLoading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                      Loading…
                    </td>
                  </tr>
                ) : list.data?.length ? (
                  list.data.map((r) => (
                    <tr key={r.id} className="border-b border-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-ink">{r.referrer?.full_name ?? "Unknown"}</p>
                        <p className="text-xs text-slate-400">{r.referrer?.email ?? "—"}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <ArrowRight size={14} className="text-slate-300" />
                          <div>
                            <p className="font-semibold text-ink">{r.referred?.full_name ?? "Unknown"}</p>
                            <p className="text-xs text-slate-400">{r.referred?.email ?? "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {Number(r.commission_earned) > 0 ? (
                          <Badge variant="success">{formatCurrency(r.commission_earned)}</Badge>
                        ) : (
                          <Badge variant="info">Pending</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(r.created_at)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                      No referrals yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
