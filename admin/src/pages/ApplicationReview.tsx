import { useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Loader2,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Package,
  Calendar,
  Hash,
  Clock,
  Instagram,
  IndianRupee,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { signedUrl, signedUrls } from "@/lib/storage";
import type { Application, CampaignSubmission } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { CreatorInsights } from "@/components/CreatorInsights";
import { ReviewNotesThread } from "@/components/ReviewNotesThread";
import { Button } from "@/components/ui/button";
import { Badge, Modal } from "@/components/ui/badge";
import { Input, Textarea, Label, Select } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import { invalidateReviewQueries } from "@/lib/reviewSync";
import { ReleasePaymentModal } from "./Submissions";

async function fetchApplication(id: string) {
  const { data, error } = await supabase
    .from("applications")
    .select("*, campaign:campaigns(*), creator:profiles!creator_id(*), submissions:campaign_submissions(*)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as Application;
}

async function fetchSellers() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("role", "seller")
    .order("full_name");
  if (error) throw error;
  return (data ?? []) as { id: string; full_name: string | null; email: string | null }[];
}

function reviewDeadline(app: Application): Date | null {
  return app.review_deadline ? new Date(app.review_deadline) : null;
}

function Detail({ icon: Icon, label, children }: { icon: typeof Hash; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon size={16} className="mt-0.5 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <div className="text-sm font-medium text-ink">{children}</div>
      </div>
    </div>
  );
}

export default function ApplicationReview() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // When opened from Submissions purely to cross-check, the decision actions are
  // hidden — payment is released on the Submissions page instead.
  const readonly = searchParams.get("readonly") === "1";
  // Where to return after acting / pressing Back — defaults to the applications
  // list, but respects where the review was opened from (e.g. the Review Queue).
  const fromParam = searchParams.get("from");
  const campaignId = searchParams.get("campaignId");
  const backTo =
    fromParam === "review-queue"
      ? "/review-queue"
      : fromParam === "employee-stats"
        ? "/employee-stats"
        : fromParam === "campaign-detail" && campaignId
          ? `/campaigns/${campaignId}`
        : readonly
          ? "/submissions"
          : "/applications";
  const backLabel =
    fromParam === "review-queue"
      ? "review queue"
      : fromParam === "employee-stats"
        ? "employee stats"
        : fromParam === "campaign-detail"
          ? "campaign"
        : readonly
          ? "submissions"
          : "applications";
  const qc = useQueryClient();

  const { data: app, isLoading } = useQuery({
    queryKey: ["application-review", id],
    queryFn: () => fetchApplication(id),
    enabled: !!id,
  });

  const { data: purchaseUrl } = useQuery({
    queryKey: ["review-purchase", id],
    queryFn: () => signedUrl("purchase-orders", app?.purchase_proof),
    enabled: !!app?.purchase_proof,
  });

  const { data: deliveryUrl } = useQuery({
    queryKey: ["review-delivery", id],
    queryFn: () => signedUrl("purchase-orders", app?.delivery_photo_url),
    enabled: !!app?.delivery_photo_url,
  });

  const screenshots = app?.submissions?.[0]?.screenshots ?? [];
  const { data: reviewUrls } = useQuery({
    queryKey: ["review-screenshots", id, screenshots.length],
    queryFn: () => signedUrls("submission-screenshots", screenshots),
    enabled: screenshots.length > 0,
  });

  const videoPath = app?.submissions?.[0]?.video_url ?? null;
  const { data: videoUrl } = useQuery({
    queryKey: ["review-video", id, videoPath],
    queryFn: () => signedUrl("submission-videos", videoPath),
    enabled: !!videoPath,
  });

  const feedbackShotPath = app?.submissions?.[0]?.seller_feedback_screenshot ?? null;
  const { data: feedbackShotUrl } = useQuery({
    queryKey: ["review-seller-feedback-shot", id, feedbackShotPath],
    queryFn: () => signedUrl("submission-screenshots", feedbackShotPath),
    enabled: !!feedbackShotPath,
  });

  const feedbackVideoPath = app?.submissions?.[0]?.seller_feedback_video ?? null;
  const { data: feedbackVideoUrl } = useQuery({
    queryKey: ["review-seller-feedback-video", id, feedbackVideoPath],
    queryFn: () => signedUrl("submission-videos", feedbackVideoPath),
    enabled: !feedbackShotPath && !!feedbackVideoPath,
  });

  const [preview, setPreview] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [paying, setPaying] = useState(false);

  const [orderId, setOrderId] = useState("");
  const [orderAmount, setOrderAmount] = useState("");
  const [orderDate, setOrderDate] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [sellerFeedback, setSellerFeedback] = useState("");
  const [sellerId, setSellerId] = useState("");
  const [detailsLoadedFor, setDetailsLoadedFor] = useState<string | null>(null);
  if (app && detailsLoadedFor !== id) {
    setOrderId(app.order_id ?? "");
    setOrderAmount(
      app.purchase_amount != null
        ? String(app.purchase_amount)
        : app.submissions?.[0]?.order_amount != null
        ? String(app.submissions[0].order_amount)
        : ""
    );
    setOrderDate(app.order_date ?? "");
    setDeliveryDate(app.expected_delivery_at?.slice(0, 10) ?? "");
    setSellerFeedback(app.seller_feedback ?? "");
    setSellerId(app.campaign?.seller_id ?? "");
    setDetailsLoadedFor(id ?? null);
  }

  const { data: sellers } = useQuery({ queryKey: ["sellers-for-review"], queryFn: fetchSellers });

  // Write a system entry to the application's audit timeline (records the acting
  // staff member + what they did, so admins can see who accepted/rejected whom).
  const logEvent = async (message: string) => {
    try {
      await supabase.rpc("log_review_event", { p_application: id, p_submission: null, p_message: message });
    } catch {
      /* ignore logging errors */
    }
  };

  // Writes whatever is currently typed into the Order details form. Approve /
  // reject run this first so a decision never discards the reviewer's edits.
  const persistDetails = async () => {
    if (detailsLoadedFor !== id) return;
    const parsedAmount = orderAmount.trim() === "" ? null : Number(orderAmount);
    const patch = {
      order_id: orderId.trim() || null,
      purchase_amount: parsedAmount,
      order_date: orderDate.trim() || null,
      expected_delivery_at: deliveryDate.trim() || null,
      seller_feedback: sellerFeedback.trim() || null,
    };
    const { error } = await supabase.from("applications").update(patch).eq("id", id);
    if (error) throw error;
    if (app?.submissions?.[0]?.id) {
      const { error: subErr } = await supabase
        .from("campaign_submissions")
        .update({ order_amount: parsedAmount })
        .eq("id", app.submissions[0].id);
      if (subErr) throw subErr;
    }
    // Assign / change the seller on the parent campaign so the order becomes
    // visible to that seller (visibility is campaign-level).
    if (app?.campaign_id && (sellerId || null) !== (app.campaign?.seller_id ?? null)) {
      const { error: cErr } = await supabase
        .from("campaigns")
        .update({ seller_id: sellerId || null })
        .eq("id", app.campaign_id);
      if (cErr) throw cErr;
    }
  };

  const saveDetails = useMutation({
    mutationFn: async () => {
      await persistDetails();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["application-review", id] });
      if (app?.campaign_id) qc.invalidateQueries({ queryKey: ["campaign-detail-apps", app.campaign_id] });
      void invalidateReviewQueries(qc);
      qc.invalidateQueries({ queryKey: ["seller-applications"] });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });

  const orderApproval = useMutation({
    mutationFn: async ({ approve, reject_reason }: { approve: boolean; reject_reason?: string }) => {
      await persistDetails();
      const verifiedOrderAmount = orderAmount.trim() === "" ? null : Number(orderAmount);
      if (approve && (!verifiedOrderAmount || verifiedOrderAmount <= 0)) {
        throw new Error("Enter the verified order amount before approving this order.");
      }
      const now = new Date();
      const patch: Record<string, unknown> = approve
        ? {
            status: "order_approved",
            product_received_at: now.toISOString(),
          }
        : { status: "rejected", reject_reason };
      const { error } = await supabase.from("applications").update(patch).eq("id", id);
      if (error) throw error;
      await logEvent(approve ? "Approved order" : `Rejected order${reject_reason ? ` — ${reject_reason}` : ""}`);
    },
    onSuccess: () => {
      void invalidateReviewQueries(qc);
      qc.invalidateQueries({ queryKey: ["application-review", id] });
      navigate(backTo);
    },
  });

  const update = useMutation({
    mutationFn: async ({ status, reject_reason }: { status: "review" | "rejected"; reject_reason?: string }) => {
      await persistDetails();
      const patch: Record<string, unknown> = { status };
      if (reject_reason !== undefined) patch.reject_reason = reject_reason;
      const { error } = await supabase.from("applications").update(patch).eq("id", id);
      if (error) throw error;

      // On approval, make sure a submission row exists so it appears on the
      // Submissions page for the final cross-check + payout. (Barter/reimbursement
      // create one from the app; paid's reel link may not have, so back-fill it.)
      if (status === "review") {
        const { data: existing } = await supabase
          .from("campaign_submissions")
          .select("id")
          .eq("application_id", id)
          .maybeSingle();
        if (!existing) {
          await supabase.from("campaign_submissions").insert({
            application_id: id,
            reel_url: app?.reel_link ?? null,
            review_status: "pending",
          });
        }
      }
      await logEvent(status === "review" ? "Approved review" : `Rejected applicant${reject_reason ? ` — ${reject_reason}` : ""}`);
    },
    onSuccess: () => {
      void invalidateReviewQueries(qc);
      qc.invalidateQueries({ queryKey: ["application-review", id] });
      navigate(backTo);
    },
  });

  // Simple forward transitions for the barter/paid workflow (and reimbursement
  // order steps). Stays on the page so the next step's buttons appear.
  const advance = useMutation({
    mutationFn: async ({ status }: { status: string }) => {
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = { status };
      if (status === "selected") patch.selected_at = now;
      if (status === "product_shipped") patch.shipped_at = now;
      if (status === "draft_approved") patch.draft_feedback = null;
      const { error } = await supabase.from("applications").update(patch).eq("id", id);
      if (error) throw error;
      const label: Record<string, string> = {
        selected: "Selected applicant",
        product_shipped: "Marked shipped",
        delivered: "Marked delivered",
        draft_approved: "Approved draft video",
        draft_revision: "Requested draft correction",
      };
      await logEvent(label[status] ?? `Status changed to ${status.replace(/_/g, " ")}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["application-review", id] });
      void invalidateReviewQueries(qc);
    },
  });

  if (isLoading || !app) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-primary" />
      </div>
    );
  }

  const c = app.campaign;
  const creator = app.creator;
  const hasPurchase = !!app.purchase_proof;
  const hasReview = screenshots.length > 0;
  const isReimbursement = c?.campaign_type === "reimbursement";
  const submissionOpen = !isReimbursement || !deliveryDate || new Date(deliveryDate).getTime() <= Date.now();
  const canDecide = hasPurchase && hasReview;
  const deadline = reviewDeadline(app);

  return (
    <div className="space-y-5">
      <button
        onClick={() => navigate(backTo)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-ink"
      >
        <ArrowLeft size={16} /> Back to {backLabel}
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink">{c?.title ?? "Reimbursement review"}</h2>
          <p className="text-sm text-slate-500">{c?.brand_name}</p>
        </div>
        <Badge variant="info">Reimbursement</Badge>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* LEFT: screenshots */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <p className="mb-2 text-sm font-semibold text-ink">Order screenshot</p>
              {hasPurchase ? (
                purchaseUrl ? (
                  <img
                    src={purchaseUrl}
                    onClick={() => setPreview(purchaseUrl)}
                    className="max-h-[420px] w-full cursor-pointer rounded-xl bg-black object-contain ring-1 ring-slate-200"
                  />
                ) : (
                  <p className="text-sm text-slate-400">Loading…</p>
                )
              ) : (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  Creator hasn't uploaded the order screenshot yet.
                </p>
              )}
            </CardContent>
          </Card>

          {isReimbursement || app.delivery_photo_url ? (
            <Card>
              <CardContent className="p-4">
                <p className="mb-2 text-sm font-semibold text-ink">Delivered screenshot</p>
                {app.delivery_photo_url ? deliveryUrl ? (
                  <button onClick={() => setPreview(deliveryUrl)} className="block w-full">
                    <img
                      src={deliveryUrl}
                      alt="delivered-date screenshot"
                      className="max-h-[420px] w-full rounded-xl object-contain ring-1 ring-slate-200"
                    />
                  </button>
                ) : (
                  <p className="text-sm text-slate-400">Loading…</p>
                ) : (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    Creator hasn&apos;t uploaded the delivered screenshot yet.
                  </p>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardContent className="p-4">
              <p className="mb-2 text-sm font-semibold text-ink">Review screenshot(s)</p>
              {isReimbursement && !submissionOpen ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  Submission upload opens after the delivery date. Review uploads stay blocked until then.
                </p>
              ) : hasReview ? (
                <div className="grid grid-cols-2 gap-3">
                  {(reviewUrls ?? []).map((url, i) => (
                    <button key={i} onClick={() => setPreview(url)}>
                      <img
                        src={url}
                        alt={`review ${i + 1}`}
                        className="h-40 w-full rounded-xl object-cover ring-1 ring-blue-200"
                      />
                    </button>
                  ))}
                  {!reviewUrls ? <p className="text-sm text-slate-400">Loading…</p> : null}
                </div>
              ) : (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  Creator hasn't uploaded the review screenshot yet.
                </p>
              )}
            </CardContent>
          </Card>

          {videoPath && (
            <Card>
              <CardContent className="p-4">
                <p className="mb-2 text-sm font-semibold text-ink">Review video</p>
                {videoUrl ? (
                  <video
                    src={videoUrl}
                    controls
                    className="max-h-[420px] w-full rounded-xl bg-black object-contain ring-1 ring-slate-200"
                  />
                ) : (
                  <p className="text-sm text-slate-400">Loading…</p>
                )}
              </CardContent>
            </Card>
          )}

          {isReimbursement && (
            <Card>
              <CardContent className="p-4">
                <p className="mb-2 text-sm font-semibold text-ink">Seller feedback screenshot</p>
                {feedbackShotPath ? (
                  feedbackShotUrl ? (
                    <button onClick={() => setPreview(feedbackShotUrl)}>
                      <img
                        src={feedbackShotUrl}
                        alt="seller feedback"
                        className="h-40 w-full rounded-xl object-cover ring-1 ring-blue-200"
                      />
                    </button>
                  ) : (
                    <p className="text-sm text-slate-400">Loading…</p>
                  )
                ) : feedbackVideoPath ? (
                  feedbackVideoUrl ? (
                    <video
                      src={feedbackVideoUrl}
                      controls
                      className="max-h-[420px] w-full rounded-xl bg-black object-contain ring-1 ring-slate-200"
                    />
                  ) : (
                    <p className="text-sm text-slate-400">Loading…</p>
                  )
                ) : (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    Creator hasn't uploaded the seller feedback screenshot yet.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* RIGHT: details + actions */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <p className="mb-1 text-sm font-semibold text-ink">Campaign &amp; product</p>
              <div className="divide-y divide-slate-100">
                <Detail icon={Package} label="Product name">{c?.product_name || c?.title || "—"}</Detail>
                <Detail icon={Hash} label="Campaign code">{c?.campaign_code || "—"}</Detail>
                <Detail icon={Package} label="Brand">{c?.brand_name ?? "—"}</Detail>
                {c?.platform ? (
                  <Detail icon={Package} label="Platform">{c.platform}</Detail>
                ) : null}
                <Detail icon={Hash} label="ASIN">
                  {c?.asin ? <span className="font-mono">{c.asin}</span> : "—"}
                </Detail>
                {c?.product_url ? (
                  <Detail icon={ExternalLink} label="Link">
                    <a
                      href={c.product_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      Open product <ExternalLink size={13} />
                    </a>
                  </Detail>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="mb-1 text-sm font-semibold text-ink">Order details</p>
              <div className="space-y-3">
                {isReimbursement ? (
                  <>
                    <div>
                      <Label>Order ID</Label>
                      <Input value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="e.g. ORD-1024" />
                    </div>
                    <div>
                      <Label>Order Amount</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={orderAmount}
                        onChange={(e) => setOrderAmount(e.target.value)}
                        placeholder="500"
                      />
                    </div>
                    <div>
                      <Label>Order placed date</Label>
                      <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
                    </div>
                    <div>
                      <Label>Delivery date</Label>
                      <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      {deliveryDate
                        ? `Submission upload stays locked until ${new Date(deliveryDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric"})}. After that, the creator can upload the review.`
                        : "Set the delivery date to unlock the upload window for the creator."}
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Deliverables</p>
                      <ul className="mt-2 space-y-1 text-sm text-slate-600">
                        <li>• Submission recording</li>
                        <li>• SFB</li>
                      </ul>
                    </div>
                    <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                      Creator cashback will equal the verified order amount.
                    </p>
                    <div className="flex justify-end">
                      <Button size="sm" disabled={saveDetails.isPending} onClick={() => saveDetails.mutate()}>
                        {saveDetails.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                        {saveDetails.isSuccess && !saveDetails.isPending ? "Saved ✓" : "Save order details"}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="divide-y divide-slate-100">
                    <div className="py-2">
                      <Label>Order amount</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={orderAmount}
                        onChange={(e) => setOrderAmount(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <Detail icon={Calendar} label="Product received">
                      {app.product_received_at ? formatDate(app.product_received_at) : "—"}
                    </Detail>
                    <Detail icon={Calendar} label="Review submitted">
                      {app.submissions?.[0]?.created_at ? formatDate(app.submissions[0].created_at) : "—"}
                    </Detail>
                    <Detail icon={Clock} label="Employee review deadline">
                      {deadline ? formatDate(deadline.toISOString()) : "—"}
                    </Detail>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <p className="text-sm font-semibold text-ink">Order details (brand-visible)</p>
              <div>
                <Label>Brand</Label>
                <Select value={sellerId} onChange={(e) => setSellerId(e.target.value)}>
                  <option value="">No brand assigned</option>
                  {sellers?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name || s.email || s.id}
                    </option>
                  ))}
                </Select>
                <p className="mt-1 text-xs text-slate-400">
                  Assigns the brand for this campaign, making the order visible to them.
                </p>
              </div>
              <div>
                <Label>Order ID</Label>
                <Input value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="e.g. 402-1234567" />
              </div>
              <div>
                <Label>Brand feedback</Label>
                <Textarea
                  value={sellerFeedback}
                  onChange={(e) => setSellerFeedback(e.target.value)}
                  rows={2}
                  placeholder="Notes for the brand about this order…"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="mb-1 text-sm font-semibold text-ink">Creator</p>
              <div className="divide-y divide-slate-100">
                <Detail icon={Instagram} label="Name">{creator?.full_name ?? "—"}</Detail>
                {creator?.instagram_username ? (
                  <Detail icon={Instagram} label="Instagram">
                    @{creator.instagram_username}
                    <span className="ml-1 text-xs text-slate-400">
                      {creator.instagram_followers?.toLocaleString("en-IN")} followers
                    </span>
                  </Detail>
                ) : null}
                <Detail icon={Hash} label="Contact">
                  {creator?.email ?? "—"}
                  {creator?.phone ? <span className="ml-1 text-slate-400">· {creator.phone}</span> : null}
                </Detail>
                {creator?.niches && creator.niches.length > 0 ? (
                  <Detail icon={Hash} label="Niches">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {creator.niches.map((n) => (
                        <span key={n} className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-600">
                          {n}
                        </span>
                      ))}
                    </div>
                  </Detail>
                ) : null}
              </div>
              <div className="mt-3">
                <CreatorInsights creator={creator} />
              </div>
            </CardContent>
          </Card>

          {readonly ? (
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
              Cross-check view — actions are disabled.
            </div>
          ) : app.status === "completed" ? (
            <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
              ✓ Approved &amp; paid.
            </div>
          ) : app.status === "rejected" ? (
            <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              Rejected{app.reject_reason ? `: ${app.reject_reason}` : ""}.
              {(app.reject_count ?? 0) > 0 ? (
                <div className="mt-1 text-xs font-medium text-rose-600">
                  Rejection {app.reject_count} of 5.
                  {(app.reject_count ?? 0) >= 5
                    ? " Limit reached — the creator is locked out for 24h, then their attempts reset."
                    : " The creator can fix &amp; re-upload."}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-bold text-ink">Next step</p>

              {/* Applied → select or reject (all types) */}
              {app.status === "applied" && (
                <div className="flex gap-2">
                  <Button className="flex-1" disabled={advance.isPending} onClick={() => advance.mutate({ status: "selected" })}>
                    {advance.isPending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Select applicant
                  </Button>
                  <Button variant="outline" className="flex-1 border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => setRejecting(true)}>
                    <XCircle size={16} /> Reject
                  </Button>
                </div>
              )}

              {/* Selected → ship (barter/paid) or wait (reimbursement) */}
              {app.status === "selected" && (c?.campaign_type === "barter" || c?.campaign_type === "paid") && (
                <Button className="w-full" disabled={advance.isPending} onClick={() => advance.mutate({ status: "product_shipped" })}>
                  {advance.isPending ? <Loader2 size={16} className="animate-spin" /> : <Package size={16} />} Mark Shipped
                </Button>
              )}
              {app.status === "selected" && c?.campaign_type === "reimbursement" && (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">Waiting for the creator to buy the product &amp; upload the order screenshot.</p>
              )}

              {/* Shipped → delivered */}
              {app.status === "product_shipped" && (
                <Button className="w-full" disabled={advance.isPending} onClick={() => advance.mutate({ status: "delivered" })}>
                  {advance.isPending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Mark Delivered
                </Button>
              )}

              {/* Delivered / posting → waiting on creator */}
              {(app.status === "delivered" || app.status === "content_creation") && (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">Creator is creating &amp; posting the content.</p>
              )}

              {/* Paid draft → approve or request correction */}
              {app.status === "draft_submitted" && (
                <div className="flex gap-2">
                  <Button className="flex-1" disabled={advance.isPending} onClick={() => advance.mutate({ status: "draft_approved" })}>
                    <CheckCircle2 size={16} /> Approve Draft
                  </Button>
                  <Button variant="outline" className="flex-1 border-amber-200 text-amber-700 hover:bg-amber-50" disabled={advance.isPending} onClick={() => advance.mutate({ status: "draft_revision" })}>
                    Request Correction
                  </Button>
                </div>
              )}
              {(app.status === "draft_revision" || app.status === "draft_approved" || app.status === "posted") && (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">Creator is posting the reel &amp; will submit the link.</p>
              )}

              {/* Paid live link → verify & pay */}
              {app.status === "link_submitted" && (
                <div className="space-y-2">
                  {app.reel_link ? (
                    <a href={app.reel_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:underline">
                      Open submitted reel <ExternalLink size={12} />
                    </a>
                  ) : (
                    <p className="text-sm text-amber-600">No reel link submitted yet.</p>
                  )}
                  <div className="flex gap-2">
                    <Button className="flex-1" disabled={!app.reel_link} onClick={() => setPaying(true)}>
                      <IndianRupee size={16} /> Approve &amp; Pay
                    </Button>
                    <Button variant="outline" className="flex-1 border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => setRejecting(true)}>
                      <XCircle size={16} /> Reject
                    </Button>
                  </div>
                </div>
              )}

              {/* Reimbursement order → approve or reject */}
              {app.status === "ordered" && (
                <div className="space-y-2">
                  {app.order_submitted_at && (() => {
                    const deadline = new Date(app.order_submitted_at).getTime() + 24 * 3600 * 1000;
                    const overdue = Date.now() > deadline;
                    return (
                      <p className={`rounded-lg px-3 py-2 text-sm font-medium ${overdue ? "bg-rose-50 text-rose-700" : "bg-slate-50 text-slate-600"}`}>
                        ⏱ Submitted {formatDate(app.order_submitted_at)} · {overdue ? "approval overdue — please review now" : `approve by ${formatDate(new Date(deadline).toISOString())}`}
                      </p>
                    );
                  })()}
                  {!hasPurchase && (
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">Waiting on the creator's order screenshot.</p>
                  )}
                  <div className="flex gap-2">
                    <Button className="flex-1" disabled={!hasPurchase || !orderAmount.trim() || orderApproval.isPending} onClick={() => orderApproval.mutate({ approve: true })}>
                      {orderApproval.isPending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Approve Order
                    </Button>
                    <Button variant="outline" className="flex-1 border-rose-200 text-rose-600 hover:bg-rose-50" disabled={!hasPurchase || orderApproval.isPending} onClick={() => setRejecting(true)}>
                      <XCircle size={16} /> Reject
                    </Button>
                  </div>
                </div>
              )}

              {/* Content review + payment (submitted / review) */}
              {(app.status === "submitted" || app.status === "review") && (
                c?.campaign_type === "reimbursement" && app.status === "submitted" ? (
                  <div className="space-y-2">
                    {!canDecide && (
                      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">Both the purchase and review screenshots are required before you can approve or reject.</p>
                    )}
                    <div className="flex gap-2">
                      <Button className="flex-1" disabled={!canDecide || update.isPending} onClick={() => update.mutate({ status: "review" })}>
                        {update.isPending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Approve review
                      </Button>
                      <Button variant="outline" className="flex-1 border-rose-200 text-rose-600 hover:bg-rose-50" disabled={!canDecide || update.isPending} onClick={() => setRejecting(true)}>
                        <XCircle size={16} /> Reject
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={() => setPaying(true)}>
                      <IndianRupee size={16} /> Approve &amp; Pay
                    </Button>
                    <Button variant="outline" className="flex-1 border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => setRejecting(true)}>
                      <XCircle size={16} /> Reject
                    </Button>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-5">
        <ReviewNotesThread applicationId={app.id} submissionId={app.submissions?.[0]?.id} />
      </div>

      <Modal open={!!preview} onClose={() => setPreview(null)} title="Screenshot">
        {preview && <img src={preview} alt="" className="max-h-[75vh] w-full rounded-xl object-contain" />}
      </Modal>

      <Modal open={rejecting} onClose={() => setRejecting(false)} title="Reject application">
        <div className="space-y-3">
          <p className="text-sm text-slate-500">Let the creator know why this was rejected.</p>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Purchase video doesn't match the ASIN / review not visible…"
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
            <Button
              className="border-rose-200 bg-rose-600 hover:bg-rose-700"
              disabled={update.isPending || orderApproval.isPending}
              onClick={() =>
                app.status === "ordered"
                  ? orderApproval.mutate({ approve: false, reject_reason: reason })
                  : update.mutate({ status: "rejected", reject_reason: reason })
              }
            >
              Confirm reject
            </Button>
          </div>
        </div>
      </Modal>

      {paying && (
        <ReleasePaymentModal
          submission={{ id: app.submissions?.[0]?.id, application_id: app.id, application: app } as CampaignSubmission}
          onClose={() => setPaying(false)}
          onDone={() => {
            setPaying(false);
            qc.invalidateQueries({ queryKey: ["applications"] });
            qc.invalidateQueries({ queryKey: ["application-review", id] });
            navigate(backTo);
          }}
        />
      )}
    </div>
  );
}
