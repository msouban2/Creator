import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/auth";

export interface SupportTicket {
  id: string;
  user_id: string;
  subject: string;
  category: string | null;
  status: "open" | "resolved";
  last_message_at: string;
  created_at: string;
}

export interface SupportMessage {
  id: string;
  ticket_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
}

/** All support tickets raised by the signed-in creator, newest activity first. */
export function useMyTickets() {
  const uid = useAuthStore((s) => s.profile?.id);
  return useQuery({
    queryKey: ["support-tickets", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("id, user_id, subject, category, status, last_message_at, created_at")
        .eq("user_id", uid as string)
        .order("last_message_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SupportTicket[];
    },
  });
}

/** Create a Contact Us query with details + optional screenshot. */
export function useCreateTicket() {
  const qc = useQueryClient();
  const uid = useAuthStore((s) => s.profile?.id);
  return useMutation({
    mutationFn: async (input: {
      category: string;
      query: string;
      email: string;
      name: string;
      phone: string;
      imageUri?: string | null;
    }) => {
      let imageUrl: string | null = null;
      if (input.imageUri) {
        const ext = (input.imageUri.split(".").pop() ?? "jpg").toLowerCase().split("?")[0];
        const path = `${uid}/${Date.now()}.${ext}`;
        const resp = await fetch(input.imageUri);
        const buf = await resp.arrayBuffer();
        const { error: upErr } = await supabase.storage
          .from("support-images")
          .upload(path, buf, { contentType: `image/${ext === "jpg" ? "jpeg" : ext}`, upsert: true });
        if (upErr) throw upErr;
        imageUrl = supabase.storage.from("support-images").getPublicUrl(path).data.publicUrl;
      }

      const { data: ticket, error } = await supabase
        .from("support_tickets")
        .insert({
          user_id: uid,
          subject: input.category || "Support query",
          category: input.category || null,
          query: input.query,
          contact_email: input.email.trim() || null,
          contact_name: input.name.trim() || null,
          contact_phone: input.phone.trim() || null,
          image_url: imageUrl,
        })
        .select("id")
        .single();
      if (error) throw error;
      const ticketId = (ticket as { id: string }).id;
      const { error: msgErr } = await supabase
        .from("support_messages")
        .insert({ ticket_id: ticketId, author_id: uid, body: input.query });
      if (msgErr) throw msgErr;
      return ticketId;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["support-tickets", uid] }),
  });
}

/** Messages on one ticket (oldest first). */
export function useTicketMessages(ticketId: string) {
  return useQuery({
    queryKey: ["support-messages", ticketId],
    enabled: !!ticketId,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_messages")
        .select("id, ticket_id, author_id, body, created_at")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SupportMessage[];
    },
  });
}

export function useSendTicketMessage(ticketId: string) {
  const qc = useQueryClient();
  const uid = useAuthStore((s) => s.profile?.id);
  return useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase
        .from("support_messages")
        .insert({ ticket_id: ticketId, author_id: uid, body });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["support-messages", ticketId] });
      qc.invalidateQueries({ queryKey: ["support-tickets", uid] });
    },
  });
}
