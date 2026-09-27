import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/auth";

export type InstagramRequestStatus = "pending" | "invited" | "connected" | "rejected";

export interface InstagramRequest {
  id: string;
  user_id: string;
  instagram_username: string;
  status: InstagramRequestStatus;
  admin_note: string | null;
  created_at: string;
  invited_at: string | null;
  connected_at: string | null;
}

function cleanUsername(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/[/?#].*$/, "")
    .replace(/^@/, "")
    .trim();
}

export function useMyInstagramRequest() {
  const userId = useAuthStore((s) => s.session?.user?.id);
  return useQuery({
    queryKey: ["instagram_request", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instagram_requests")
        .select("*")
        .eq("user_id", userId as string)
        .maybeSingle();
      if (error) throw error;
      return data as InstagramRequest | null;
    },
  });
}

/** Creates or updates the creator's Instagram verification request. */
export function useRequestInstagram() {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user?.id);
  return useMutation({
    mutationFn: async (rawUsername: string) => {
      const username = cleanUsername(rawUsername);
      if (!username) throw new Error("Enter your Instagram username.");

      const { data: existing } = await supabase
        .from("instagram_requests")
        .select("id, status")
        .eq("user_id", userId as string)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("instagram_requests")
          .update({ instagram_username: username, status: "pending", updated_at: new Date().toISOString() })
          .eq("id", (existing as { id: string }).id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("instagram_requests")
          .insert({ user_id: userId, instagram_username: username, status: "pending" });
        if (error) throw error;
      }
      return username;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["instagram_request"] });
    },
  });
}
