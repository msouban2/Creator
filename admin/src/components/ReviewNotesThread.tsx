import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Send, Eye, EyeOff, History, ListFilter, UserCog } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Textarea, Select } from "@/components/ui/input";
import { formatDate, orderRef } from "@/lib/utils";

type ReviewNote = {
  id: string;
  note: string;
  created_at: string;
  author_id: string | null;
  kind: string;
  author: { full_name: string | null; role: string | null } | null;
};

type Staff = { id: string; full_name: string | null; role: string | null };
type Watcher = { user_id: string; watcher: { full_name: string | null } | null };
type Tab = "all" | "comments" | "activity";

// Renders a note with any "@Full Name" mentions of known staff highlighted.
function renderNote(note: string, staffNames: string[]) {
  if (staffNames.length === 0) return note;
  // Longest names first so "@Ann Marie" wins over "@Ann".
  const sorted = [...staffNames].sort((a, b) => b.length - a.length);
  const parts: (string | JSX.Element)[] = [];
  let rest = note;
  let key = 0;
  outer: while (rest.length > 0) {
    for (const name of sorted) {
      const token = `@${name}`;
      const idx = rest.indexOf(token);
      if (idx === 0) {
        parts.push(
          <span key={key++} className="rounded bg-primary-50 px-1 font-semibold text-primary-700">
            {token}
          </span>
        );
        rest = rest.slice(token.length);
        continue outer;
      }
    }
    // No mention at position 0 — consume one char.
    const last = parts[parts.length - 1];
    if (typeof last === "string") parts[parts.length - 1] = last + rest[0];
    else parts.push(rest[0]);
    rest = rest.slice(1);
  }
  return parts;
}

/**
 * Internal, staff-only discussion thread on a creator's application/submission.
 * Supports @mentions (notifies the mentioned teammate), watchers (get notified
 * of new notes), an activity/audit timeline, and admin reassignment.
 * Notes are never shown to creators.
 */
export function ReviewNotesThread({
  applicationId,
  submissionId,
}: {
  applicationId: string;
  submissionId?: string | null;
}) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [text, setText] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [mentioned, setMentioned] = useState<{ id: string; name: string }[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignTo, setReassignTo] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  const isAdmin = profile?.role === "admin";

  const { data: refNo } = useQuery({
    queryKey: ["review-ref", submissionId ?? applicationId],
    queryFn: async () => {
      if (submissionId) {
        const { data } = await supabase.from("campaign_submissions").select("ref_no").eq("id", submissionId).maybeSingle();
        const r = (data as { ref_no: number | null } | null)?.ref_no;
        if (r != null) return r;
      }
      const { data } = await supabase.from("applications").select("ref_no").eq("id", applicationId).maybeSingle();
      return (data as { ref_no: number | null } | null)?.ref_no ?? null;
    },
    enabled: !!applicationId,
  });

  const { data: staff = [] } = useQuery({
    queryKey: ["staff-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("role", ["admin", "employee"])
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Staff[];
    },
  });

  const { data: notes, isLoading } = useQuery({
    queryKey: ["review-notes", applicationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("review_notes")
        .select("id, note, created_at, author_id, kind, author:profiles!author_id(full_name, role)")
        .eq("application_id", applicationId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ReviewNote[];
    },
    enabled: !!applicationId,
  });

  const { data: watchers = [] } = useQuery({
    queryKey: ["review-watchers", applicationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("application_watchers")
        .select("user_id, watcher:profiles!user_id(full_name)")
        .eq("application_id", applicationId);
      if (error) throw error;
      return (data ?? []) as unknown as Watcher[];
    },
    enabled: !!applicationId,
  });

  const watching = useMemo(() => watchers.some((w) => w.user_id === profile?.id), [watchers, profile?.id]);
  const staffNames = useMemo(() => staff.map((s) => s.full_name).filter(Boolean) as string[], [staff]);

  const add = useMutation({
    mutationFn: async (note: string) => {
      const { error } = await supabase.from("review_notes").insert({
        application_id: applicationId,
        submission_id: submissionId ?? null,
        author_id: profile?.id,
        note,
      });
      if (error) throw error;

      // The author auto-watches so they hear about replies.
      if (profile?.id) {
        await supabase
          .from("application_watchers")
          .upsert({ application_id: applicationId, user_id: profile.id }, { onConflict: "application_id,user_id" });
      }

      // Notify mentioned teammates that are still referenced in the final text.
      const mentionIds = Array.from(
        new Set(mentioned.filter((m) => note.includes(`@${m.name}`)).map((m) => m.id))
      ).filter((id) => id !== profile?.id);
      const who = profile?.full_name ?? "A teammate";
      const link = `/applications/${applicationId}/review`;
      if (mentionIds.length) {
        await supabase.rpc("notify_users", {
          p_user_ids: mentionIds,
          p_title: "You were mentioned",
          p_message: `${who} mentioned you in a review note.`,
          p_type: "mention",
          p_link: link,
        });
      }

      // Notify watchers (except the author and anyone already pinged via mention).
      const watcherIds = watchers
        .map((w) => w.user_id)
        .filter((id) => id !== profile?.id && !mentionIds.includes(id));
      if (watcherIds.length) {
        await supabase.rpc("notify_users", {
          p_user_ids: watcherIds,
          p_title: "New note on a review you're watching",
          p_message: `${who} added a note.`,
          p_type: "watch",
          p_link: link,
        });
      }
    },
    onSuccess: () => {
      setText("");
      setMentioned([]);
      setMentionQuery(null);
      qc.invalidateQueries({ queryKey: ["review-notes", applicationId] });
      qc.invalidateQueries({ queryKey: ["review-watchers", applicationId] });
    },
  });

  const toggleWatch = useMutation({
    mutationFn: async () => {
      if (!profile?.id) return;
      if (watching) {
        await supabase.from("application_watchers").delete().eq("application_id", applicationId).eq("user_id", profile.id);
      } else {
        await supabase
          .from("application_watchers")
          .upsert({ application_id: applicationId, user_id: profile.id }, { onConflict: "application_id,user_id" });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["review-watchers", applicationId] }),
  });

  const reassign = useMutation({
    mutationFn: async () => {
      if (!submissionId || !reassignTo) return;
      const { error } = await supabase.rpc("reassign_review", {
        p_submission: submissionId,
        p_to: reassignTo,
        p_reason: reassignReason.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setReassignOpen(false);
      setReassignTo("");
      setReassignReason("");
      qc.invalidateQueries({ queryKey: ["review-notes", applicationId] });
    },
  });

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    const cursor = e.target.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const m = before.match(/@([\p{L}]*)$/u);
    setMentionQuery(m ? m[1].toLowerCase() : null);
  };

  const insertMention = (s: Staff) => {
    const el = taRef.current;
    const name = s.full_name ?? "";
    const pos = el?.selectionStart ?? text.length;
    const before = text.slice(0, pos).replace(/@([\p{L}]*)$/u, `@${name} `);
    const after = text.slice(pos);
    setText(before + after);
    setMentioned((prev) => [...prev, { id: s.id, name }]);
    setMentionQuery(null);
    setTimeout(() => el?.focus(), 0);
  };

  const mentionMatches = useMemo(() => {
    if (mentionQuery == null) return [];
    return staff
      .filter((s) => s.id !== profile?.id && (s.full_name ?? "").toLowerCase().includes(mentionQuery))
      .slice(0, 6);
  }, [mentionQuery, staff, profile?.id]);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || add.isPending) return;
    add.mutate(trimmed);
  };

  const filtered = (notes ?? []).filter((n) =>
    tab === "all" ? true : tab === "activity" ? n.kind === "system" : n.kind !== "system"
  );

  const TabBtn = ({ id, label, icon }: { id: Tab; label: string; icon: React.ReactNode }) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
        tab === id ? "bg-ink text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <MessageSquare size={13} /> Internal notes
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] tracking-normal text-slate-500">
            {orderRef(refNo, "rev")}
          </span>
          <span className="font-normal normal-case text-slate-300">· staff only</span>
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => toggleWatch.mutate()}
            disabled={toggleWatch.isPending}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
              watching ? "bg-primary-100 text-primary-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
            title={watching ? "Stop watching" : "Watch this item"}
          >
            {watching ? <Eye size={12} /> : <EyeOff size={12} />}
            {watching ? "Watching" : "Watch"}
            {watchers.length > 0 ? <span className="opacity-70">· {watchers.length}</span> : null}
          </button>
          {isAdmin && submissionId ? (
            <button
              type="button"
              onClick={() => setReassignOpen((v) => !v)}
              className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-200"
              title="Reassign this review"
            >
              <UserCog size={12} /> Reassign
            </button>
          ) : null}
        </div>
      </div>

      {reassignOpen && isAdmin && submissionId ? (
        <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Reassign review</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={reassignTo} onChange={(e) => setReassignTo(e.target.value)} className="sm:w-52">
              <option value="">Choose employee…</option>
              {staff
                .filter((s) => s.role === "employee" || s.role === "admin")
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name ?? "Staff"}
                  </option>
                ))}
            </Select>
            <input
              value={reassignReason}
              onChange={(e) => setReassignReason(e.target.value)}
              placeholder="Reason (optional)"
              className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <Button onClick={() => reassign.mutate()} disabled={!reassignTo || reassign.isPending} className="shrink-0">
              {reassign.isPending ? "Reassigning…" : "Reassign"}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mb-3 flex items-center gap-1.5">
        <TabBtn id="all" label="All" icon={<ListFilter size={12} />} />
        <TabBtn id="comments" label="Comments" icon={<MessageSquare size={12} />} />
        <TabBtn id="activity" label="Activity" icon={<History size={12} />} />
      </div>

      {isLoading ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-slate-400">
          {tab === "activity" ? "No activity yet." : "No notes yet. Start the conversation below."}
        </p>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((n) => {
            if (n.kind === "system") {
              return (
                <div key={n.id} className="flex items-center gap-2 px-1 py-0.5">
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">System</span>
                  <span className="text-xs italic text-slate-500">{n.note}</span>
                  <span className="text-[10px] text-slate-400">· {formatDate(n.created_at)}</span>
                </div>
              );
            }
            const authorIsAdmin = n.author?.role === "admin";
            return (
              <div key={n.id} className="rounded-xl bg-slate-50 p-2.5">
                <div className="mb-0.5 flex items-center gap-2">
                  <span className="text-xs font-semibold text-ink">{n.author?.full_name ?? "Staff"}</span>
                  <span
                    className={
                      "rounded-full px-1.5 py-0.5 text-[10px] font-semibold " +
                      (authorIsAdmin ? "bg-primary-100 text-primary-700" : "bg-slate-200 text-slate-600")
                    }
                  >
                    {authorIsAdmin ? "Admin" : "Employee"}
                  </span>
                  <span className="text-[10px] text-slate-400">{formatDate(n.created_at)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-slate-700">{renderNote(n.note, staffNames)}</p>
              </div>
            );
          })}
        </div>
      )}

      <div className="relative mt-3 flex items-end gap-2">
        <div className="relative flex-1">
          <Textarea
            ref={taRef}
            rows={2}
            value={text}
            onChange={onChange}
            placeholder="Add a note. Type @ to mention a teammate (⌘/Ctrl+Enter to send)"
            className="w-full"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
              if (e.key === "Escape") setMentionQuery(null);
            }}
          />
          {mentionQuery != null && mentionMatches.length > 0 ? (
            <div className="absolute bottom-full left-0 z-10 mb-1 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
              {mentionMatches.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => insertMention(s)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <span className="font-medium text-ink">{s.full_name ?? "Staff"}</span>
                  <span className="ml-auto text-[10px] uppercase text-slate-400">{s.role}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <Button onClick={submit} disabled={!text.trim() || add.isPending} className="shrink-0">
          <Send size={14} /> {add.isPending ? "Adding…" : "Add"}
        </Button>
      </div>
    </div>
  );
}
