import { Share } from "react-native";
import type { Campaign } from "./types";
import { formatCurrency } from "./format";

// Public web base that hosts the campaign landing/redirect page. An https link
// is used (not the bilkul:// scheme) because messaging apps like WhatsApp only
// make http/https URLs tappable. The landing page then opens the app (or offers
// a download) and forwards the ?ref= code.
const WEB_BASE = "https://thebilkul.com";

// Builds a shareable https link that opens this campaign and carries the
// referrer's code, e.g. https://thebilkul.com/c/<id>?ref=<code>.
export function buildCampaignShareLink(campaignId: string, referralCode?: string | null): string {
  const base = `${WEB_BASE}/c/${campaignId}`;
  return referralCode ? `${base}?ref=${encodeURIComponent(referralCode)}` : base;
}

// Builds a friendly share message for a campaign that embeds the creator's
// referral code. When a new creator joins with this code, the referrer is
// automatically credited every time that creator completes a campaign (see the
// award_referral_bonus trigger in supabase/migrations/0032_referral_per_campaign.sql).
export function buildCampaignShareMessage(campaign: Campaign, referralCode?: string | null): string {
  const reimbursementTotal = campaign.reward_amount + campaign.cashback_percentage;
  const rewardLine =
    campaign.campaign_type === "paid"
      ? `💸 Earn up to ${formatCurrency(campaign.reward_amount)}`
      : campaign.campaign_type === "barter"
        ? `🎁 Get a product worth ${formatCurrency(campaign.reward_amount)}`
        : `🏷️ Earn up to ${formatCurrency(reimbursementTotal || campaign.reward_amount)}`;

  const link = buildCampaignShareLink(campaign.id, referralCode);

  const codeLine = referralCode
    ? `\n\nJoin Bilkul with my referral code *${referralCode}* and start earning from brand campaigns too!`
    : "\n\nDownload Bilkul and start earning from brand campaigns!";

  return (
    `Check out this campaign on Bilkul 🎬\n\n` +
    `${campaign.title} — ${campaign.brand_name}\n` +
    `${rewardLine}` +
    `${codeLine}\n\n` +
    `👉 ${link}`
  );
}

export async function shareCampaign(campaign: Campaign, referralCode?: string | null): Promise<void> {
  try {
    await Share.share({ message: buildCampaignShareMessage(campaign, referralCode) });
  } catch {
    // user dismissed the share sheet — nothing to do
  }
}
