import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  Instagram,
  Youtube,
  ClipboardList,
  CheckCircle2,
  RefreshCw,
  XCircle,
  SkipForward,
  Package,
  Hash,
  Calendar,
  Clock,
  IndianRupee,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/store/auth";
import type { Application, CampaignSubmission, CampaignType, ReviewStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Modal, Badge } from "@/components/ui/badge";
import { Input, Textarea, Label } from "@/components/ui/input";
import { signedUrl, signedUrls } from "@/lib/storage";
import { CreatorInsights } from "@/components/CreatorInsights";
import { ReviewNotesThread } from "@/components/ReviewNotesThread";
import { TurnPill, StageTracker } from "@/components/WorkflowUi";
import { statusLabel, isCampaignClosed } from "@/lib/workflow";
import { formatCurrency, formatDate } from "@/lib/utils";
import { invalidateReviewQueries } from "@/lib/reviewSync";

const ALL_TYPES: CampaignType[] = ["barter", "reimbursement", "paid"];
const EMPLOYEE_REVIEW_WINDOW_MS = 72 * 60 * 60 * 1000;
const TYPE_LABEL: Record<CampaignType, string> = {
  barter: "Barter",
  reimbursement: "Reimbursement",
  paid: "Paid",
};

const LINKS: { key: keyof CampaignSubmission; label: string; icon: typeof Instagram }[] = [
  { key: "reel_url", label: "Reel", icon: Instagram },
  { key: "post_url", label: "Post", icon: Instagram },
  { key: "story_url", label: "Story", icon: Instagram },
  { key: "youtube_url", label: "YouTube", icon: Youtube },
];

const TYPE_VARIANT: Record<CampaignType, "warning" | "info" | "success"> = {
  barter: "warning",
  reimbursement: "info",
  paid: "success",
};

function nextStepText(type?: CampaignType | null): string {
  if (type === "paid") return "Check the posted content, then Approve or Reject";
  return "Check the order & review screenshots, then Approve or Reject";
}

function fmtNum(v: number | null | undefined) {
  return v == null ? "—" : v.toLocaleString("en-IN");
}

// Compact chips listing a creator's content niches (empty = nothing rendered).
function NicheChips({ niches, className }: { niches?: string[] | null; className?: string }) {
  if (!niches || niches.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className ?? ""}`}>
      {niches.map((n) => (
        <span key={n} className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-600">
          {n}
        </span>
      ))}
    </div>
  );
}

function Detail({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Hash;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon size={15} className="mt-0.5 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <div className="text-sm font-medium text-ink">{children}</div>
      </div>
    </div>
  );
}

// Inline preview of the creator's uploaded delivered photo, shown in the
// "Needs your action" panel so staff can see the item before Mark Delivered.
// All the media a creator has uploaded for an application (order screenshot,
// delivered photo, draft video, posted link), shown together so staff can
// review everything in one place before taking an action.
function MediaReviewBody({ app, onLightbox }: { app: Application; onLightbox: (url: string) => void }) {
  const { data: draftUrl } = useQuery({
    queryKey: ["rq-media-draft", app.id, app.draft_video_url],
    queryFn: () => signedUrl("submission-videos", app.draft_video_url),
    enabled: !!app.draft_video_url,
  });
  const { data: deliveredUrl } = useQuery({
    queryKey: ["rq-media-delivered", app.id, app.delivery_photo_url],
    queryFn: () => signedUrl("purchase-orders", app.delivery_photo_url),
    enabled: !!app.delivery_photo_url,
  });
  const { data: purchaseUrl } = useQuery({
    queryKey: ["rq-media-purchase", app.id, app.purchase_proof],
    queryFn: () => signedUrl("purchase-orders", app.purchase_proof),
    enabled: !!app.purchase_proof,
  });
  const hasAny = app.draft_video_url || app.delivery_photo_url || app.purchase_proof || app.reel_link;
  if (!hasAny) {
    return <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">The creator hasn't uploaded anything for this step yet.</p>;
  }
  return (
    <div className="space-y-4">
      {app.draft_video_url ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Draft video</p>
          {draftUrl ? (
            <video src={draftUrl} controls className="max-h-[420px] w-full rounded-xl bg-black object-contain ring-1 ring-slate-200" />
          ) : (
            <p className="text-sm text-slate-400">Loading…</p>
          )}
        </div>
      ) : null}
      {app.reel_link ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Posted video (live)</p>
          <a href={app.reel_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
            <ExternalLink size={14} /> {app.reel_link}
          </a>
        </div>
      ) : null}
      {app.delivery_photo_url ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Delivered photo</p>
          {deliveredUrl ? (
            <button onClick={() => onLightbox(deliveredUrl)} className="block w-full">
              <img src={deliveredUrl} alt="Delivered" className="max-h-[360px] w-full rounded-xl object-contain ring-1 ring-slate-200" />
            </button>
          ) : (
            <p className="text-sm text-slate-400">Loading…</p>
          )}
        </div>
      ) : null}
      {app.purchase_proof ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Order screenshot</p>
          {purchaseUrl ? (
            <button onClick={() => onLightbox(purchaseUrl)} className="block w-full">
              <img src={purchaseUrl} alt="Order screenshot" className="max-h-[360px] w-full rounded-xl object-contain ring-1 ring-slate-200" />
            </button>
          ) : (
            <p className="text-sm text-slate-400">Loading…</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function reviewDeadline(sub: CampaignSubmission): Date | null {
  const hours = sub.application?.campaign?.review_upload_hours ?? null;
  const from = sub.application?.product_received_at;
  if (from && hours) return new Date(new Date(from).getTime() + hours * 3600 * 1000);
  if (sub.application?.campaign?.campaign_deadline) return new Date(sub.application.campaign.campaign_deadline);
  return null;
}

// Which lifecycle action (if any) an employee must take on an application.
// Content-review stages are handled by the claim-based queue above, so they are
// intentionally excluded here.
type AppAction = "select" | "ship" | "deliver" | "draft" | "order" | "verify" | null;
function appAction(app: Application): AppAction {
  const type = app.campaign?.campaign_type;
  const s = app.status;
  if (s === "applied") return "select";
  if (type === "reimbursement" && s === "ordered") return "order";
  if ((type === "paid" || type === "barter") && s === "selected") return "ship";
  if ((type === "paid" || type === "barter") && s === "product_shipped" && app.seller_shipment_status !== "delivered")
    return "deliver";
  if ((type === "paid" || type === "barter") && s === "draft_submitted") return "draft";
  if ((type === "paid" || type === "barter") && s === "link_submitted") return "verify";
  return null;
}

// One short sentence telling the employee exactly what this action means.
const ACTION_HINT: Record<Exclude<AppAction, null>, string> = {
  select: "Review the applicant, then Select or Reject.",
  order: "Open the order screenshot the creator uploaded and Approve or Reject the order.",
  ship: "Send the product to the creator, then press Mark Shipped.",
  deliver: "Confirm the product was delivered.",
  draft: "Review the creator's draft video, then Approve or Request Correction.",
  verify: "Open the live video the creator posted, verify it, then Mark Complete.",
};

// Preset reasons shown as one-tap chips so reviewers rarely have to type.
const REJECT_REASONS = [
  "Blurry / unclear screenshot",
  "Wrong product",
  "Order details don't match",
  "Screenshot looks edited",
  "Doesn't meet requirements",
];
const CORRECTION_REASONS = [
  "Poor lighting / quality",
  "Mention the offer / discount",
  "Show the product clearly",
  "Add a clear call-to-action",
  "Re-record — audio unclear",
];

// Staff have 24h to approve a submitted order screenshot. Given when the creator
// submitted it, returns the remaining time (or how overdue it is) for a badge.
const ORDER_APPROVAL_HOURS = 24;
function orderApprovalStatus(submittedAt?: string | null): { overdue: boolean; text: string } | null {
  if (!submittedAt) return null;
  const deadline = new Date(submittedAt).getTime() + ORDER_APPROVAL_HOURS * 3600 * 1000;
  const diffMs = deadline - Date.now();
  const overdue = diffMs <= 0;
  const mins = Math.floor(Math.abs(diffMs) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const dur = h > 0 ? `${h}h ${m}m` : `${m}m`;
  return { overdue, text: overdue ? `Overdue by ${dur}` : `Approve within ${dur}` };
}

// A sortable deadline (ms) for the action an application is waiting on, so the
// queue can surface the most-urgent work first. Null when there's no SLA.
function actionDeadline(app: Application): number | null {
  const act = appAction(app);
  if (act === "order" && app.order_submitted_at) {
    return new Date(app.order_submitted_at).getTime() + ORDER_APPROVAL_HOURS * 3600 * 1000;
  }
  if (act === "draft" && app.draft_deadline) {
    return new Date(app.draft_deadline).getTime();
  }
  return null;
}

type ReportRow = {
  id: string;
  note: string;
  created_at: string;
  actor: { full_name: string | null; role: string | null } | null;
  application: {
    ref_no: number | null;
    campaign: { title: string | null; campaign_code: string | null; campaign_type: string | null } | null;
    creator: { full_name: string | null } | null;
  } | null;
};

async function fetchSubmission(id: string) {
  const { data, error } = await supabase
    .from("campaign_submissions")
    .select(
      "*, application:applications(*, campaign:campaigns(*), creator:profiles!creator_id(*))"
    )
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as CampaignSubmission;
}

export default function ReviewQueue() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const myTypes = useMemo<CampaignType[]>(
    () => (isAdmin ? ALL_TYPES : ((profile?.review_types ?? []) as CampaignType[])),
    [isAdmin, profile?.review_types]
  );

  const [currentId, setCurrentId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [actionIndex, setActionIndex] = useState(0);
  const [showReport, setShowReport] = useState(false);
  const [reviewClock, setReviewClock] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setReviewClock(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  // Records an automatic "system" entry on the internal notes thread (LRMS log).
  // Best-effort: a logging failure never blocks the action.
  const logEvent = async (appId: string, subId: string | null, message: string) => {
    try {
      await supabase.rpc("log_review_event", { p_application: appId, p_submission: subId, p_message: message });
    } catch {
      /* ignore logging errors */
    }
  };

  // How many items are waiting (available) for my types.
  const { data: depth, refetch: refetchDepth } = useQuery({
    queryKey: ["review-queue-depth", myTypes],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("review_queue_depth", { p_types: myTypes });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    enabled: myTypes.length > 0,
    refetchInterval: 15000,
  });

  const { data: current, isFetching: loadingCurrent } = useQuery({
    queryKey: ["review-queue-current", currentId],
    queryFn: () => fetchSubmission(currentId as string),
    enabled: !!currentId,
    refetchInterval: 15000,
  });

  // Claim up to two lifecycle action items for me and show only those — an item
  // I'm holding is hidden from other staff until it's done or the lease lapses.
  const { data: apps = [] } = useQuery({
    queryKey: ["review-action-queue", myTypes, profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      // Top up my claims to the max (2), releasing any I've already completed.
      await supabase.rpc("claim_action_items", { p_types: myTypes });
      const { data, error } = await supabase
        .from("applications")
        .select("*, campaign:campaigns(*), creator:profiles!creator_id(*), actor:profiles!last_action_by(id, full_name)")
        .eq("action_claimed_by", profile.id)
        .order("action_claimed_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Application[];
    },
    enabled: myTypes.length > 0 && !!profile?.id,
    refetchInterval: 15000,
  });

  const actionApps = apps
    .filter((a) => a.campaign?.campaign_type && myTypes.includes(a.campaign.campaign_type) && appAction(a) !== null)
    .sort((a, b) => {
      // Most-urgent-first: items with a deadline (soonest / overdue) before the rest.
      const da = actionDeadline(a);
      const db = actionDeadline(b);
      if (da && db) return da - db;
      if (da) return -1;
      if (db) return 1;
      return 0;
    });

  // How many action items are still available to claim (not locked to anyone else).
  const { data: actionPool = 0 } = useQuery({
    queryKey: ["action-queue-depth", myTypes],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("action_queue_depth", { p_types: myTypes });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    enabled: myTypes.length > 0,
    refetchInterval: 15000,
  });

  // Review activity log (who did what, when) for the Report — sourced from the
  // system entries automatically recorded on every lifecycle/review action.
  const { data: report = [] } = useQuery<ReportRow[]>({
    queryKey: ["review-report"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("review_notes")
        .select("id, note, created_at, actor:profiles!actor_id(full_name, role), application:applications(ref_no, campaign:campaigns(title, campaign_code, campaign_type), creator:profiles!creator_id(full_name))")
        .eq("kind", "system")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as ReportRow[];
    },
    enabled: showReport && isAdmin,
    refetchInterval: 15000,
  });

  const updateApp = useMutation({
    mutationFn: async ({ id, status, reject_reason, draft_feedback }: { id: string; status: string; reject_reason?: string; draft_feedback?: string }) => {
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = { status };
      if (status === "selected") patch.selected_at = now;
      if (status === "product_shipped") patch.shipped_at = now;
      if (status === "draft_approved") patch.draft_feedback = null;
      if (status === "completed") patch.completed_at = now;
      if (status === "order_approved") {
        patch.product_received_at = now;
      }
      if (reject_reason !== undefined) patch.reject_reason = reject_reason;
      if (draft_feedback !== undefined) patch.draft_feedback = draft_feedback;
      const { error } = await supabase.from("applications").update(patch).eq("id", id);
      if (error) throw error;
      const label: Record<string, string> = {
        selected: "Selected applicant",
        rejected: reject_reason ? `Rejected applicant — ${reject_reason}` : "Rejected applicant",
        product_shipped: "Marked shipped",
        order_approved: "Approved order",
        draft_approved: "Approved draft video",
        completed: "Verified live video — marked complete",
        content_creation: draft_feedback ? `Requested draft correction — ${draft_feedback}` : "Requested draft correction",
      };
      await logEvent(id, null, label[status] ?? `Status changed to ${status.replace(/_/g, " ")}`);
    },
    onSuccess: () => {
      setActionIndex(0);
      void invalidateReviewQueries(qc);
    },
  });

  const markDelivered = useMutation({
    mutationFn: async ({ id, minutes }: { id: string; minutes: number }) => {
      const { error } = await supabase
        .from("applications")
        .update({
          status: "delivered",
          seller_shipment_status: "delivered",
          delivered_at: new Date().toISOString(),
          draft_deadline: minutes > 0 ? new Date(Date.now() + minutes * 60 * 1000).toISOString() : null,
        })
        .eq("id", id);
      if (error) throw error;
      const h = Math.floor(minutes / 60);
      const dd = Math.floor(h / 24);
      const parts = [dd ? `${dd}d` : "", h % 24 ? `${h % 24}h` : "", minutes % 60 ? `${minutes % 60}m` : ""].filter(Boolean).join(" ");
      await logEvent(id, null, `Marked delivered — creator has ${parts || "no limit"} to submit content`);
    },
    onSuccess: () => {
      setActionIndex(0);
      void invalidateReviewQueries(qc);
    },
  });

  const [rejectApp, setRejectApp] = useState<Application | null>(null);
  const [viewApp, setViewApp] = useState<Application | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [correctApp, setCorrectApp] = useState<Application | null>(null);
  const [correctFeedback, setCorrectFeedback] = useState("");
  // Delivery timer: employee sets how long the creator has to submit content
  // once the product has reached them (barter / paid).
  const [deliverApp, setDeliverApp] = useState<Application | null>(null);
  const [deliverDays, setDeliverDays] = useState("5");
  const [deliverHours, setDeliverHours] = useState("");
  const [deliverMinutes, setDeliverMinutes] = useState("");

  const claimNext = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("claim_next_review", { p_types: myTypes });
      if (error) throw error;
      return (data as string | null) ?? null;
    },
    onSuccess: (id) => {
      setCurrentId(id);
      refetchDepth();
    },
  });

  const decide = useMutation({
    mutationFn: async ({ status, appId, subId }: { status: ReviewStatus; appId: string; subId: string }) => {
      const { error } = await supabase
        .from("campaign_submissions")
        .update({
          review_status: status,
          reviewed_by: profile?.id,
          reviewed_at: new Date().toISOString(),
          claimed_by: null,
          claimed_at: null,
        })
        .eq("id", subId);
      if (error) throw error;
      const appStatus =
        status === "approved" ? "review" : status === "revision" ? "content_creation" : "rejected";
      const { error: appErr } = await supabase.from("applications").update({ status: appStatus }).eq("id", appId);
      if (appErr) throw appErr;
      const msg =
        status === "approved" ? "Approved submission" : status === "revision" ? "Requested revision" : "Rejected submission";
      await logEvent(appId, subId, msg);
    },
    onSuccess: () => {
      void invalidateReviewQueries(qc);
      setCurrentId(null);
      claimNext.mutate();
    },
  });

  const skip = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("release_review", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      setCurrentId(null);
      claimNext.mutate();
    },
  });

  const { data: shots } = useQuery({
    queryKey: ["rq-shots", current?.id],
    queryFn: () => signedUrls("submission-screenshots", current?.screenshots),
    enabled: !!current?.screenshots?.length,
  });
  const { data: video } = useQuery({
    queryKey: ["rq-video", current?.id],
    queryFn: () => signedUrl("submission-videos", current?.video_url),
    enabled: !!current?.video_url,
  });
  const { data: deliveredUrl } = useQuery({
    queryKey: ["rq-delivered", current?.id],
    queryFn: () => signedUrl("purchase-orders", current?.application?.delivery_photo_url),
    enabled: !!current?.application?.delivery_photo_url,
  });
  const { data: purchaseUrl } = useQuery({
    queryKey: ["rq-purchase", current?.id],
    queryFn: () => signedUrl("purchase-orders", current?.application?.purchase_proof),
    enabled: !!current?.application?.purchase_proof,
  });

  const [lightbox, setLightbox] = useState<string | null>(null);

  // Keyboard shortcuts for fast reviewing.
  //  Content review:  A approve · R revision · X reject · S skip · N next
  //  Action queue:    A primary action · X reject/correction · ← / → prev/next
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (rejecting || lightbox || rejectApp || correctApp || viewApp || showReport || deliverApp) return;
      const k = e.key.toLowerCase();
      if (k === "n") {
        e.preventDefault();
        if (!claimNext.isPending) claimNext.mutate();
        return;
      }

      // ----- Action queue (no content review currently claimed) -----
      if (!current && actionApps.length > 0) {
        const idx = Math.min(actionIndex, actionApps.length - 1);
        const a = actionApps[idx];
        const act = appAction(a);
        if (e.key === "ArrowRight") {
          e.preventDefault();
          setActionIndex(Math.min(idx + 1, actionApps.length - 1));
          return;
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          setActionIndex(Math.max(idx - 1, 0));
          return;
        }
        if (updateApp.isPending || markDelivered.isPending) return;
        if (k === "a") {
          e.preventDefault();
          if (act === "select") updateApp.mutate({ id: a.id, status: "selected" });
          else if (act === "order" && a.purchase_proof) updateApp.mutate({ id: a.id, status: "order_approved" });
          else if (act === "ship") updateApp.mutate({ id: a.id, status: "product_shipped" });
          else if (act === "deliver" && a.delivery_photo_url) { setDeliverApp(a); setDeliverDays("5"); setDeliverHours(""); setDeliverMinutes(""); }
          else if (act === "draft") updateApp.mutate({ id: a.id, status: "draft_approved" });
          else if (act === "verify" && a.reel_link) updateApp.mutate({ id: a.id, status: "completed" });
        } else if (k === "x") {
          e.preventDefault();
          if (act === "select" || act === "order") { setRejectApp(a); setRejectReason(""); }
          else if (act === "draft") { setCorrectApp(a); setCorrectFeedback(a.draft_feedback ?? ""); }
        }
        return;
      }

      const busyNow = claimNext.isPending || decide.isPending || skip.isPending;
      if (!current || busyNow) return;
      if (k === "a") {
        e.preventDefault();
        decide.mutate({ status: "approved", appId: current.application_id, subId: current.id });
      } else if (k === "r") {
        e.preventDefault();
        decide.mutate({ status: "revision", appId: current.application_id, subId: current.id });
      } else if (k === "x") {
        e.preventDefault();
        setRejecting(true);
      } else if (k === "s") {
        e.preventDefault();
        skip.mutate(current.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, rejecting, lightbox, rejectApp, correctApp, viewApp, showReport, deliverApp, claimNext, decide, skip, actionApps, actionIndex, updateApp, markDelivered]);

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

  const busy = claimNext.isPending || decide.isPending || skip.isPending || loadingCurrent;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-4">
        <div>
          <h1 className="text-lg font-bold text-ink">Review Queue</h1>
          <p className="text-sm text-slate-500">
            {myTypes.map((t) => TYPE_LABEL[t]).join(" · ")} · up to 2 reviews are locked to you at a time.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary-50 px-4 py-2 text-center" title="Everything waiting on you — content reviews plus lifecycle actions (yours + still in the pool)">
            <p className="text-xs text-slate-500">Reviews waiting</p>
            <p className="text-xl font-extrabold text-primary">{(depth ?? 0) + actionPool + actionApps.length}</p>
          </div>
          {!current && (depth ?? 0) > 0 && (
            <Button onClick={() => claimNext.mutate()} disabled={busy}>
              {claimNext.isPending ? "Opening…" : `Open Review · ${depth}`}
            </Button>
          )}
        </div>
      </div>

      {/* Unified review worklist: content reviews + every lifecycle action
          (select, order, ship, deliver, draft, verify) live here together. */}
      {!current && !busy && (
        <div className="rounded-2xl border border-slate-100 bg-white p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="mb-1 flex items-center gap-1.5 text-sm font-bold text-ink">
                <ClipboardList size={15} /> Open Review queue
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-600">{actionApps.length}</span>
              </p>
              <p className="text-xs text-slate-400">
                Locked to you &amp; hidden from others — up to 2 at a time.
                {actionPool > 0 ? ` ${actionPool} more waiting in the pool.` : ""}
              </p>
            </div>
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => setShowReport(true)}>
                <ClipboardList size={14} /> Report
              </Button>
            )}
          </div>
          {(depth ?? 0) > 0 ? (
            <button
              onClick={() => claimNext.mutate()}
              className="mb-3 flex w-full items-center justify-between rounded-xl border border-primary-100 bg-primary-50 px-4 py-3 text-left hover:bg-primary-100"
            >
              <span className="text-sm font-semibold text-primary">
                {depth} content {depth === 1 ? "review is" : "reviews are"} waiting — click to open the next one
              </span>
              <span className="text-xs font-bold text-primary">Open Review →</span>
            </button>
          ) : null}
          {actionApps.length > 0 ? (() => {
            const idx = Math.min(actionIndex, actionApps.length - 1);
            const a = actionApps[idx];
            const act = appAction(a);
            const t = a.campaign?.campaign_type;
            const showMedia = act === "order" || act === "deliver" || act === "draft" || act === "verify";
            return (
              <div>
                <div className="mb-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                  <span className="text-xs font-semibold text-slate-500">
                    Reviewing item {idx + 1} of {actionApps.length}
                    <span className="ml-2 hidden font-normal text-slate-400 sm:inline">· keys: A approve · X reject · ← → move</span>
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={idx === 0} onClick={() => setActionIndex(idx - 1)}>← Prev</Button>
                    <Button variant="outline" size="sm" disabled={idx >= actionApps.length - 1} onClick={() => setActionIndex(idx + 1)}>Next →</Button>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-100 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1.5">
                    <p className="text-sm font-semibold text-ink">
                      {a.creator?.full_name ?? "Creator"}
                      {t ? <span className="ml-2 text-xs font-normal text-slate-400">{TYPE_LABEL[t]}</span> : null}
                    </p>
                    <p className="truncate text-xs text-slate-500">{a.campaign?.title ?? "Campaign"}</p>
                    {isCampaignClosed(a.campaign) && (
                      <span className="inline-block rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-600">Campaign closed · finish this one out</span>
                    )}
                    <NicheChips niches={a.creator?.niches} />
                    <StageTracker type={t} status={a.status} />
                    {a.actor?.full_name && (
                      <p className="text-[11px] text-slate-400">
                        Last action by <span className="font-semibold text-slate-600">{a.actor.full_name}</span>
                        {a.last_action_at ? ` · ${formatDate(a.last_action_at)}` : ""}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <TurnPill who="employee" />
                      <span className="text-xs text-slate-500">{act ? ACTION_HINT[act] : statusLabel(a.status)}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {act === "select" && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => setViewApp(a)}>View</Button>
                        <Button variant="success" size="sm" onClick={() => updateApp.mutate({ id: a.id, status: "selected" })}>Select</Button>
                        <Button variant="danger" size="sm" onClick={() => { setRejectApp(a); setRejectReason(""); }}>Reject</Button>
                      </>
                    )}
                    {act === "order" && (
                      <>
                        {(() => {
                          const oa = orderApprovalStatus(a.order_submitted_at);
                          return oa ? (
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${oa.overdue ? "bg-rose-100 text-rose-600" : "bg-slate-100 text-slate-600"}`}>
                              ⏱ {oa.text}
                            </span>
                          ) : null;
                        })()}
                        {a.purchase_proof ? (
                          <>
                            <Button variant="success" size="sm" onClick={() => updateApp.mutate({ id: a.id, status: "order_approved" })}>Approve Order</Button>
                            <Button variant="danger" size="sm" onClick={() => { setRejectApp(a); setRejectReason(""); }}>Reject Order</Button>
                          </>
                        ) : (
                          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-600">📷 Awaiting order screenshot</span>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/applications/${a.id}/review?from=review-queue`)}>Details</Button>
                      </>
                    )}
                    {act === "ship" && (
                      <Button variant="success" size="sm" onClick={() => updateApp.mutate({ id: a.id, status: "product_shipped" })}>Mark Shipped</Button>
                    )}
                    {act === "deliver" && (
                      a.delivery_photo_url ? (
                        <Button variant="success" size="sm" onClick={() => { setDeliverApp(a); setDeliverDays("5"); setDeliverHours(""); setDeliverMinutes(""); }}>Confirm delivery &amp; set timer</Button>
                      ) : (
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-600">📷 Awaiting delivered photo</span>
                      )
                    )}
                    {act === "draft" && (
                      <>
                        <Button variant="success" size="sm" onClick={() => updateApp.mutate({ id: a.id, status: "draft_approved" })}>Approve Draft</Button>
                        <Button variant="danger" size="sm" onClick={() => { setCorrectApp(a); setCorrectFeedback(a.draft_feedback ?? ""); }}>Request Correction</Button>
                      </>
                    )}
                    {act === "verify" && (
                      <Button variant="success" size="sm" disabled={!a.reel_link} onClick={() => updateApp.mutate({ id: a.id, status: "completed" })}>Mark Complete</Button>
                    )}
                  </div>
                  </div>
                  {showMedia ? (
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <MediaReviewBody app={a} onLightbox={setLightbox} />
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })() : (
            (depth ?? 0) > 0 ? null : (
              <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
                {actionPool > 0
                  ? `You've cleared your items. ${actionPool} more ${actionPool === 1 ? "is" : "are"} in the pool — they'll be assigned to you as slots free up.`
                  : "Queue is clear 🎉 — nothing waiting for your assigned types right now."}
              </div>
            )
          )}
        </div>
      )}

      {/* Current review */}
      {current && (
        <div className="space-y-4 rounded-2xl border border-slate-100 bg-white p-5">
          {current.review_status === "pending" && (() => {
            const submittedAt = new Date(current.updated_at || current.created_at).getTime();
            const dueAt = submittedAt + EMPLOYEE_REVIEW_WINDOW_MS;
            const remaining = dueAt - reviewClock;
            const overdue = remaining <= 0;
            const hours = Math.floor(Math.max(remaining, 0) / 3600000);
            const minutes = Math.floor((Math.max(remaining, 0) % 3600000) / 60000);
            return (
              <div className={`rounded-xl px-4 py-3 text-sm font-semibold ${overdue ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}>
                {overdue
                  ? `Employee review is overdue (due ${formatDate(new Date(dueAt).toISOString())}).`
                  : `Employee review due in ${hours}h ${minutes}m (by ${formatDate(new Date(dueAt).toISOString())}).`}
              </div>
            );
          })()}
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              {/* CREATOR */}
              <p className="text-base font-bold text-ink">
                {current.application?.creator?.full_name ?? "Creator"}
                {current.application?.creator?.instagram_username ? (
                  <span className="ml-1 text-sm font-normal text-slate-400">
                    @{current.application.creator.instagram_username}
                  </span>
                ) : null}
              </p>
              {current.application?.creator?.email ? (
                <p className="text-xs text-slate-400">{current.application.creator.email}</p>
              ) : null}
              {/* CAMPAIGN */}
              <p className="mt-1 text-sm font-medium text-slate-600">
                {current.application?.campaign?.title ?? "Campaign"}
                {current.application?.campaign?.brand_name
                  ? ` · ${current.application.campaign.brand_name}`
                  : ""}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {current.application?.campaign?.campaign_code ? `Campaign code: ${current.application.campaign.campaign_code}` : "Campaign code: not set"}
                {current.application?.ref_no != null ? ` · Application LRMS-${current.application.ref_no}` : ""}
              </p>
              <NicheChips niches={current.application?.creator?.niches} className="mt-1.5" />
            </div>
            <span className="shrink-0 text-xs text-slate-400">
              Submitted {current.created_at ? formatDate(current.created_at) : "—"}
            </span>
          </div>

          {/* TYPE · FOLLOWERS · STATUS · NEXT STEP */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Type</p>
              {current.application?.campaign?.campaign_type ? (
                <Badge variant={TYPE_VARIANT[current.application.campaign.campaign_type]}>
                  {TYPE_LABEL[current.application.campaign.campaign_type]}
                </Badge>
              ) : (
                <span className="text-sm text-slate-400">—</span>
              )}
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Followers</p>
              <p className="text-sm font-bold text-ink">
                {fmtNum(current.application?.creator?.instagram_followers)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Status</p>
              <Badge variant="info">{current.application?.status ?? "submitted"}</Badge>
            </div>
            <div className="min-w-[200px] flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Next step</p>
              <p className="text-sm font-medium text-amber-600">
                {nextStepText(current.application?.campaign?.campaign_type)}
              </p>
            </div>
          </div>

          <CreatorInsights creator={current.application?.creator} />

          {/* Content links */}
          {LINKS.some((l) => current[l.key]) && (
            <div className="flex flex-wrap gap-2">
              {LINKS.filter((l) => current[l.key]).map((l) => (
                <a
                  key={l.key}
                  href={current[l.key] as string}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <l.icon size={14} /> {l.label} <ExternalLink size={12} />
                </a>
              ))}
            </div>
          )}

          {current.notes ? <p className="text-sm text-slate-600">“{current.notes}”</p> : null}

          {/* Full cross-verification: media on the left, details on the right */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* MEDIA — everything the employee must verify */}
            <div className="space-y-3">
              {/* Order screenshot / purchase proof (reimbursement/barter) */}
              {current.application?.purchase_proof ? (
                <div className="rounded-2xl border border-slate-100 bg-white p-3">
                  {(() => {
                    const isVideo = /\.(mp4|mov|m4v|webm|avi|3gp)$/i.test(current.application?.purchase_proof ?? "");
                    return (
                      <>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          {isVideo ? "Purchase video" : "Order screenshot"}
                        </p>
                        {purchaseUrl ? (
                          isVideo ? (
                            <video src={purchaseUrl} controls className="max-h-[360px] w-full rounded-xl bg-black object-contain ring-1 ring-slate-200" />
                          ) : (
                            <img src={purchaseUrl} alt="Order screenshot" className="max-h-[360px] w-full rounded-xl object-contain ring-1 ring-slate-200" />
                          )
                        ) : (
                          <p className="text-sm text-slate-400">Loading…</p>
                        )}
                      </>
                    );
                  })()}
                </div>
              ) : null}

              {/* Delivered photo */}
              {current.application?.delivery_photo_url ? (
                <div className="rounded-2xl border border-slate-100 bg-white p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Delivered photo</p>
                  {deliveredUrl ? (
                    <button onClick={() => setLightbox(deliveredUrl)} className="block w-full">
                      <img src={deliveredUrl} alt="delivered" className="max-h-[360px] w-full rounded-xl object-contain ring-1 ring-slate-200" />
                    </button>
                  ) : (
                    <p className="text-sm text-slate-400">Loading…</p>
                  )}
                </div>
              ) : null}

              {/* Review screenshots */}
              <div className="rounded-2xl border border-slate-100 bg-white p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Review screenshot(s)</p>
                {(shots?.length ?? 0) > 0 ? (
                  <div className="grid grid-cols-2 gap-3">
                    {shots!.map((url, i) => (
                      <button key={i} onClick={() => setLightbox(url)}>
                        <img src={url} alt={`review ${i + 1}`} className="h-40 w-full rounded-xl object-cover ring-1 ring-blue-200" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">No review screenshot uploaded.</p>
                )}
              </div>

              {/* Review video */}
              {current.video_url ? (
                <div className="rounded-2xl border border-slate-100 bg-white p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Review video</p>
                  {video ? (
                    <video src={video} controls className="max-h-[360px] w-full rounded-xl bg-black object-contain ring-1 ring-slate-200" />
                  ) : (
                    <p className="text-sm text-slate-400">Loading…</p>
                  )}
                </div>
              ) : null}
            </div>

            {/* DETAILS — cross-check against the media */}
            <div className="space-y-3">
              <div className="rounded-2xl border border-slate-100 bg-white p-4">
                <p className="mb-1 text-sm font-semibold text-ink">Campaign &amp; product</p>
                <div className="divide-y divide-slate-100">
                  <Detail icon={Package} label="Brand">{current.application?.campaign?.brand_name ?? "—"}</Detail>
                  <Detail icon={Package} label="Product">{current.application?.campaign?.product_name || current.application?.campaign?.title || "—"}</Detail>
                  <Detail icon={Hash} label="Expected ASIN">
                    {current.application?.campaign?.asin ? (
                      <span className="font-mono">{current.application.campaign.asin}</span>
                    ) : (
                      "—"
                    )}
                  </Detail>
                  {current.application?.campaign?.product_url ? (
                    <Detail icon={ExternalLink} label="Product link">
                      <a
                        href={current.application.campaign.product_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        Open product <ExternalLink size={13} />
                      </a>
                    </Detail>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-white p-4">
                <p className="mb-1 text-sm font-semibold text-ink">Purchase &amp; timing</p>
                <div className="divide-y divide-slate-100">
                  <Detail icon={IndianRupee} label="Order amount">
                    {current.order_amount != null || current.application?.purchase_amount != null
                      ? formatCurrency(current.order_amount ?? current.application?.purchase_amount ?? 0)
                      : "—"}
                  </Detail>
                  <Detail icon={Calendar} label="Product received">
                    {current.application?.product_received_at ? formatDate(current.application.product_received_at) : "—"}
                  </Detail>
                  <Detail icon={Calendar} label="Review submitted">
                    {current.created_at ? formatDate(current.created_at) : "—"}
                  </Detail>
                  <Detail icon={Clock} label="Review upload deadline">
                    {reviewDeadline(current) ? formatDate(reviewDeadline(current)!.toISOString()) : "—"}
                    {current.application?.campaign?.review_upload_hours ? (
                      <span className="ml-1 text-xs text-slate-400">
                        ({current.application.campaign.review_upload_hours}h window)
                      </span>
                    ) : null}
                  </Detail>
                </div>
              </div>
            </div>
          </div>

          {/* Internal notes */}
          {current.application_id ? (
            <ReviewNotesThread applicationId={current.application_id} submissionId={current.id} />
          ) : null}

          {/* Decision actions */}
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <Button
              className="flex-1"
              disabled={busy}
              onClick={() =>
                decide.mutate({ status: "approved", appId: current.application_id, subId: current.id })
              }
            >
              <CheckCircle2 size={16} /> Approve
            </Button>
            <Button
              variant="outline"
              className="flex-1 border-indigo-200 text-indigo-600 hover:bg-indigo-50"
              disabled={busy}
              onClick={() =>
                decide.mutate({ status: "revision", appId: current.application_id, subId: current.id })
              }
            >
              <RefreshCw size={16} /> Needs revision
            </Button>
            <Button
              variant="outline"
              className="flex-1 border-rose-200 text-rose-600 hover:bg-rose-50"
              disabled={busy}
              onClick={() => setRejecting(true)}
            >
              <XCircle size={16} /> Reject
            </Button>
            <Button
              variant="outline"
              className="border-slate-200 text-slate-600 hover:bg-slate-50"
              disabled={busy}
              onClick={() => skip.mutate(current.id)}
              title="Give this back to the queue for someone else"
            >
              <SkipForward size={16} /> Skip
            </Button>
          </div>
          <p className="mt-2 text-center text-[11px] text-slate-400">
            Shortcuts: <kbd className="rounded bg-slate-100 px-1 font-mono">A</kbd> approve ·{" "}
            <kbd className="rounded bg-slate-100 px-1 font-mono">R</kbd> revision ·{" "}
            <kbd className="rounded bg-slate-100 px-1 font-mono">X</kbd> reject ·{" "}
            <kbd className="rounded bg-slate-100 px-1 font-mono">S</kbd> skip ·{" "}
            <kbd className="rounded bg-slate-100 px-1 font-mono">N</kbd> next
          </p>
        </div>
      )}

      <Modal open={!!lightbox} onClose={() => setLightbox(null)} title="Preview">
        {lightbox && <img src={lightbox} alt="" className="max-h-[75vh] w-full rounded-xl object-contain" />}
      </Modal>

      <Modal open={rejecting} onClose={() => setRejecting(false)} title="Reject submission">
        <div className="space-y-3">
          <Label>Reason (optional, shared internally)</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Caption missing required keywords / no verified purchase tag…"
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
            <Button
              className="border-rose-200 bg-rose-600 hover:bg-rose-700"
              disabled={decide.isPending}
              onClick={() => {
                if (!current) return;
                setRejecting(false);
                setReason("");
                decide.mutate({ status: "rejected", appId: current.application_id, subId: current.id });
              }}
            >
              Confirm reject
            </Button>
          </div>
        </div>
      </Modal>

      {/* Applicant details before selection */}
      <Modal
        open={!!viewApp}
        onClose={() => setViewApp(null)}
        title={viewApp?.creator?.full_name ? `Review ${viewApp.creator.full_name}` : "Review applicant"}
      >
        {viewApp ? (
          <div className="space-y-4">
            <div className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
              <Detail icon={Hash} label="Campaign">{viewApp.campaign?.title ?? "—"}</Detail>
              <Detail icon={ClipboardList} label="Campaign type">
                {viewApp.campaign?.campaign_type ? TYPE_LABEL[viewApp.campaign.campaign_type] : "—"}
              </Detail>
              <Detail icon={Calendar} label="Applied">{formatDate(viewApp.applied_at)}</Detail>
              <Detail icon={Instagram} label="Instagram">
                {viewApp.creator?.instagram_username ? `@${viewApp.creator.instagram_username}` : "Not connected"}
              </Detail>
            </div>
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Content niches</p>
              {viewApp.creator?.niches && viewApp.creator.niches.length > 0 ? (
                <NicheChips niches={viewApp.creator.niches} />
              ) : (
                <p className="text-sm text-slate-400">This creator hasn't picked any niches yet.</p>
              )}
            </div>
            <CreatorInsights creator={viewApp.creator} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setViewApp(null)}>Close</Button>
              <Button variant="danger" onClick={() => { setViewApp(null); setRejectApp(viewApp); setRejectReason(""); }}>Reject</Button>
              <Button variant="success" onClick={() => { setViewApp(null); updateApp.mutate({ id: viewApp.id, status: "selected" }); }}>Select applicant</Button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Review activity report — who reviewed what, when */}
      <Modal open={showReport} onClose={() => setShowReport(false)} title="Review activity report">
        <div className="space-y-4">
          {(() => {
            const total = report.length;
            const byActor = new Map<string, number>();
            for (const r of report) {
              const name = r.actor?.full_name ?? "System / unknown";
              const role = r.actor?.role ?? "system";
              const key = `${role}:${name}`;
              byActor.set(key, (byActor.get(key) ?? 0) + 1);
            }
            const leaderboard = [...byActor.entries()].sort((a, b) => b[1] - a[1]);
            return (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-primary-50 p-3 text-center">
                    <p className="text-2xl font-extrabold text-primary">{total}</p>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Actions logged</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 text-center">
                    <p className="text-2xl font-extrabold text-ink">{leaderboard.length}</p>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">People in flow</p>
                  </div>
                </div>
                {leaderboard.length > 0 ? (
                  <div>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Actions per person</p>
                    <div className="space-y-1">
                      {leaderboard.map(([key, n]) => {
                        const [role, name] = key.split(":");
                        return (
                        <div key={key} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-sm">
                          <span className="font-medium text-ink">{name}<span className="ml-1 text-xs font-normal capitalize text-slate-400">{role}</span></span>
                          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-primary">{n}</span>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Recent activity</p>
                  {report.length > 0 ? (
                    <div className="max-h-[45vh] space-y-1.5 overflow-y-auto pr-1">
                      {report.map((r) => (
                        <div key={r.id} className="rounded-lg border border-slate-100 px-3 py-2">
                          <p className="text-sm text-ink">{r.note}</p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            <span className="font-semibold text-slate-600">{r.actor?.full_name ?? "System"}</span>
                            {r.actor?.role ? <span className="ml-1 capitalize text-slate-400">({r.actor.role})</span> : null}
                            {r.application?.creator?.full_name ? ` · ${r.application.creator.full_name}` : ""}
                            {r.application?.ref_no != null ? ` · LRMS-${r.application.ref_no}` : ""}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-400">
                            {r.application?.campaign?.campaign_code ? `${r.application.campaign.campaign_code} · ` : ""}
                            {r.application?.campaign?.title ?? "Campaign"}
                            {r.application?.campaign?.campaign_type ? ` · ${TYPE_LABEL[r.application.campaign.campaign_type as CampaignType] ?? r.application.campaign.campaign_type}` : ""}
                            {` · ${formatDate(r.created_at)}`}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-400">No review activity recorded yet.</p>
                  )}
                </div>
              </>
            );
          })()}
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setShowReport(false)}>Close</Button>
          </div>
        </div>
      </Modal>

      {/* Reject applicant */}
      <Modal open={!!rejectApp} onClose={() => setRejectApp(null)} title={rejectApp?.status === "ordered" ? "Reject order" : "Reject applicant"}>
        <div className="space-y-3">
          <Label>Reason (shown to the creator)</Label>
          <div className="flex flex-wrap gap-1.5">
            {REJECT_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRejectReason((prev) => (prev.trim() ? `${prev.replace(/\s*$/, "")}; ${r}` : r))}
                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
              >
                + {r}
              </button>
            ))}
          </div>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. Doesn't match the campaign requirements…"
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRejectApp(null)}>Cancel</Button>
            <Button
              className="border-rose-200 bg-rose-600 hover:bg-rose-700"
              disabled={updateApp.isPending}
              onClick={() => {
                if (!rejectApp) return;
                updateApp.mutate(
                  { id: rejectApp.id, status: "rejected", reject_reason: rejectReason },
                  { onSuccess: () => setRejectApp(null) }
                );
              }}
            >
              Confirm reject
            </Button>
          </div>
        </div>
      </Modal>

      {/* Request draft correction */}
      <Modal open={!!correctApp} onClose={() => setCorrectApp(null)} title="Request draft correction">
        <div className="space-y-3">
          <Label>What should the creator fix?</Label>
          <div className="flex flex-wrap gap-1.5">
            {CORRECTION_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setCorrectFeedback((prev) => (prev.trim() ? `${prev.replace(/\s*$/, "")}; ${r}` : r))}
                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-primary-200 hover:bg-primary-50 hover:text-primary"
              >
                + {r}
              </button>
            ))}
          </div>
          <Textarea
            value={correctFeedback}
            onChange={(e) => setCorrectFeedback(e.target.value)}
            placeholder="e.g. Re-shoot with better lighting / mention the offer…"
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCorrectApp(null)}>Cancel</Button>
            <Button
              disabled={updateApp.isPending}
              onClick={() => {
                if (!correctApp) return;
                updateApp.mutate(
                  { id: correctApp.id, status: "draft_revision", draft_feedback: correctFeedback },
                  { onSuccess: () => setCorrectApp(null) }
                );
              }}
            >
              Send for correction
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirm delivery & set the creator's content deadline (barter / paid) */}
      <Modal open={!!deliverApp} onClose={() => setDeliverApp(null)} title="Confirm delivery & set timeline">
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            The product has reached {deliverApp?.creator?.full_name ?? "the creator"}. Set how long they have to submit
            their content from now — this starts their countdown.
          </p>
          <Label>Time to submit content</Label>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Input type="number" min={0} value={deliverDays} onChange={(e) => setDeliverDays(e.target.value)} placeholder="0" />
              <p className="mt-1 text-center text-[11px] text-slate-400">Days</p>
            </div>
            <div>
              <Input type="number" min={0} max={23} value={deliverHours} onChange={(e) => setDeliverHours(e.target.value)} placeholder="0" />
              <p className="mt-1 text-center text-[11px] text-slate-400">Hours</p>
            </div>
            <div>
              <Input type="number" min={0} max={59} value={deliverMinutes} onChange={(e) => setDeliverMinutes(e.target.value)} placeholder="0" />
              <p className="mt-1 text-center text-[11px] text-slate-400">Minutes</p>
            </div>
          </div>
          {(() => {
            const mins = (Number(deliverDays) || 0) * 1440 + (Number(deliverHours) || 0) * 60 + (Number(deliverMinutes) || 0);
            return (
              <p className="text-xs text-slate-400">
                {mins > 0
                  ? `Creator must submit within ${Number(deliverDays) || 0}d ${Number(deliverHours) || 0}h ${Number(deliverMinutes) || 0}m.`
                  : "No time limit — the creator can submit whenever."}
              </p>
            );
          })()}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeliverApp(null)}>Cancel</Button>
            <Button
              variant="success"
              disabled={markDelivered.isPending}
              onClick={() => {
                if (!deliverApp) return;
                const mins = (Number(deliverDays) || 0) * 1440 + (Number(deliverHours) || 0) * 60 + (Number(deliverMinutes) || 0);
                markDelivered.mutate({ id: deliverApp.id, minutes: mins }, { onSuccess: () => setDeliverApp(null) });
              }}
            >
              Confirm delivery
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
