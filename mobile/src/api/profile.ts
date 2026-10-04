import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/auth";
import type { CreatorAddress, Kyc, Profile } from "../lib/types";

export function useProfileStats() {
  const userId = useAuthStore((s) => s.session?.user?.id);
  return useQuery({
    queryKey: ["profile_stats", userId],
    enabled: !!userId,
    queryFn: async () => {
      const [completed, ongoing, referrals] = await Promise.all([
        supabase
          .from("applications")
          .select("id", { count: "exact", head: true })
          .eq("creator_id", userId as string)
          .eq("status", "completed"),
        supabase
          .from("applications")
          .select("id", { count: "exact", head: true })
          .eq("creator_id", userId as string)
          .in("status", ["selected", "product_received", "content_creation", "submitted", "review"]),
        supabase
          .from("referrals")
          .select("id", { count: "exact", head: true })
          .eq("referrer_id", userId as string),
      ]);
      return {
        completed: completed.count ?? 0,
        ongoing: ongoing.count ?? 0,
        referrals: referrals.count ?? 0,
      };
    },
  });
}

export function useUploadAvatar() {
  const qc = useQueryClient();
  const refresh = useAuthStore((s) => s.refreshProfile);
  const userId = useAuthStore((s) => s.session?.user?.id);
  return useMutation({
    mutationFn: async (uri: string) => {
      const ext = (uri.split(".").pop() ?? "jpg").toLowerCase().split("?")[0];
      const path = `${userId}/${Date.now()}.${ext}`;
      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, arrayBuffer, { contentType: `image/${ext === "jpg" ? "jpeg" : ext}`, upsert: true });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = pub.publicUrl;

      const { error } = await supabase
        .from("profiles")
        .update({ profile_image: publicUrl })
        .eq("id", userId as string);
      if (error) throw error;
      return publicUrl;
    },
    onSuccess: async () => {
      await refresh();
      qc.invalidateQueries({ queryKey: ["profile_stats"] });
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  const refresh = useAuthStore((s) => s.refreshProfile);
  const userId = useAuthStore((s) => s.session?.user?.id);
  return useMutation({
    mutationFn: async (patch: Partial<Profile>) => {
      const { error } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", userId as string);
      if (error) throw error;
    },
    onSuccess: async () => {
      await refresh();
      qc.invalidateQueries({ queryKey: ["profile_stats"] });
    },
  });
}

export function useCompleteSocialProfile() {
  const qc = useQueryClient();
  const refresh = useAuthStore((s) => s.refreshProfile);
  return useMutation({
    mutationFn: async ({ niches, referralCode }: { niches: string[]; referralCode: string }) => {
      const { error } = await supabase.rpc("complete_social_profile", {
        p_niches: niches,
        p_referral_code: referralCode || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await refresh();
      qc.invalidateQueries({ queryKey: ["profile_stats"] });
    },
  });
}

export function useAddresses() {
  const userId = useAuthStore((s) => s.session?.user?.id);
  return useQuery({
    queryKey: ["addresses", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creator_addresses")
        .select("*")
        .eq("user_id", userId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CreatorAddress[];
    },
  });
}

export interface AddressInput {
  id?: string;
  name?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
}

/** Saves (updates existing, else inserts) the creator's shipping address. */
export function useSaveAddress() {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user?.id);
  return useMutation({
    mutationFn: async (input: AddressInput) => {
      const row = {
        user_id: userId,
        name: input.name ?? null,
        phone: input.phone ?? null,
        address: input.address ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        postal_code: input.postal_code ?? null,
        country: "India",
      };
      if (input.id) {
        const { error } = await supabase.from("creator_addresses").update(row).eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("creator_addresses").insert(row);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["addresses"] });
    },
  });
}

export function useKyc() {
  const userId = useAuthStore((s) => s.session?.user?.id);
  return useQuery({
    queryKey: ["kyc", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kyc")
        .select("*")
        .eq("user_id", userId as string)
        .maybeSingle();
      if (error) throw error;
      return data as Kyc | null;
    },
  });
}
