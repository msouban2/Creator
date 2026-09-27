import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/auth";
import type { Application, ApplicationStatus } from "../lib/types";
import { CAMPAIGN_COLUMNS } from "./campaigns";

export function useMyApplications(status?: ApplicationStatus | "all") {
  const userId = useAuthStore((s) => s.session?.user?.id);
  return useQuery({
    queryKey: ["applications", userId, status ?? "all"],
    enabled: !!userId,
    queryFn: async () => {
      let query = supabase
        .from("applications")
        .select(`*, campaign:campaigns(${CAMPAIGN_COLUMNS})`)
        .eq("creator_id", userId as string)
        .order("applied_at", { ascending: false });
      if (status && status !== "all") query = query.eq("status", status);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Application[];
    },
  });
}

export function useApplication(id: string) {
  return useQuery({
    queryKey: ["application", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select(`*, campaign:campaigns(${CAMPAIGN_COLUMNS})`)
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Application;
    },
  });
}

export const AMAZON_MONTHLY_LIMIT = 5;

// True when a campaign's product link points to Amazon.
export function isAmazonProductUrl(url: string | null | undefined): boolean {
  return !!url && /(amazon\.|amzn\.)/i.test(url);
}

// How many Amazon-link reimbursement deals the creator has used this month.
export function useAmazonQuota() {
  const userId = useAuthStore((s) => s.session?.user?.id);
  return useQuery({
    queryKey: ["amazon-quota", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("amazon_reimbursement_used");
      if (error) throw error;
      const used = Number(data ?? 0);
      return { used, remaining: Math.max(AMAZON_MONTHLY_LIMIT - used, 0), limit: AMAZON_MONTHLY_LIMIT };
    },
  });
}

export function useApplyToCampaign() {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user?.id);
  return useMutation({
    mutationFn: async (input: string | { campaignId: string; campaignType?: string }) => {
      const campaignId = typeof input === "string" ? input : input.campaignId;
      const campaignType = typeof input === "string" ? undefined : input.campaignType;
      // Reimbursement campaigns have no selection step — the creator is
      // auto-selected on apply so they can buy the product straight away.
      const autoSelect = campaignType === "reimbursement";
      const { data, error } = await supabase
        .from("applications")
        .insert({
          campaign_id: campaignId,
          creator_id: userId,
          status: autoSelect ? "selected" : "applied",
          selected_at: autoSelect ? new Date().toISOString() : null,
        })
        .select()
        .single();
      if (error) {
        // Friendly message for the monthly reimbursement cap enforced by the DB.
        if (error.message?.includes("REIMBURSEMENT_MONTHLY_LIMIT")) {
          throw new Error("You've reached the limit of 5 Amazon-product campaigns this month. Try again next month.");
        }
        if (error.message?.includes("CAMPAIGN_SLOTS_FULL")) {
          throw new Error("This campaign is full — all slots are taken. A slot may free up if an application is rejected, so check back later.");
        }
        throw error;
      }
      return data as Application;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["applications"] });
      qc.invalidateQueries({ queryKey: ["amazon-quota"] });
      qc.invalidateQueries({ queryKey: ["campaign-slots"] });
    },
  });
}

// How many application slots are still open on a campaign (rejected
// applications don't count, so a rejection frees a slot). Backed by the
// campaign_slots_left RPC so a creator can see the count without reading
// other creators' applications.
export function useCampaignSlotsLeft(campaignId: string | undefined) {
  return useQuery({
    queryKey: ["campaign-slots", campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("campaign_slots_left", { p_campaign: campaignId });
      if (error) throw error;
      return Number(data ?? 0);
    },
  });
}

async function uploadPurchaseOrder(userId: string, uri: string): Promise<string> {
  const ext = (uri.split(".").pop() ?? "jpg").toLowerCase();
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const response = await fetch(uri);
  const arrayBuffer = await response.arrayBuffer();
  const videoExts = ["mp4", "mov", "m4v", "webm", "avi", "3gp"];
  const contentType =
    ext === "pdf"
      ? "application/pdf"
      : videoExts.includes(ext)
        ? `video/${ext === "mov" ? "quicktime" : ext}`
        : `image/${ext}`;
  const { error } = await supabase.storage
    .from("purchase-orders")
    .upload(path, arrayBuffer, { contentType });
  if (error) throw error;
  return path;
}

/**
 * Uploads the creator's DELIVERED photo (a picture of the product they
 * physically received) into the private `purchase-orders` bucket and stores
 * the path on the application. Does NOT advance the status — for paid/barter
 * staff still review the photo and click "Mark Delivered".
 */
export function useSubmitDeliveryPhoto() {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user?.id);
  return useMutation({
    mutationFn: async (input: { applicationId: string; imageUri: string }) => {
      const path = await uploadPurchaseOrder(userId as string, input.imageUri);
      const { error } = await supabase
        .from("applications")
        .update({
          delivery_photo_url: path,
          delivery_photo_at: new Date().toISOString(),
        })
        .eq("id", input.applicationId);
      if (error) throw error;
    },
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ["applications"] });
      qc.invalidateQueries({ queryKey: ["application", input.applicationId] });
    },
  });
}

export interface PurchaseProofInput {
  applicationId: string;
  imageUri: string;
  amount?: number;
}

/**
 * Uploads the creator's proof of purchase (order screenshot / invoice)
 * and moves the application to `product_received`.
 */
export function useSubmitPurchaseProof() {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user?.id);
  return useMutation({
    mutationFn: async (input: PurchaseProofInput) => {
      const proofPath = await uploadPurchaseOrder(userId as string, input.imageUri);
      const { error } = await supabase
        .from("applications")
        .update({
          purchase_proof: proofPath,
          purchase_amount: input.amount ?? null,
          product_received_at: new Date().toISOString(),
          status: "product_received",
        })
        .eq("id", input.applicationId);
      if (error) throw error;
    },
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ["applications"] });
      qc.invalidateQueries({ queryKey: ["application", input.applicationId] });
    },
  });
}

/**
 * Reimbursement: the creator taps the product link, which opens the purchase
 * page AND starts the 15-minute order window (stamped server-side). Status
 * stays `selected` — the window/cooldown are derived from order_started_at.
 */
export function useStartOrderWindow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (applicationId: string) => {
      const { error } = await supabase
        .from("applications")
        .update({ order_started_at: new Date().toISOString() })
        .eq("id", applicationId);
      if (error) throw error;
    },
    onSuccess: (_data, applicationId) => {
      qc.invalidateQueries({ queryKey: ["applications"] });
      qc.invalidateQueries({ queryKey: ["application", applicationId] });
    },
  });
}

/**
 * Reimbursement: the creator uploads the ORDER screenshot after purchasing.
 * Moves the application to `ordered` so an employee can verify the order
 * before the creator submits their review.
 */
export function useSubmitOrderScreenshot() {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user?.id);
  return useMutation({
    mutationFn: async (input: { applicationId: string; imageUri: string; amount?: number }) => {
      const proofPath = await uploadPurchaseOrder(userId as string, input.imageUri);
      const { error } = await supabase
        .from("applications")
        .update({
          purchase_proof: proofPath,
          purchase_amount: input.amount ?? null,
          status: "ordered",
          order_submitted_at: new Date().toISOString(),
        })
        .eq("id", input.applicationId);
      if (error) throw error;
    },
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ["applications"] });
      qc.invalidateQueries({ queryKey: ["application", input.applicationId] });
    },
  });
}

async function uploadDraftVideo(userId: string, uri: string): Promise<string> {
  const ext = (uri.split(".").pop() ?? "mp4").toLowerCase();
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const response = await fetch(uri);
  const arrayBuffer = await response.arrayBuffer();
  const { error } = await supabase.storage
    .from("submission-videos")
    .upload(path, arrayBuffer, { contentType: `video/${ext === "mov" ? "quicktime" : ext}` });
  if (error) throw error;
  return path;
}

/**
 * Paid flow: creator uploads a DRAFT video for staff approval.
 * Moves the application to `draft_submitted` and clears any prior feedback.
 */
export function useSubmitDraftVideo() {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user?.id);
  return useMutation({
    mutationFn: async (input: { applicationId: string; videoUri: string }) => {
      const path = await uploadDraftVideo(userId as string, input.videoUri);
      const { error } = await supabase
        .from("applications")
        .update({
          draft_video_url: path,
          draft_feedback: null,
          status: "draft_submitted",
        })
        .eq("id", input.applicationId);
      if (error) throw error;
    },
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ["applications"] });
      qc.invalidateQueries({ queryKey: ["application", input.applicationId] });
    },
  });
}

/**
 * Paid flow: after the draft is approved, the creator posts the reel on
 * Instagram and submits its public link. Moves to `link_submitted`.
 */
export function useSubmitReelLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { applicationId: string; reelLink: string }) => {
      const { error } = await supabase
        .from("applications")
        .update({ reel_link: input.reelLink, status: "link_submitted" })
        .eq("id", input.applicationId);
      if (error) throw error;
    },
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ["applications"] });
      qc.invalidateQueries({ queryKey: ["application", input.applicationId] });
    },
  });
}
