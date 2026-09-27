import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Send } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { formatDate, orderRef } from "@/lib/utils";

type OrderComment = {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  author_role: string;
  author_name: string | null;
};

/**
 * Two-way order thread shared by the seller-handling employee and the seller.
 * Both post here to coordinate a shipment ("please share the code" / "here's the
 * tracking id"), and each side sees who posted. The creator is never involved
 * and their identity is never shown here.
 */
export function OrderThread({ applicationId }: { applicationId: string }) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [text, setText] = useState("");
  const myRole = profile?.role === "seller" ? "seller" : "staff";

  const { data: refNo } = useQuery({
    queryKey: ["order-ref", applicationId],
    queryFn: async () => {
      const { data } = await supabase.from("applications").select("ref_no").eq("id", applicationId).maybeSingle();
      return (data as { ref_no: number | null } | null)?.ref_no ?? null;
    },
    enabled: !!applicationId,
  });

  const { data: comments, isLoading } = useQuery({
    queryKey: ["order-comments", applicationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_comments")
        .select("id, body, created_at, author_id, author_role, author_name")
        .eq("application_id", applicationId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as OrderComment[];
    },
    enabled: !!applicationId,
  });

  const add = useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase.from("order_comments").insert({
        application_id: applicationId,
        author_id: profile?.id,
        author_role: myRole,
        author_name: profile?.full_name ?? (myRole === "seller" ? "Brand" : "Team"),
        body,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["order-comments", applicationId] });
    },
  });

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || add.isPending) return;
    add.mutate(trimmed);
  };

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-3">
      <p className="mb-3 flex flex-wrap items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <MessageSquare size={13} /> Order conversation
        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] tracking-normal text-slate-500">
          {orderRef(refNo, "ship")}
        </span>
        <span className="font-normal normal-case text-slate-300">· between the team &amp; the brand</span>
      </p>

      {isLoading ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : (comments?.length ?? 0) === 0 ? (
        <p className="text-xs text-slate-400">No messages yet. Start the conversation below.</p>
      ) : (
        <div className="space-y-2.5">
          {comments!.map((c) => {
            const isSeller = c.author_role === "seller";
            return (
              <div key={c.id} className={"rounded-xl p-2.5 " + (isSeller ? "bg-amber-50" : "bg-slate-50")}>
                <div className="mb-0.5 flex items-center gap-2">
                  <span className="text-xs font-semibold text-ink">
                    {c.author_name ?? (isSeller ? "Brand" : "Team")}
                  </span>
                  <span
                    className={
                      "rounded-full px-1.5 py-0.5 text-[10px] font-semibold " +
                      (isSeller ? "bg-amber-200 text-amber-800" : "bg-slate-200 text-slate-600")
                    }
                  >
                    {isSeller ? "Brand" : "Team"}
                  </span>
                  <span className="text-[10px] text-slate-400">{formatDate(c.created_at)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-slate-700">{c.body}</p>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex items-end gap-2">
        <Textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            myRole === "seller"
              ? "Message the team (e.g. 'Shipped, tracking is …' or 'Here's the discount code')"
              : "Message the brand (e.g. 'Please share the discount code / tracking id for this order')"
          }
          className="flex-1"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
          }}
        />
        <Button onClick={submit} disabled={!text.trim() || add.isPending} className="shrink-0">
          <Send size={14} /> {add.isPending ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  );
}
