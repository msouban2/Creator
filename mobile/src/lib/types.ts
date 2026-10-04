// =============================================================
// Aaina — Shared domain & database types
// =============================================================

export type UserRole = "admin" | "creator";
export type CampaignType = "reimbursement" | "barter" | "paid";
export type CampaignStatus = "active" | "draft" | "closed";
export type ApplicationStatus =
  | "applied"
  | "selected"
  | "ordered"
  | "order_approved"
  | "product_received"
  | "content_creation"
  | "submitted"
  | "review"
  | "payment_in_progress"
  | "completed"
  | "rejected"
  // paid-flow statuses
  | "product_shipped"
  | "delivered"
  | "draft_submitted"
  | "draft_revision"
  | "draft_approved"
  | "posted"
  | "link_submitted";
export type ReviewStatus = "pending" | "approved" | "rejected" | "revision";
export type TransactionType =
  | "campaign_payment"
  | "reimbursement"
  | "referral_bonus"
  | "withdrawal";
export type KycStatus = "pending" | "verified" | "rejected" | "not_submitted";
export type WithdrawalMethod = "upi" | "bank_transfer";
export type WithdrawalStatus = "requested" | "approved" | "rejected" | "paid";

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  phone_verified: boolean;
  profile_image: string | null;
  instagram_username: string | null;
  instagram_url: string | null;
  instagram_followers: number;
  instagram_connected_at: string | null;
  ig_reach: number | null;
  ig_impressions: number | null;
  ig_profile_views: number | null;
  ig_avg_likes: number | null;
  ig_avg_comments: number | null;
  ig_avg_views: number | null;
  ig_engagement_rate: number | null;
  ig_insights_synced_at: string | null;
  youtube_channel: string | null;
  youtube_subscribers: number;
  youtube_channel_id?: string | null;
  youtube_channel_title?: string | null;
  youtube_verified?: boolean;
  youtube_connected_at?: string | null;
  youtube_views: number | null;
  youtube_video_count: number | null;
  youtube_avg_views: number | null;
  youtube_avg_likes: number | null;
  youtube_engagement_rate: number | null;
  yt_insights_synced_at: string | null;
  amazon_profile_url: string | null;
  niches: string[] | null;
  niches_change_count?: number;
  creator_score: number;
  referral_code: string | null;
  referred_by: string | null;
  total_earnings: number;
  kyc_status: KycStatus;
  payout_method: WithdrawalMethod | null;
  payout_upi_id: string | null;
  payout_bank_account: string | null;
  payout_ifsc: string | null;
  payout_account_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Campaign {
  id: string;
  title: string;
  brand_name: string;
  campaign_type: CampaignType;
  campaign_image: string | null;
  campaign_images?: string[] | null;
  description: string | null;
  deliverables: string | null;
  instructions: string | null;
  category: string | null;
  min_followers: number;
  max_followers: number | null;
  slots: number;
  reward_amount: number;
  cashback_percentage: number;
  application_deadline: string | null;
  campaign_deadline: string | null;
  product_url: string | null;
  product_name: string | null;
  asin: string | null;
  review_upload_hours: number | null;
  sample_video_url: string | null;
  campaign_code?: string | null;
  sample_screenshots?: string[] | null;
  status: CampaignStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Application {
  id: string;
  creator_id: string;
  campaign_id: string;
  status: ApplicationStatus;
  reject_reason: string | null;
  reject_count: number;
  last_rejected_at: string | null;
  purchase_proof: string | null;
  purchase_amount: number | null;
  payout_amount: number | null;
  order_id: string | null;
  order_date: string | null;
  order_started_at: string | null;
  order_submitted_at: string | null;
  product_received_at: string | null;
  review_deadline: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  expected_delivery_at: string | null;
  delivery_photo_url: string | null;
  delivery_photo_at: string | null;
  seller_shipment_status: string | null;
  draft_video_url: string | null;
  draft_feedback: string | null;
  draft_deadline: string | null;
  reel_link: string | null;
  applied_at: string;
  selected_at: string | null;
  completed_at: string | null;
  updated_at: string;
  campaign?: Campaign;
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
  reel_url: string | null;
  story_url: string | null;
  post_url: string | null;
  youtube_url: string | null;
  screenshots: string[];
  notes: string | null;
  video_url: string | null;
  seller_feedback_video: string | null;
  seller_feedback_screenshot: string | null;
  order_amount: number | null;
  review_tag: string | null;
  review_status: ReviewStatus;
  created_at: string;
  updated_at: string;
}

export interface Wallet {
  id: string;
  user_id: string;
  available_balance: number;
  pending_balance: number;
  lifetime_earnings: number;
  updated_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  amount: number;
  type: TransactionType;
  remarks: string | null;
  campaign_id: string | null;
  created_at: string;
}

export interface Withdrawal {
  id: string;
  user_id: string;
  amount: number;
  method: WithdrawalMethod;
  upi_id: string | null;
  bank_account: string | null;
  ifsc_code: string | null;
  account_name: string | null;
  status: WithdrawalStatus;
  processed_by: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface Referral {
  id: string;
  referrer_id: string;
  referred_creator_id: string;
  commission_earned: number;
  created_at: string;
  referred?: Profile;
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
  pan_verified_at?: string | null;
  aadhaar_verified?: boolean;
  aadhaar_name?: string | null;
  aadhaar_verified_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BankAccount {
  id: string;
  user_id: string;
  account_holder_name: string;
  bank_name: string;
  account_number: string;
  ifsc_code: string;
  is_primary: boolean;
  verified?: boolean;
  verified_name?: string | null;
  branch?: string | null;
  verified_at?: string | null;
  created_at: string;
}

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface AppSettings {
  key: string;
  value: Json;
  updated_at: string;
}

// Minimal Database typing surface for supabase-js generics.
type TableDef<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export interface SupportTicketRow {
  id: string;
  user_id: string;
  subject: string;
  category: string | null;
  status: "open" | "resolved";
  last_message_at: string;
  created_at: string;
}

export interface SupportMessageRow {
  id: string;
  ticket_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: TableDef<Profile>;
      campaigns: TableDef<Campaign>;
      applications: TableDef<Application>;
      creator_addresses: TableDef<CreatorAddress>;
      campaign_submissions: TableDef<CampaignSubmission>;
      wallets: TableDef<Wallet>;
      transactions: TableDef<Transaction>;
      withdrawals: TableDef<Withdrawal>;
      referrals: TableDef<Referral>;
      notifications: TableDef<AppNotification>;
      kyc: TableDef<Kyc>;
      app_settings: TableDef<AppSettings>;
      support_tickets: TableDef<SupportTicketRow>;
      support_messages: TableDef<SupportMessageRow>;
      push_tokens: TableDef<{ token: string; user_id: string; platform: string | null; updated_at: string }>;
    };
    Views: { [_ in never]: never };
    Functions: {
      request_withdrawal: {
        Args: {
          p_amount: number;
          p_method: WithdrawalMethod;
          p_upi?: string | null;
          p_bank_account?: string | null;
          p_ifsc?: string | null;
          p_account_name?: string | null;
        };
        Returns: string;
      };
      release_campaign_payment: {
        Args: { p_application: string; p_amount: number; p_type?: TransactionType };
        Returns: undefined;
      };
      approve_withdrawal: {
        Args: { p_withdrawal: string; p_approve: boolean };
        Returns: undefined;
      };
      complete_social_profile: {
        Args: { p_niches: string[]; p_referral_code: string | null };
        Returns: undefined;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
