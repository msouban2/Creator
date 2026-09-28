import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/auth";
import type { CampaignSubmission } from "../lib/types";

export function useSubmission(applicationId: string) {
  return useQuery({
    queryKey: ["submission", applicationId],
    enabled: !!applicationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_submissions")
        .select("*")
        .eq("application_id", applicationId)
        .maybeSingle();
      if (error) throw error;
      return data as CampaignSubmission | null;
    },
  });
}

export interface SubmissionInput {
  applicationId: string;
  reel_url?: string;
  post_url?: string;
  story_url?: string;
  youtube_url?: string;
  notes?: string;
  screenshots?: string[];
  video_url?: string;
  seller_feedback_video?: string;
  seller_feedback_screenshot?: string;
  order_amount?: number;
}

async function uploadScreenshot(userId: string, uri: string): Promise<string> {
  const ext = uri.split(".").pop() ?? "jpg";
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const response = await fetch(uri);
  const arrayBuffer = await response.arrayBuffer();
  const { error } = await supabase.storage
    .from("submission-screenshots")
    .upload(path, arrayBuffer, { contentType: `image/${ext}` });
  if (error) throw error;
  return path;
}

async function uploadVideo(userId: string, uri: string): Promise<string> {
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

export function useUploadScreenshots() {
  const userId = useAuthStore((s) => s.session?.user?.id);
  return useMutation({
    mutationFn: async (uris: string[]) => {
      const paths = await Promise.all(
        uris.map((uri) => uploadScreenshot(userId as string, uri))
      );
      return paths;
    },
  });
}

export function useUploadVideo() {
  const userId = useAuthStore((s) => s.session?.user?.id);
  return useMutation({
    mutationFn: async (uri: string) => uploadVideo(userId as string, uri),
  });
}

export function useSubmitContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SubmissionInput) => {
      const { data: application, error: appErr } = await supabase
        .from("applications")
        .select("id, expected_delivery_at, campaign:campaigns!campaign_id(id, campaign_type)")
        .eq("id", input.applicationId)
        .maybeSingle();

      if (appErr) throw appErr;
      const campaignType = (application?.campaign as { campaign_type?: string } | null)?.campaign_type;
      const expectedDeliveryAt = application?.expected_delivery_at ?? null;
      if (campaignType === "reimbursement" && expectedDeliveryAt) {
        const deliveryDate = new Date(expectedDeliveryAt).getTime();
        if (Date.now() < deliveryDate) {
          throw new Error(`Submission is locked until ${new Date(expectedDeliveryAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.`);
        }
      }

      const record = {
        application_id: input.applicationId,
        reel_url: input.reel_url,
        post_url: input.post_url,
        story_url: input.story_url,
        youtube_url: input.youtube_url,
        notes: input.notes,
        screenshots: input.screenshots ?? [],
        video_url: input.video_url,
        seller_feedback_video: input.seller_feedback_video,
        seller_feedback_screenshot: input.seller_feedback_screenshot,
        order_amount: input.order_amount,
        review_status: "pending" as const,
      };

      // Manual upsert so it works whether or not a unique constraint
      // exists on application_id: update the existing row, else insert.
      const { data: existing } = await supabase
        .from("campaign_submissions")
        .select("id")
        .eq("application_id", input.applicationId)
        .maybeSingle();

      let sub: CampaignSubmission;
      if (existing) {
        const { data, error } = await supabase
          .from("campaign_submissions")
          .update(record)
          .eq("id", existing.id)
          .select()
          .single();
        if (error) throw error;
        sub = data as CampaignSubmission;
      } else {
        const { data, error } = await supabase
          .from("campaign_submissions")
          .insert(record)
          .select()
          .single();
        if (error) throw error;
        sub = data as CampaignSubmission;
      }

      await supabase
        .from("applications")
        .update({ status: "submitted" })
        .eq("id", input.applicationId);

      return sub;
    },
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ["submission", input.applicationId] });
      qc.invalidateQueries({ queryKey: ["applications"] });
      qc.invalidateQueries({ queryKey: ["application", input.applicationId] });
    },
  });
}
