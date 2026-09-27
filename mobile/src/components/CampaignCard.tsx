import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { Campaign } from "../lib/types";
import { colors } from "../lib/theme";
import { formatCurrency } from "../lib/format";
import { shareCampaign } from "../lib/share";
import { useAuthStore } from "../store/auth";
import { Card } from "./ui/Card";
import { CampaignImage } from "./CampaignImage";

const TAG: Record<string, string> = {
  reimbursement: "Reimbursement",
  barter: "Barter",
  paid: "Paid",
};

export function CampaignCard({ campaign }: { campaign: Campaign }) {
  const router = useRouter();
  const referralCode = useAuthStore((s) => s.profile?.referral_code);
  const isReimbursement = campaign.campaign_type === "reimbursement";
  const reimbursementTotal = campaign.reward_amount + campaign.cashback_percentage;
  const open = () => router.push(`/campaign/${campaign.id}`);

  const amount = formatCurrency(
    isReimbursement ? reimbursementTotal || campaign.reward_amount : campaign.reward_amount
  );
  const amountLabel = isReimbursement
    ? "Cashback up to"
    : campaign.campaign_type === "paid"
      ? "Earn up to"
      : "Product worth";

  return (
    <Card className="mx-5">
      <Pressable onPress={open} className="flex-row">
        {/* Product image box */}
        <CampaignImage
          uri={campaign.campaign_image}
          className="h-36 w-28 rounded-2xl"
          resizeMode="cover"
          iconSize={32}
        />

        {/* Details */}
        <View className="ml-3 flex-1">
          <View className="flex-row items-start justify-between">
            <View className="self-start rounded-full bg-primary-50 px-2.5 py-1">
              <Text className="text-[10px] font-bold text-primary">
                {TAG[campaign.campaign_type]}
              </Text>
            </View>
            <Pressable hitSlop={8} onPress={() => shareCampaign(campaign, referralCode)}>
              <Ionicons name="bookmark-outline" size={18} color={colors.ink} />
            </Pressable>
          </View>

          <Text className="mt-1.5 text-base font-extrabold text-ink" numberOfLines={2}>
            {campaign.title}
          </Text>
          <View className="mt-1 flex-row items-center gap-1.5">
            <Ionicons name="pricetag-outline" size={12} color={colors.primary} />
            <Text className="text-xs text-ink-soft" numberOfLines={1}>
              {campaign.category ?? campaign.brand_name}
            </Text>
          </View>

          <Text className="mt-2 text-[11px] text-ink-muted">{amountLabel}</Text>
          <View className="mt-0.5 flex-row items-center justify-between">
            <Text className="text-lg font-extrabold text-primary" numberOfLines={1}>
              {amount}
            </Text>
            <Pressable
              onPress={open}
              className="flex-row items-center gap-1 rounded-full bg-primary-50 px-3 py-2"
            >
              <Text className="text-xs font-bold text-ink">View Campaign</Text>
              <Ionicons name="arrow-forward" size={13} color={colors.ink} />
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Card>
  );
}
