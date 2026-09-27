import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Instagram, Send, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge, Modal } from "@/components/ui/badge";
import { Textarea, Label } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";

type IgStatus = "pending" | "invited" | "connected" | "rejected";

interface IgRequest {
  id: string;
  user_id: string;
  instagram_username: string;
  status: IgStatus;
  admin_note: string | null;
  created_at: string;
  invited_at: string | null;
  connected_at: string | null;
  profile?: Profile | null;
}

const VARIANT: Record<IgStatus, "warning" | "info" | "success" | "danger"> = {
  pending: "warning",
  invited: "info",
  connected: "success",
  rejected: "danger",
};

const STATUS_LABEL: Record<IgStatus, string> = {
  pending: "Pending",
  invited: "Invited",
  connected: "Connected",
  rejected: "Rejected",
};

async function fetchRequests(filter: string) {
  let q = supabase
    .from("instagram_requests")
    .select("*, profile:profiles!instagram_requests_user_id_fkey(*)")
    .order("created_at", { ascending: false });
  if (filter !== "all") q = q.eq("status", filter);
  const { data, error } = await q;
  if (error) throw error;
  return data as IgRequest[];
}

export default function InstagramRequestsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("pending");
  const [reject, setReject] = useState<IgRequest | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["instagram_requests", filter],
    queryFn: () => fetchRequests(filter),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status, note }: { id: string; status: IgStatus; note?: string }) => {
      const { error } = await supabase.rpc("set_instagram_request_status", {
        p_id: id,
        p_status: status,
        p_note: note ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setReject(null);
      qc.invalidateQueries({ queryKey: ["instagram_requests"] });
    },
  });

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-100 bg-white p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary">
            <Instagram size={18} />
          </div>
          <div className="text-sm text-slate-500">
            <p className="font-semibold text-ink">Instagram verification requests</p>
            <p className="mt-0.5">
              Creators submit their Instagram username to be added as a tester. Add them as a tester
              in the <b>Meta App dashboard</b> and send the invite (they must accept it — this can
              take ~24h). Then mark the request <b>Invited</b> — the creator is notified they can tap
              <b> Connect Instagram</b> in the app. Only <b>Connected</b> creators are eligible for payouts.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {["all", "pending", "invited", "connected", "rejected"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={
              "rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition-colors " +
              (filter === s ? "bg-ink text-white" : "bg-white text-slate-600 hover:bg-slate-100")
            }
          >
            {s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-slate-400">Loading…</p>
      ) : data?.length === 0 ? (
        <p className="text-slate-400">No Instagram requests.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3">Creator</th>
                <th className="px-4 py-3">Instagram</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Requested</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.map((r) => (
                <IgRow
                  key={r.id}
                  r={r}
                  pending={setStatus.isPending}
                  onInvite={() => setStatus.mutate({ id: r.id, status: "invited" })}
                  onConnected={() => setStatus.mutate({ id: r.id, status: "connected" })}
                  onReject={() => setReject(r)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!reject} onClose={() => setReject(null)} title="Reject Instagram request">
        {reject && (
          <RejectForm
            onCancel={() => setReject(null)}
            onSubmit={(note) => setStatus.mutate({ id: reject.id, status: "rejected", note })}
            pending={setStatus.isPending}
          />
        )}
      </Modal>
    </div>
  );
}

function IgRow({
  r,
  pending,
  onInvite,
  onConnected,
  onReject,
}: {
  r: IgRequest;
  pending: boolean;
  onInvite: () => void;
  onConnected: () => void;
  onReject: () => void;
}) {
  const initial = (r.profile?.full_name ?? r.profile?.email ?? "?").trim().charAt(0).toUpperCase();
  const handle = r.instagram_username.replace(/^@/, "");

  return (
    <tr className="align-top hover:bg-slate-50/60">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">{r.profile?.full_name ?? "Creator"}</p>
            <p className="truncate text-xs text-slate-400">{r.profile?.email}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <a
          href={`https://instagram.com/${handle}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          @{handle}
          <ExternalLink size={12} />
        </a>
        {r.admin_note ? <p className="mt-1 max-w-xs text-[11px] text-slate-400">Note: {r.admin_note}</p> : null}
      </td>
      <td className="px-4 py-3">
        <Badge variant={VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
        {r.invited_at ? (
          <p className="mt-1 text-[11px] text-slate-400">Invited {formatDate(r.invited_at)}</p>
        ) : null}
      </td>
      <td className="px-4 py-3 text-slate-500">{formatDate(r.created_at)}</td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {(r.status === "pending" || r.status === "rejected") && (
            <Button variant="dark" size="sm" onClick={onInvite} disabled={pending}>
              <Send size={14} /> Mark Invited
            </Button>
          )}
          {r.status === "invited" && (
            <Button variant="success" size="sm" onClick={onConnected} disabled={pending}>
              <CheckCircle2 size={14} /> Mark Connected
            </Button>
          )}
          {r.status !== "rejected" && r.status !== "connected" && (
            <Button variant="danger" size="sm" onClick={onReject} disabled={pending}>
              <XCircle size={14} /> Reject
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

function RejectForm({
  onCancel,
  onSubmit,
  pending,
}: {
  onCancel: () => void;
  onSubmit: (note: string) => void;
  pending: boolean;
}) {
  const [note, setNote] = useState("");
  return (
    <div className="space-y-4">
      <div>
        <Label>Reason (sent to the creator)</Label>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. That username couldn't be found. Please re-check and resubmit."
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="danger" onClick={() => onSubmit(note)} disabled={pending}>
          {pending ? "Rejecting…" : "Reject request"}
        </Button>
      </div>
    </div>
  );
}
