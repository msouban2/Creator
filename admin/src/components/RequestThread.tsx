import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Send } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";

type Msg = {
  id: string;
  body: string;
  created_at: string;
  author_id: string | null;
  author_role: string;
  author_name: string | null;
};

/** Seller ⇄ staff discussion thread on a campaign request. */
export function RequestThread({ requestId }: { requestId: string }) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [text, setText] = useState("");
  const myRole = profile?.role === "seller" ? "seller" : "staff";

  const { data: messages, isLoading } = useQuery({
    queryKey: ["req-messages", requestId],
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_request_messages")
        .select("id, body, created_at, author_id, author_role, author_name")
        .eq("request_id", requestId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Msg[];
    },
    enabled: !!requestId,
  });

  const add = useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase.from("campaign_request_messages").insert({
        request_id: requestId,
        author_id: profile?.id,
        author_role: myRole,
        author_name: profile?.full_name ?? (myRole === "seller" ? "Brand" : "Team"),
        body,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["req-messages", requestId] });
    },
  });

  const submit = () => {
    const t = text.trim();
    if (!t || add.isPending) return;
    add.mutate(t);
  };

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-3">
      <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <MessageSquare size={13} /> Discussion
        <span className="font-normal normal-case text-slate-300">· between the team &amp; the brand</span>
      </p>

      {isLoading ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : (messages?.length ?? 0) === 0 ? (
        <p className="text-xs text-slate-400">No messages yet. Start the conversation below.</p>
      ) : (
        <div className="space-y-2.5">
          {messages!.map((m) => {
            const isSeller = m.author_role === "seller";
            return (
              <div key={m.id} className={"rounded-xl p-2.5 " + (isSeller ? "bg-amber-50" : "bg-slate-50")}>
                <div className="mb-0.5 flex items-center gap-2">
                  <span className="text-xs font-semibold text-ink">{m.author_name ?? (isSeller ? "Brand" : "Team")}</span>
                  <span
                    className={
                      "rounded-full px-1.5 py-0.5 text-[10px] font-semibold " +
                      (isSeller ? "bg-amber-200 text-amber-800" : "bg-slate-200 text-slate-600")
                    }
                  >
                    {isSeller ? "Brand" : "Team"}
                  </span>
                  <span className="text-[10px] text-slate-400">{formatDate(m.created_at)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-slate-700">{m.body}</p>
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
          placeholder={myRole === "seller" ? "Message the team about this request…" : "Message the brand…"}
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
