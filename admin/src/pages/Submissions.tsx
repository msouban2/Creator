import { useState, useMemo, useEffect, Fragment } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Instagram, Youtube, Film, IndianRupee, ClipboardList, ChevronRight, ChevronDown, Lock, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/store/auth";
import type { CampaignSubmission, CampaignType, ReviewStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge, Modal } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { signedUrl, signedUrls } from "@/lib/storage";
import { CreatorInsights } from "@/components/CreatorInsights";
import { ReviewNotesThread } from "@/components/ReviewNotesThread";
import { formatDate, formatCurrency, orderRef } from "@/lib/utils";

const REVIEW_VARIANT: Record<ReviewStatus, "warning" | "success" | "danger" | "info"> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  revision: "info",
};

export const REVIEW_TAGS: { value: string; label: string; variant: "success" | "danger" | "warning" }[] = [
  { value: "correct", label: "Correct", variant: "success" },
  { value: "blocked", label: "Blocked", variant: "danger" },
  { value: "wrong_seller_feedback", label: "Wrong Brand Feedback", variant: "warning" },
];

const ALL_TYPES: CampaignType[] = ["barter", "reimbursement", "paid"];
const TYPE_LABEL: Record<CampaignType, string> = {
  barter: "Barter",
  reimbursement: "Reimbursement",
  paid: "Paid",
};
const TYPE_VARIANT: Record<CampaignType, "warning" | "info" | "success"> = {
  barter: "warning",
  reimbursement: "info",
  paid: "success",
};

export type ReviewStat = {
  campaign_type: string;
  pending: number;
  approved: number;
  rejected: number;
  revision: number;
  total: number;
};
export type Workload = {
  reviewer_id: string;
  reviewer_name: string | null;
  review_types: string[] | null;
  reviewed: number;
};

async function fetchSubmissions(filter: string) {
  let q = supabase
    .from("campaign_submissions")
    .select(
      "*, application:applications(*, campaign:campaigns(*), creator:profiles!creator_id(*)), reviewer:profiles!reviewed_by(id, full_name), claimer:profiles!claimed_by(id, full_name)"
    )
    .order("created_at", { ascending: false });
  if (filter !== "all") q = q.eq("review_status", filter);
  const { data, error } = await q;
  if (error) throw error;
  return data as CampaignSubmission[];
}

export async function fetchReviewStats() {
  const { data, error } = await supabase.rpc("review_stats");
  if (error) throw error;
  return (data ?? []) as ReviewStat[];
}

export async function fetchWorkload() {
  const { data, error } = await supabase.rpc("reviewer_workload");
  if (error) throw error;
  return (data ?? []) as Workload[];
}

const LINKS: { key: keyof CampaignSubmission; label: string; icon: typeof Instagram }[] = [
  { key: "reel_url", label: "Reel", icon: Instagram },
  { key: "post_url", label: "Post", icon: Instagram },
  { key: "story_url", label: "Story", icon: Instagram },
  { key: "youtube_url", label: "YouTube", icon: Youtube },
];

export default function Submissions() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const myTypes = useMemo<CampaignType[]>(
    () => (isAdmin ? ALL_TYPES : ((profile?.review_types ?? []) as CampaignType[])),
    [isAdmin, profile?.review_types]
  );

  const [typeFilter, setTypeFilter] = useState<CampaignType | "all">("all");
  const [filter, setFilter] = useState("pending");
  const [search, setSearch] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();

  // Deep link from a notification (?ref=<n>): prefill search + show all statuses.
  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) {
      setSearch(ref);
      setFilter("all");
      const next = new URLSearchParams(searchParams);
      next.delete("ref");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const [payFor, setPayFor] = useState<CampaignSubmission | null>(null);
  const [sendBackFor, setSendBackFor] = useState<CampaignSubmission | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleRow = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const { data, isLoading } = useQuery({ queryKey: ["submissions", filter], queryFn: () => fetchSubmissions(filter) });
  const { data: stats } = useQuery({ queryKey: ["review-stats"], queryFn: fetchReviewStats });
  const { data: workload } = useQuery({ queryKey: ["reviewer-workload"], queryFn: fetchWorkload, enabled: isAdmin });

  // Best-effort LRMS-style system log entry on the internal notes thread.
  const logEvent = async (appId: string, subId: string | null, message: string) => {
    try {
      await supabase.rpc("log_review_event", { p_application: appId, p_submission: subId, p_message: message });
    } catch {
      /* ignore logging errors */
    }
  };

  const review = useMutation({
    mutationFn: async ({ id, status, appId }: { id: string; status: ReviewStatus; appId: string }) => {
      const { error } = await supabase
        .from("campaign_submissions")
        .update({ review_status: status, reviewed_by: profile?.id, reviewed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      // advance application status.
      // approved -> "review" (content approved, now awaiting payout in the Payments tab);
      // revision -> back to "content_creation"; rejected -> "rejected".
      // completion happens only when the payment is actually released.
      const appStatus =
        status === "approved" ? "review" : status === "revision" ? "content_creation" : "rejected";
      const { error: appErr } = await supabase.from("applications").update({ status: appStatus }).eq("id", appId);
      if (appErr) throw appErr;
      const msg = status === "approved" ? "Approved submission" : status === "revision" ? "Requested revision" : "Rejected submission";
      await logEvent(appId, id, msg);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["submissions"] });
      qc.invalidateQueries({ queryKey: ["review-stats"] });
      qc.invalidateQueries({ queryKey: ["reviewer-workload"] });
    },
  });

  const tag = useMutation({
    mutationFn: async ({ id, review_tag }: { id: string; review_tag: string | null }) => {
      const { error } = await supabase.from("campaign_submissions").update({ review_tag }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["submissions"] });
    },
  });

  // Cross-check found a problem: send the submission back to the reviewing
  // employee. Resets the submission to pending, records the tag + note, and
  // moves the application back to the employee's first-stage review queue
  // (status 'submitted').
  const sendBack = useMutation({
    mutationFn: async ({ id, appId, review_tag, review_note }: { id: string; appId: string; review_tag: string | null; review_note: string | null }) => {
      // Reset to pending and clear any claim so it re-enters the Review Queue
      // for an employee to check again.
      const { error } = await supabase
        .from("campaign_submissions")
        .update({ review_status: "pending", review_tag, review_note, claimed_by: null, claimed_at: null })
        .eq("id", id);
      if (error) throw error;
      const { error: appErr } = await supabase.from("applications").update({ status: "submitted" }).eq("id", appId);
      if (appErr) throw appErr;
      // Also drop the reason into the shared notes thread so the review
      // employee sees it in the Review Queue when they pick it up again.
      if (review_note && review_note.trim()) {
        await supabase.from("review_notes").insert({
          application_id: appId,
          submission_id: id,
          author_id: profile?.id,
          note: `Sent back for re-review${review_tag ? ` (${review_tag})` : ""}: ${review_note.trim()}`,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["submissions"] });
      qc.invalidateQueries({ queryKey: ["applications"] });
      qc.invalidateQueries({ queryKey: ["review-stats"] });
      qc.invalidateQueries({ queryKey: ["review-queue-depth"] });
      qc.invalidateQueries({ queryKey: ["review-notes"] });
    },
  });

  const statFor = (t: CampaignType) => stats?.find((x) => x.campaign_type === t);

  const visible = useMemo(
    () =>
      (data ?? []).filter((s) => {
        const t = s.application?.campaign?.campaign_type;
        if (!t) return false;
        if (!isAdmin && !myTypes.includes(t)) return false;
        // Items sent back to the employee (status 'submitted') live in the
        // employee's Applications queue, not the admin cross-check list.
        if (s.application?.status === "submitted") return false;
        if (typeFilter !== "all" && t !== typeFilter) return false;
        if (search.trim()) {
          const q = search.trim().toLowerCase();
          const digits = q.replace(/[^0-9]/g, "");
          const hay = [
            s.ref_no != null ? `lrms-${s.ref_no}` : "",
            s.application?.creator?.full_name ?? "",
            s.application?.campaign?.title ?? "",
            s.application?.campaign?.brand_name ?? "",
          ]
            .join(" ")
            .toLowerCase();
          const refMatch = !!digits && s.ref_no != null && String(s.ref_no).includes(digits);
          if (!hay.includes(q) && !refMatch) return false;
        }
        return true;
      }),
    [data, isAdmin, myTypes, typeFilter, search]
  );

  // Employee with no queue assigned yet.
  if (!isAdmin && myTypes.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center">
        <ClipboardList size={32} className="mx-auto text-slate-300" />
        <p className="mt-3 font-semibold text-ink">No review queue assigned yet</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
          Ask an admin to assign you a submission type (Barter, Reimbursement, or Paid) on the Employees page.
        </p>
      </div>
    );
  }

  const showTypeTabs = myTypes.length > 1;

  return (
    <div className="space-y-5">
      {isAdmin ? (
        <AdminOverview stats={stats} workload={workload} active={typeFilter} onPick={setTypeFilter} />
      ) : (
        <MyQueue types={myTypes} statFor={statFor} />
      )}

      {showTypeTabs && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Type</span>
          {(["all", ...myTypes] as ("all" | CampaignType)[]).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={
                "rounded-full px-4 py-1.5 text-sm font-semibold transition-colors " +
                (typeFilter === t ? "bg-primary text-white" : "bg-white text-slate-600 hover:bg-slate-100")
              }
            >
              {t === "all" ? "All types" : TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {["all", "pending", "approved", "revision", "rejected"].map((s) => (
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
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            className="w-64 pl-9"
            placeholder="Search LRMS ref, creator, campaign…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <p className="text-slate-400">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-slate-400">No submissions.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white">
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="w-8 px-2 py-2.5"></th>
                <th className="px-3 py-2.5 font-semibold">Ref</th>
                <th className="px-3 py-2.5 font-semibold">Creator</th>
                <th className="px-3 py-2.5 font-semibold">Campaign</th>
                <th className="px-3 py-2.5 font-semibold">Type</th>
                <th className="px-3 py-2.5 font-semibold">Submitted</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 font-semibold">Tag</th>
                <th className="px-3 py-2.5 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => (
                <SubmissionRow
                  key={s.id}
                  s={s}
                  isAdmin={isAdmin}
                  isOpen={expanded.has(s.id)}
                  onToggle={() => toggleRow(s.id)}
                  onReview={(status) => review.mutate({ id: s.id, status, appId: s.application_id })}
                  onPay={() => setPayFor(s)}
                  onTag={(review_tag) => tag.mutate({ id: s.id, review_tag })}
                  onSendBack={() => setSendBackFor(s)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {payFor && (
        <ReleasePaymentModal
          submission={payFor}
          onClose={() => setPayFor(null)}
          onDone={() => {
            setPayFor(null);
            qc.invalidateQueries({ queryKey: ["submissions"] });
            qc.invalidateQueries({ queryKey: ["review-stats"] });
          }}
        />
      )}

      {sendBackFor && (
        <SendBackModal
          submission={sendBackFor}
          pending={sendBack.isPending}
          onClose={() => setSendBackFor(null)}
          onConfirm={(review_tag, review_note) => {
            sendBack.mutate(
              { id: sendBackFor.id, appId: sendBackFor.application_id, review_tag, review_note },
              { onSuccess: () => setSendBackFor(null) }
            );
          }}
        />
      )}
    </div>
  );
}

export function AdminOverview({
  stats,
  workload,
  active,
  onPick,
}: {
  stats?: ReviewStat[];
  workload?: Workload[];
  active: CampaignType | "all";
  onPick: (t: CampaignType | "all") => void;
}) {
  const stat = (t: CampaignType) => stats?.find((x) => x.campaign_type === t);
  const assignees = (t: CampaignType) =>
    (workload ?? []).filter((w) => (w.review_types ?? []).includes(t)).map((w) => w.reviewer_name || "—");
  const totalPending = (stats ?? []).reduce((n, s) => n + Number(s.pending), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Review overview</h2>
        <span className="text-xs text-slate-400">{totalPending} pending across all types</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {ALL_TYPES.map((t) => {
          const s = stat(t);
          const pending = Number(s?.pending ?? 0);
          const done = Number(s?.total ?? 0) - pending;
          const who = assignees(t);
          const isActive = active === t;
          return (
            <button
              key={t}
              onClick={() => onPick(isActive ? "all" : t)}
              className={
                "rounded-2xl border bg-white p-4 text-left transition-colors " +
                (isActive ? "border-primary ring-2 ring-primary/20" : "border-slate-100 hover:border-slate-200")
              }
            >
              <div className="flex items-center justify-between">
                <Badge variant={TYPE_VARIANT[t]}>{TYPE_LABEL[t]}</Badge>
                {pending > 0 && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                    {pending} pending
                  </span>
                )}
              </div>
              <div className="mt-3 flex items-end gap-5">
                <div>
                  <p className="text-2xl font-bold text-ink">{pending}</p>
                  <p className="text-xs text-slate-400">Pending</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-400">{done}</p>
                  <p className="text-xs text-slate-400">Reviewed</p>
                </div>
              </div>
              <p className="mt-2 truncate text-xs text-slate-400">
                {who.length ? `Assigned: ${who.join(", ")}` : "No employee assigned"}
              </p>
            </button>
          );
        })}
      </div>

      {workload && workload.length > 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Team workload</p>
          <div className="mt-1 divide-y divide-slate-100">
            {workload.map((w) => {
              const pend = (w.review_types ?? []).reduce(
                (n, t) => n + Number(stat(t as CampaignType)?.pending ?? 0),
                0
              );
              const initial = (w.reviewer_name ?? "?").trim().charAt(0).toUpperCase();
              return (
                <div key={w.reviewer_id} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary">
                      {initial}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-ink">{w.reviewer_name ?? "—"}</p>
                      <p className="text-xs text-slate-400">
                        {(w.review_types ?? []).length
                          ? (w.review_types ?? []).map((t) => TYPE_LABEL[t as CampaignType] ?? t).join(" · ")
                          : "No types assigned"}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-5 text-right">
                    <div>
                      <p className="text-sm font-bold text-amber-600">{pend}</p>
                      <p className="text-[11px] text-slate-400">pending</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-emerald-600">{Number(w.reviewed)}</p>
                      <p className="text-[11px] text-slate-400">reviewed</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MyQueue({
  types,
  statFor,
}: {
  types: CampaignType[];
  statFor: (t: CampaignType) => ReviewStat | undefined;
}) {
  const pending = types.reduce((n, t) => n + Number(statFor(t)?.pending ?? 0), 0);
  const reviewed = types.reduce(
    (n, t) => n + (Number(statFor(t)?.total ?? 0) - Number(statFor(t)?.pending ?? 0)),
    0
  );
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-ink">Your review queue</p>
          <p className="text-xs text-slate-400">{types.map((t) => TYPE_LABEL[t]).join(" · ")}</p>
        </div>
        <div className="flex gap-6 text-right">
          <div>
            <p className="text-2xl font-bold text-amber-600">{pending}</p>
            <p className="text-xs text-slate-400">Pending</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-emerald-600">{reviewed}</p>
            <p className="text-xs text-slate-400">Reviewed</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SubmissionRow({
  s,
  isAdmin,
  isOpen,
  onToggle,
  onReview,
  onPay,
  onTag,
  onSendBack,
}: {
  s: CampaignSubmission;
  isAdmin: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onReview: (status: ReviewStatus) => void;
  onPay: () => void;
  onTag: (review_tag: string | null) => void;
  onSendBack: () => void;
}) {
  const navigate = useNavigate();
  const [lightbox, setLightbox] = useState<string | null>(null);

  const { data: shots } = useQuery({
    queryKey: ["sub-shots", s.id],
    queryFn: () => signedUrls("submission-screenshots", s.screenshots),
    enabled: isOpen && !!s.screenshots?.length,
  });
  const { data: video } = useQuery({
    queryKey: ["sub-video", s.id],
    queryFn: () => signedUrl("submission-videos", s.video_url),
    enabled: isOpen && !!s.video_url,
  });
  const { data: deliveredUrl } = useQuery({
    queryKey: ["sub-delivered", s.id],
    queryFn: () => signedUrl("purchase-orders", s.application?.delivery_photo_url),
    enabled: isOpen && !!s.application?.delivery_photo_url,
  });
  const { data: sellerFeedbackUrl } = useQuery({
    queryKey: ["sub-seller-feedback", s.id],
    queryFn: () => signedUrl("submission-videos", s.seller_feedback_video),
    enabled: isOpen && !!s.seller_feedback_video,
  });
  const { data: sellerFeedbackShotUrl } = useQuery({
    queryKey: ["sub-seller-feedback-shot", s.id],
    queryFn: () => signedUrl("submission-screenshots", s.seller_feedback_screenshot),
    enabled: isOpen && !!s.seller_feedback_screenshot,
  });

  const ctype = s.application?.campaign?.campaign_type;
  const igUsername = s.application?.creator?.instagram_username ?? null;
  const igUrl = igUsername ? `https://instagram.com/${igUsername}` : null;
  const orderAmount = s.order_amount ?? s.application?.purchase_amount ?? null;
  const currentTag = REVIEW_TAGS.find((t) => t.value === s.review_tag);
  // A claim is "active" only within the 15-minute lease window.
  const claimActive =
    s.review_status === "pending" &&
    !!s.claimed_by &&
    !!s.claimed_at &&
    Date.now() - new Date(s.claimed_at).getTime() < 15 * 60 * 1000;

  return (
    <Fragment>
      <tr className="border-b border-slate-50 align-top hover:bg-slate-50/60">
        <td className="px-2 py-2.5">
          <button onClick={onToggle} className="text-slate-400 hover:text-slate-700" title="Show details">
            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        </td>
        <td className="whitespace-nowrap px-3 py-2.5">
          <span className="font-mono text-xs text-slate-500">{orderRef(s.ref_no, "rev")}</span>
        </td>
        <td className="px-3 py-2.5">
          <p className="font-semibold text-ink">{s.application?.creator?.full_name ?? "Creator"}</p>
          {igUsername ? <p className="text-xs text-slate-400">@{igUsername}</p> : null}
        </td>
        <td className="px-3 py-2.5">
          <p className="font-medium text-ink">{s.application?.campaign?.title}</p>
          <p className="text-xs text-slate-400">{s.application?.campaign?.brand_name}</p>
        </td>
        <td className="px-3 py-2.5">{ctype ? <Badge variant={TYPE_VARIANT[ctype]}>{TYPE_LABEL[ctype]}</Badge> : "—"}</td>
        <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">{formatDate(s.created_at)}</td>
        <td className="px-3 py-2.5">
          <Badge variant={REVIEW_VARIANT[s.review_status]}>{s.review_status}</Badge>
          {claimActive ? (
            <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600" title="Currently being reviewed in the queue">
              <Lock size={10} /> {s.claimer?.full_name ?? "someone"}
            </p>
          ) : null}
        </td>
        <td className="px-3 py-2.5">
          {currentTag ? (
            <span
              className={
                currentTag.variant === "success"
                  ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700"
                  : currentTag.variant === "danger"
                  ? "rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700"
                  : "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700"
              }
            >
              {currentTag.label}
            </span>
          ) : (
            <span className="text-slate-300">—</span>
          )}
        </td>
        <td className="px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {s.review_status === "pending" && (
              <>
                <Button variant="success" size="sm" onClick={() => onReview("approved")}>Approve</Button>
                <Button variant="outline" size="sm" onClick={() => onReview("revision")}>Revision</Button>
                <Button variant="danger" size="sm" onClick={() => onReview("rejected")}>Reject</Button>
                {isAdmin && (
                  <Button variant="outline" size="sm" className="border-amber-300 text-amber-700 hover:bg-amber-50" onClick={onSendBack}>
                    ↩ Send back
                  </Button>
                )}
              </>
            )}
            {s.review_status === "approved" && isAdmin && (
              s.application?.status === "completed" ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                  <IndianRupee size={12} /> Paid
                </span>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-amber-300 text-amber-700 hover:bg-amber-50"
                    onClick={onSendBack}
                    title="Wrong review? Send it back to the review employee to check again"
                  >
                    ↩ Send back to review
                  </Button>
                  <Button size="sm" onClick={onPay}>
                    <IndianRupee size={14} /> Release Payment
                  </Button>
                </>
              )
            )}
            {s.application_id && (
              <Button variant="outline" size="sm" onClick={() => navigate(`/applications/${s.application_id}/review?readonly=1`)}>
                Open review →
              </Button>
            )}
          </div>
        </td>
      </tr>

      {isOpen && (
        <tr className="border-b border-slate-100 bg-slate-50/40">
          <td colSpan={9} className="px-4 py-3">
            <div className="space-y-3">
              <CreatorInsights creator={s.application?.creator} />

              <div className="flex flex-wrap gap-2">
                {LINKS.filter((l) => s[l.key]).map((l) => (
                  <a
                    key={l.key}
                    href={s[l.key] as string}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <l.icon size={14} /> {l.label} <ExternalLink size={12} />
                  </a>
                ))}
              </div>

              {s.notes ? <p className="text-sm text-slate-600">“{s.notes}”</p> : null}

              {/* Social proof: video + screenshots */}
              {(video || (shots?.length ?? 0) > 0) && (
                <div className="rounded-2xl border border-slate-100 bg-white p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <Film size={13} /> Social proof
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {video && <video src={video} controls className="h-44 w-auto max-w-xs rounded-xl bg-black object-contain" />}
                    {shots?.map((url, i) => (
                      <button key={i} onClick={() => setLightbox(url)} className="shrink-0">
                        <img src={url} alt="" className="h-44 w-32 rounded-xl object-cover ring-1 ring-slate-200" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Review checklist */}
              <div className="rounded-2xl border border-slate-100 bg-white p-3">
                <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <ClipboardList size={13} /> Review checklist
                </p>
                <div className="flex flex-wrap gap-4">
                  <div>
                    <p className="mb-1 text-[11px] font-semibold text-slate-500">Delivered photo</p>
                    {deliveredUrl ? (
                      <button onClick={() => setLightbox(deliveredUrl)}>
                        <img src={deliveredUrl} alt="delivered" className="h-24 w-24 rounded-xl object-cover ring-1 ring-slate-200" />
                      </button>
                    ) : (
                      <p className="text-xs text-amber-500">Not uploaded</p>
                    )}
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] font-semibold text-slate-500">Seller feedback</p>
                    {sellerFeedbackShotUrl ? (
                      <button onClick={() => setLightbox(sellerFeedbackShotUrl)}>
                        <img src={sellerFeedbackShotUrl} alt="seller feedback" className="h-24 w-24 rounded-xl object-cover ring-1 ring-slate-200" />
                      </button>
                    ) : sellerFeedbackUrl ? (
                      <video src={sellerFeedbackUrl} controls className="h-24 w-auto max-w-[180px] rounded-xl bg-black object-contain" />
                    ) : (
                      <p className="text-xs text-amber-500">Not uploaded</p>
                    )}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                  <p className="text-xs text-slate-600">
                    <span className="font-semibold text-slate-500">Order amount:</span>{" "}
                    {orderAmount != null ? formatCurrency(orderAmount) : <span className="text-slate-400">—</span>}
                  </p>
                  <p className="text-xs text-slate-600">
                    <span className="font-semibold text-slate-500">Profile link:</span>{" "}
                    {igUrl ? (
                      <a href={igUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary-600 hover:underline">
                        @{igUsername} <ExternalLink size={11} />
                      </a>
                    ) : (
                      <span className="text-slate-400">Not connected</span>
                    )}
                  </p>
                </div>

                {/* Status tag toggles */}
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Status</p>
                  <div className="flex flex-wrap gap-2">
                    {REVIEW_TAGS.map((t) => {
                      const active = s.review_tag === t.value;
                      return (
                        <button
                          key={t.value}
                          onClick={() => onTag(active ? null : t.value)}
                          className={
                            active
                              ? t.variant === "success"
                                ? "rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white"
                                : t.variant === "danger"
                                ? "rounded-full bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white"
                                : "rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white"
                              : "rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                          }
                        >
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {s.review_status !== "pending" && s.reviewed_by && (
                <p className="text-xs text-slate-400">
                  Reviewed by <span className="font-semibold text-slate-500">{s.reviewer?.full_name ?? "staff"}</span>
                  {s.reviewed_at ? ` · ${formatDate(s.reviewed_at)}` : ""}
                </p>
              )}

              <ReviewNotesThread applicationId={s.application_id} submissionId={s.id} />
            </div>

            <Modal open={!!lightbox} onClose={() => setLightbox(null)} title="Screenshot">
              {lightbox && <img src={lightbox} alt="" className="max-h-[70vh] w-full rounded-xl object-contain" />}
            </Modal>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

export function SendBackModal({
  submission,
  pending,
  onClose,
  onConfirm,
}: {
  submission: CampaignSubmission;
  pending: boolean;
  onClose: () => void;
  onConfirm: (review_tag: string | null, review_note: string | null) => void;
}) {
  const [selectedTag, setSelectedTag] = useState<string | null>(submission.review_tag ?? null);
  const [note, setNote] = useState(submission.review_note ?? "");
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal open onClose={onClose} title="Send back to employee">
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <p className="font-semibold text-ink">{submission.application?.creator?.full_name}</p>
          <p className="text-slate-500">{submission.application?.campaign?.title}</p>
          <p className="mt-1 text-xs text-slate-400">
            This returns the application to the employee's review queue for a re-check.
          </p>
        </div>

        <div>
          <Label>Reason tag</Label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {REVIEW_TAGS.map((t) => {
              const active = selectedTag === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setSelectedTag(active ? null : t.value)}
                  className={
                    active
                      ? "rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white"
                      : "rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  }
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <Label>Note for the employee (optional)</Label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="e.g. Brand feedback video doesn't match the product — please re-verify."
            className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="border-amber-300 bg-amber-600 hover:bg-amber-700"
            disabled={pending}
            onClick={() => {
              if (!selectedTag) {
                setError("Please select a reason tag first.");
                return;
              }
              onConfirm(selectedTag, note.trim() || null);
            }}
          >
            ↩ Send back to employee
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function ReleasePaymentModal({
  submission,
  onClose,
  onDone,
}: {
  submission: CampaignSubmission;
  onClose: () => void;
  onDone: () => void;
}) {
  const campaign = submission.application?.campaign;
  const purchaseAmt = submission.application?.purchase_amount;
  // Reimbursement pays back the exact amount the creator paid (so the product
  // is effectively free) plus the flat cashback bonus. Falls back to the
  // campaign's product price if the creator's paid amount wasn't recorded.
  const reimbursed = purchaseAmt != null ? Number(purchaseAmt) : Number(campaign?.reward_amount ?? 0);
  const cashback = Number(campaign?.cashback_percentage ?? 0);
  const defaultAmount =
    campaign?.campaign_type === "reimbursement" ? reimbursed + cashback : Number(campaign?.reward_amount ?? 0);
  const [amount, setAmount] = useState(String(defaultAmount));
  const [error, setError] = useState<string | null>(null);

  const pay = useMutation({
    mutationFn: async () => {
      const value = Number(amount);
      if (!value || value <= 0) throw new Error("Enter a valid amount.");
      await supabase
        .from("applications")
        .update({ status: "payment_in_progress" })
        .eq("id", submission.application_id);
      const { error } = await supabase.rpc("release_campaign_payment", {
        p_application: submission.application_id,
        p_amount: value,
      });
      if (error) throw error;
      try {
        await supabase.rpc("log_review_event", {
          p_application: submission.application_id,
          p_submission: submission.id,
          p_message: `Released payment of ${formatCurrency(value)}`,
        });
      } catch {
        /* ignore logging errors */
      }
    },
    onSuccess: onDone,
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "Payment failed"),
  });

  return (
    <Modal open onClose={onClose} title="Release Payment">
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <p className="font-semibold text-ink">{submission.application?.creator?.full_name}</p>
          <p className="text-slate-500">{submission.application?.campaign?.title}</p>
          {campaign?.campaign_type === "reimbursement" ? (
            <div className="mt-2 space-y-0.5 text-xs text-slate-500">
              <div className="flex justify-between">
                <span>Refund (what they paid)</span>
                <span className="font-semibold text-ink">{formatCurrency(reimbursed)}</span>
              </div>
              <div className="flex justify-between">
                <span>Cashback bonus</span>
                <span className="font-semibold text-ink">{formatCurrency(cashback)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-0.5">
                <span className="font-semibold text-slate-600">Total (product free + cashback)</span>
                <span className="font-bold text-emerald-600">{formatCurrency(defaultAmount)}</span>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-xs text-slate-400">Campaign reward: {formatCurrency(defaultAmount)}</p>
          )}
        </div>
        <div>
          <Label>Amount to pay (₹)</Label>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} min={1} />
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => pay.mutate()} disabled={pay.isPending}>
            {pay.isPending ? "Paying…" : "Confirm & Pay"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
