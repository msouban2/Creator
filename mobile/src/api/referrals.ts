import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/auth";
import type { Profile, Referral } from "../lib/types";

export interface ReferralWithProfile extends Referral {
  referred?: Profile;
}

export function useReferrals(search?: string) {
  const userId = useAuthStore((s) => s.session?.user?.id);
  return useQuery({
    queryKey: ["referrals", userId],
    enabled: !!userId,
    select: (rows: ReferralWithProfile[]) => {
      if (!search) return rows;
      const q = search.toLowerCase();
      return rows.filter((r) => r.referred?.full_name?.toLowerCase().includes(q));
    },
    queryFn: async () => {
      // Security-definer RPC returns ONLY the creators the caller referred
      // (name + avatar) — no other creator can see someone else's referrals.
      const { data, error } = await supabase.rpc("get_my_referrals");
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        referrer_id: userId,
        referred_creator_id: r.referred_creator_id,
        created_at: r.created_at,
        referred: {
          id: r.referred_creator_id,
          full_name: r.full_name,
          profile_image: r.profile_image,
        },
      })) as ReferralWithProfile[];
    },
  });
}

export interface ReferralRewards {
  reimbursement: number;
  barter: number;
  paid: number;
}

export function useReferralRewards() {
  return useQuery({
    queryKey: ["referral_rewards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "referral_rewards")
        .single();
      if (error) throw error;
      return (data?.value ?? {
        reimbursement: 20,
        barter: 50,
        paid: 100,
      }) as ReferralRewards;
    },
  });
}

export function useReferralDetail(referralId: string) {
  return useQuery({
    queryKey: ["referral_detail", referralId],
    enabled: !!referralId,
    queryFn: async () => {
      // Security-definer RPC: returns the referred creator's name/avatar and
      // their campaign progress ONLY if this referral belongs to the caller.
      const { data, error } = await supabase.rpc("get_referral_detail" as never, {
        p_referral_id: referralId,
      } as never);
      if (error) throw error;
      if (!data) throw new Error("Referral not found");
      const d = data as any;

      const breakdown = {
        reimbursement: { complete: 0, inProcess: 0 },
        paid: { complete: 0, inProcess: 0 },
        barter: { complete: 0, inProcess: 0 },
      };
      for (const [type, val] of Object.entries(d.breakdown ?? {})) {
        const key = type as keyof typeof breakdown;
        if (breakdown[key]) {
          breakdown[key] = {
            complete: (val as any)?.complete ?? 0,
            inProcess: (val as any)?.inProcess ?? 0,
          };
        }
      }

      const referral = {
        id: d.id,
        referrer_id: d.referrer_id,
        referred_creator_id: d.referred_creator_id,
        created_at: d.created_at,
        referred: {
          id: d.referred_creator_id,
          full_name: d.full_name,
          profile_image: d.profile_image,
        },
      } as ReferralWithProfile;

      return {
        referral,
        breakdown,
        totalCompleted: d.totalCompleted ?? 0,
      };
    },
  });
}
