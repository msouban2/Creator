export type UserRole = "admin" | "employee" | "creator" | "seller";
export type SellerType = "ships_directly" | "coupon_code";
export type ShipmentStatus = "pending" | "shipped" | "delivered";
export type CampaignType = "reimbursement" | "barter" | "paid";
export type CampaignStatus = "active" | "draft" | "closed";
export type ApplicationStatus =
  | "applied" | "selected" | "ordered" | "order_approved" | "product_received" | "content_creation"
  | "submitted" | "review" | "payment_in_progress" | "completed" | "rejected"
  // paid-flow statuses
  | "product_shipped" | "delivered" | "draft_submitted" | "draft_revision"
  | "draft_approved" | "posted" | "link_submitted";
export type ReviewStatus = "pending" | "approved" | "rejected" | "revision";
export type WithdrawalStatus = "requested" | "approved" | "rejected" | "paid" | "failed";
export type KycStatus = "pending" | "verified" | "rejected" | "not_submitted";

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  profile_image: string | null;
  instagram_username: string | null;
  instagram_followers: number;
  youtube_subscribers: number;
  amazon_profile_url?: string | null;
  niches?: string[] | null;
  niches_change_count?: number;
  creator_score: number;
  referral_code: string | null;
  total_earnings: number;
  kyc_status: KycStatus;
  created_at: string;
  // Per-section access granted to an employee (empty/absent = no access).
  // Ignored for admins (full access) and other roles.
  permissions: string[] | null;
  // Whether an agent is currently available to pick up work.
  available?: boolean;
  // Campaign types (barter/reimbursement/paid) an employee reviews. Empty = none.
  // Ignored for admins (all) and non-employees.
  review_types: string[] | null;
  // Seller fulfilment type (only meaningful for role = 'seller')
  seller_type: SellerType | null;
  // Instagram insights (synced from the creator's connected account)
  ig_reach: number | null;
  ig_impressions: number | null;
  ig_profile_views: number | null;
  ig_avg_likes: number | null;
  ig_avg_comments: number | null;
  ig_avg_views: number | null;
  ig_engagement_rate: number | null;
  ig_insights_synced_at: string | null;
  // YouTube insights (synced from the creator's verified channel)
  youtube_channel?: string | null;
  youtube_channel_id?: string | null;
  youtube_channel_title?: string | null;
  youtube_verified?: boolean | null;
  youtube_views?: number | null;
  youtube_video_count?: number | null;
  youtube_avg_views?: number | null;
  youtube_avg_likes?: number | null;
  youtube_engagement_rate?: number | null;
  yt_insights_synced_at?: string | null;
}

export interface Campaign {
  id: string;
  title: string;
  brand_name: string;
  campaign_type: CampaignType;
  campaign_image: string | null;
  description: string | null;
  deliverables: string | null;
  instructions: string | null;
  category: string | null;
  min_followers: number;
  max_followers: number | null;
  slots: number;
  reward_amount: number;
  cashback_percentage: number;
  budget?: number | null;
  cashback_budget?: number | null;
  commission_budget?: number | null;
  referral_amount?: number | null;
  application_deadline: string | null;
  campaign_deadline: string | null;
  product_url: string | null;
  product_name: string | null;
  asin: string | null;
  platform: string | null;
  review_upload_hours: number | null;
  sample_video_url: string | null;
  sample_screenshots?: string[] | null;
  status: CampaignStatus;
  campaign_code?: string | null;
  deleted_at?: string | null;
  seller_id: string | null;
  seller_name: string | null;
  seller?: { id: string; full_name: string | null; email: string | null; seller_type?: SellerType | null } | null;
  created_at: string;
}

export type SellerProductStatus = "pending" | "approved" | "rejected" | "used";

export interface CampaignRequest {
  id: string;
  seller_id: string;
  brand_name: string;
  product_name: string | null;
  campaign_type: CampaignType;
  slots: number;
  reward_amount: number | null;
  budget: number | null;
  min_followers: number | null;
  preferred_start: string | null;
  notes: string | null;
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  seller?: { id: string; full_name: string | null; email: string | null } | null;
}

export interface SellerProduct {
  id: string;
  seller_id: string;
  brand_name: string;
  product_name: string;
  asin: string | null;
  product_url: string | null;
  price: number | null;
  image_url: string | null;
  description: string | null;
  notes: string | null;
  status: SellerProductStatus;
  created_at: string;
  seller?: { id: string; full_name: string | null; email: string | null } | null;
}

export interface DealOrder {
  id: string;
  campaign_id: string;
  seller_id: string | null;
  creator_id: string | null;
  deal_date: string | null;
  product_name: string | null;
  asin: string | null;
  order_number: string | null;
  deal_type: string | null;
  num_orders: number;
  delivered_orders: number;
  total_payment: number;
  payment_done: number;
  commission: number;
  status: string;
  notes: string | null;
  coupon_code: string | null;
  tracking_id: string | null;
  shipment_status: ShipmentStatus;
  shipped_at: string | null;
  created_at: string;
  campaign?: {
    id: string;
    title: string;
    brand_name: string;
    product_name: string | null;
    campaign_type: CampaignType;
    seller_name?: string | null;
    seller?: { id: string; full_name: string | null; email: string | null; seller_type?: SellerType | null } | null;
  } | null;
  creator?: { id: string; full_name: string | null } | null;
}

export interface Application {
  id: string;
  creator_id: string;
  campaign_id: string;
  status: ApplicationStatus;
  ref_no: number | null;
  reject_reason: string | null;
  purchase_proof: string | null;
  purchase_amount: number | null;
  order_started_at: string | null;
  product_received_at: string | null;
  order_submitted_at?: string | null;
  review_deadline: string | null;
  reject_count?: number | null;
  last_rejected_at?: string | null;
  shipped_at: string | null;
  draft_video_url: string | null;
  draft_feedback: string | null;
  draft_deadline: string | null;
  reel_link: string | null;
  applied_at: string;
  selected_at: string | null;
  completed_at: string | null;
  payout_amount: number | null;
  delivered_at: string | null;
  expected_delivery_at?: string | null;
  delivery_photo_url: string | null;
  delivery_photo_at: string | null;
  order_id: string | null;
  order_date: string | null;
  seller_feedback: string | null;
  seller_commission: number | null;
  reel_engagement: number | null;
  // Seller-submitted shipping tracking (see migration 0019).
  seller_tracking_id: string | null;
  seller_tracking_code: string | null;
  seller_shipment_status: string | null;
  seller_courier?: string | null;
  seller_tracking_events?: { location: string | null; detail: string | null; date: string | null }[] | null;
  seller_tracking_synced_at?: string | null;
  last_action_by: string | null;
  last_action_at: string | null;
  campaign?: Campaign;
  creator?: Profile;
  actor?: { id: string; full_name: string | null } | null;
  submissions?: CampaignSubmission[];
  address?: CreatorAddress | null;
}

export interface CreatorAddress {
  id: string;
  user_id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  phone: string | null;
  created_at: string;
}

export interface CampaignSubmission {
  id: string;
  application_id: string;
  ref_no: number | null;
  reel_url: string | null;
  story_url: string | null;
  post_url: string | null;
  youtube_url: string | null;
  video_url: string | null;
  screenshots: string[];
  notes: string | null;
  seller_feedback_video: string | null;
  seller_feedback_screenshot: string | null;
  order_amount: number | null;
  review_tag: string | null;
  review_note: string | null;
  review_status: ReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
  created_at: string;
  application?: Application;
  reviewer?: { id: string; full_name: string | null } | null;
  claimer?: { id: string; full_name: string | null } | null;
}

export interface Kyc {
  id: string;
  user_id: string;
  pan_number: string | null;
  aadhaar_number: string | null;
  document_image: string | null;
  status: KycStatus;
  reviewed_by: string | null;
  pan_verified?: boolean;
  pan_name?: string | null;
  pan_type?: string | null;
  aadhaar_verified?: boolean;
  aadhaar_name?: string | null;
  created_at: string;
  updated_at: string;
  profile?: Profile;
}

export interface Withdrawal {
  id: string;
  user_id: string;
  amount: number;
  method: "upi" | "bank_transfer";
  upi_id: string | null;
  bank_account: string | null;
  ifsc_code: string | null;
  account_name: string | null;
  status: WithdrawalStatus;
  reference_id: string | null;
  failure_reason: string | null;
  processed_at?: string | null;
  created_at: string;
  profile?: Profile;
}

export interface SellerPayment {
  id: string;
  seller_id: string;
  amount: number;
  note: string | null;
  brand: string | null;
  received_on: string | null;
  payment_mode: string | null;
  reference: string | null;
  campaign_code: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  seller?: { id: string; full_name: string | null; email: string | null } | null;
  creator?: { id: string; full_name: string | null } | null;
}

export interface AppNotification {
  id: string;
  user_id: string | null;
  title: string;
  message: string | null;
  type: string | null;
  is_read: boolean;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> };
      campaigns: { Row: Campaign; Insert: Partial<Campaign>; Update: Partial<Campaign> };
      applications: { Row: Application; Insert: Partial<Application>; Update: Partial<Application> };
      campaign_submissions: { Row: CampaignSubmission; Insert: Partial<CampaignSubmission>; Update: Partial<CampaignSubmission> };
      withdrawals: { Row: Withdrawal; Insert: Partial<Withdrawal>; Update: Partial<Withdrawal> };
      notifications: { Row: AppNotification; Insert: Partial<AppNotification>; Update: Partial<AppNotification> };
      kyc: { Row: Kyc; Insert: Partial<Kyc>; Update: Partial<Kyc> };
    };
  };
}
