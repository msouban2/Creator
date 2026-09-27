import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Campaign, CampaignType } from "../lib/types";

export type CampaignSort = "recommended" | "latest" | "highest_reward";

// Explicit column list for creator-facing campaign reads. Excludes admin-only
// fields (e.g. budget, seller_id/seller_name) so they are never sent to the
// creator app — not even in the raw API payload.
export const CAMPAIGN_COLUMNS =
  "id, title, brand_name, campaign_type, campaign_image, description, deliverables, instructions, category, min_followers, max_followers, slots, reward_amount, cashback_percentage, application_deadline, campaign_deadline, product_url, product_name, asin, review_upload_hours, sample_video_url, sample_screenshots, status, created_by, created_at, updated_at";

export interface CampaignFilters {
  type: CampaignType;
  sort?: CampaignSort;
  category?: string | null;
  minReward?: number | null;
  maxFollowers?: number | null;
}

async function fetchCampaigns(filters: CampaignFilters): Promise<Campaign[]> {
  let query = supabase
    .from("campaigns")
    .select(CAMPAIGN_COLUMNS)
    .eq("status", "active")
    .is("deleted_at", null)
    .eq("campaign_type", filters.type);

  if (filters.category) query = query.eq("category", filters.category);
  if (filters.minReward != null) query = query.gte("reward_amount", filters.minReward);
  if (filters.maxFollowers != null)
    query = query.lte("min_followers", filters.maxFollowers);

  switch (filters.sort) {
    case "latest":
      query = query.order("created_at", { ascending: false });
      break;
    case "highest_reward":
      query = query.order("reward_amount", { ascending: false });
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }

  const { data, error } = await query;
  if (error) throw error;
  // A campaign is "closed" once its deadline passes — hide those from the app
  // even if their stored status is still "active" (admin still sees them closed).
  const now = Date.now();
  return ((data ?? []) as Campaign[]).filter((c) => {
    const deadline = c.campaign_deadline ?? c.application_deadline;
    return !deadline || new Date(deadline).getTime() > now;
  });
}

export function useCampaigns(filters: CampaignFilters) {
  return useQuery({
    queryKey: ["campaigns", filters],
    queryFn: () => fetchCampaigns(filters),
  });
}

export function useCampaign(id: string) {
  return useQuery({
    queryKey: ["campaign", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select(CAMPAIGN_COLUMNS)
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Campaign;
    },
  });
}
