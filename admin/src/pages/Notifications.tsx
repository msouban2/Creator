import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { AppNotification } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label, Select } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";

async function fetchNotifications() {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data as AppNotification[];
}

export default function Notifications() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["notifications"], queryFn: fetchNotifications });

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState<"all" | "creator">("all");

  const broadcast = useMutation({
    mutationFn: async () => {
      const { data: creators, error: cErr } = await supabase
        .from("profiles")
        .select("id")
        .eq("role", audience === "all" ? "creator" : audience);
      if (cErr) throw cErr;
      const rows = (creators ?? []).map((c) => ({
        user_id: c.id,
        title,
        message,
        type: "announcement",
        is_read: false,
      }));
      if (rows.length === 0) return;
      const { error } = await supabase.from("notifications").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      setTitle("");
      setMessage("");
    },
  });

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Broadcast Notification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Audience</Label>
            <Select value={audience} onChange={(e) => setAudience(e.target.value as "all" | "creator")}>
              <option value="all">All Creators</option>
              <option value="creator">Creators</option>
            </Select>
          </div>
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New campaigns live! 🎉" />
          </div>
          <div>
            <Label>Message</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Check out the latest brand collabs…" />
          </div>
          <Button onClick={() => broadcast.mutate()} disabled={!title || broadcast.isPending}>
            <Send size={16} /> {broadcast.isPending ? "Sending…" : "Send to all"}
          </Button>
          {broadcast.isSuccess ? <p className="text-sm font-medium text-emerald-600">Sent!</p> : null}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Recent Notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <p className="text-slate-400">Loading…</p>
          ) : (
            data?.map((n) => (
              <div key={n.id} className="rounded-xl border border-slate-100 p-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-ink">{n.title}</p>
                  <span className="text-xs text-slate-400">{formatDate(n.created_at)}</span>
                </div>
                {n.message ? <p className="text-sm text-slate-500">{n.message}</p> : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
