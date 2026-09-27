import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/auth";
import type { AppNotification } from "../lib/types";

// Internal staff/seller notification types the creator app must never surface
// (internal review notes and seller⇄staff order threads). Creators only see
// their own creator-facing notifications: payments, referrals, KYC/Instagram, etc.
const INTERNAL_TYPES = ["review", "order"] as const;

export function useNotifications() {
  const userId = useAuthStore((s) => s.session?.user?.id);
  const qc = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications:${userId}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["notifications", userId] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);

  return useQuery({
    queryKey: ["notifications", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId as string)
        .not("type", "in", `(${INTERNAL_TYPES.join(",")})`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AppNotification[];
    },
  });
}

export async function markNotificationRead(id: string) {
  await supabase.from("notifications").update({ is_read: true }).eq("id", id);
}
