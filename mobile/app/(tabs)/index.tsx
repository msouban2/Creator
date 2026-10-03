import { useState } from "react";
import { FlatList, Image, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HomeHeader } from "../../src/components/HomeHeader";
import { TypeTabs } from "../../src/components/TypeTabs";
import { CampaignCard } from "../../src/components/CampaignCard";
import { EmptyState } from "../../src/components/ui/EmptyState";
import { useCampaigns, type CampaignSort } from "../../src/api/campaigns";
import { useAuthStore } from "../../src/store/auth";
import type { CampaignType } from "../../src/lib/types";
import { colors } from "../../src/lib/theme";
import { compactNumber } from "../../src/lib/format";

const BARTER_MIN = 500;

const CATEGORIES = [
  "All",
  "Fashion",
  "Beauty",
  "Food",
  "Tech",
  "Fitness",
  "Travel",
  "Lifestyle",
  "Gadgets",
] as const;

function Banner({ type }: { type: CampaignType }) {
  const config = {
    reimbursement: {
      title: "Your next opportunity is waiting 😍",
      sub: "Explore campaigns and earn exciting rewards!",
    },
    barter: {
      title: "Barter Collaborations 🎁",
      sub: "Get products in exchange for content.",
    },
    paid: {
      title: "Paid Collaborations 💰",
      sub: "Get paid for your creativity.",
    },
  }[type];

  return (
    <View
      className="mx-5 mt-4 flex-row items-center overflow-hidden rounded-3xl"
      style={{ backgroundColor: "#FEEEEE" }}
    >
      <View className="flex-1 py-5 pl-5 pr-1">
        <Text className="text-lg font-extrabold text-ink">{config.title}</Text>
        <Text className="mt-1.5 text-xs text-ink-soft">{config.sub}</Text>
      </View>
      <Image
        source={require("../../assets/cat-box.png")}
        style={{ width: 150, height: 118 }}
        resizeMode="contain"
      />
    </View>
  );
}

function CategoryChips({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (c: string | null) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
      className="mt-4"
    >
      {CATEGORIES.map((cat) => {
        const selected = (cat === "All" && !value) || cat === value;
        return (
          <Pressable
            key={cat}
            onPress={() => onChange(cat === "All" ? null : cat)}
            className={`rounded-full border px-4 py-2 ${
              selected ? "border-ink bg-ink" : "border-primary-100 bg-white"
            }`}
          >
            <Text
              className={`text-xs font-semibold ${
                selected ? "text-white" : "text-ink-soft"
              }`}
            >
              {cat}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}


function SortButton({
  sort,
  onSort,
}: {
  sort: CampaignSort;
  onSort: (s: CampaignSort) => void;
}) {
  const cycle: Record<CampaignSort, CampaignSort> = {
    recommended: "latest",
    latest: "highest_reward",
    highest_reward: "recommended",
  };
  const label: Record<CampaignSort, string> = {
    recommended: "Recommended",
    latest: "Latest",
    highest_reward: "Top Reward",
  };
  return (
    <Pressable
      onPress={() => onSort(cycle[sort])}
      className="flex-row items-center gap-1.5 rounded-full border border-primary-100 bg-white px-3.5 py-2"
    >
      <Ionicons name="swap-vertical-outline" size={14} color={colors.primary} />
      <Text className="text-xs font-semibold text-ink">{label[sort]}</Text>
    </Pressable>
  );
}

function BarterLocked({ followers, username, typeLabel }: { followers: number; username?: string | null; typeLabel: string }) {
  const remaining = Math.max(BARTER_MIN - followers, 0);
  const progress = Math.min(followers / BARTER_MIN, 1);
  const tips = [
    { icon: "videocam-outline", title: "Post Reels consistently", sub: "Reels get more reach and followers" },
    { icon: "people-outline", title: "Engage with your audience", sub: "Reply to comments and build connections" },
    { icon: "pricetag-outline", title: "Use trending hashtags", sub: "Help more people discover your content" },
  ] as const;

  return (
    <View className="px-5 pt-4">
      <View className="items-center">
        <View className="h-40 w-40 items-center justify-center rounded-full bg-primary-100">
          <Ionicons name="lock-closed" size={56} color={colors.primary} />
        </View>
        <Text className="mt-4 text-2xl font-extrabold text-ink">No campaigns available</Text>
        <Text className="mt-2 text-center text-sm text-ink-soft">
          You need a minimum of {BARTER_MIN} followers to{"\n"}unlock {typeLabel} collaborations.
        </Text>
      </View>

      <View className="mt-6 rounded-2xl bg-white p-4">
        <Text className="text-base font-bold text-ink">Your Instagram followers</Text>
        <View className="mt-3 flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <Ionicons name="logo-instagram" size={18} color="#E1306C" />
            <Text className="text-sm text-ink-soft">@{username ?? "creator"}</Text>
          </View>
          <View className="rounded-lg bg-primary-100 px-3 py-1">
            <Text className="text-sm font-bold text-primary">{compactNumber(followers)} Followers</Text>
          </View>
        </View>
        <Text className="mt-4 text-sm font-semibold text-ink">You are {remaining} followers away!</Text>
        <View className="mt-2 flex-row items-center justify-between">
          <Text className="text-xs font-bold text-primary">{followers}</Text>
          <Text className="text-xs text-ink-muted">{BARTER_MIN}</Text>
        </View>
        <View className="mt-1 h-2 overflow-hidden rounded-full bg-primary-50">
          <View className="h-full rounded-full bg-primary" style={{ width: `${progress * 100}%` }} />
        </View>
        <Text className="mt-2 text-center text-xs text-ink-muted">
          Keep creating amazing content, you're almost there! ✨
        </Text>
      </View>

      <Text className="mt-6 text-base font-bold text-ink">Tips to grow faster ✨</Text>
      <View className="mt-3 gap-3">
        {tips.map((tip) => (
          <View key={tip.title} className="flex-row items-center gap-3 rounded-2xl bg-primary-50 p-3.5">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-primary-100">
              <Ionicons name={tip.icon} size={18} color={colors.primary} />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-ink">{tip.title}</Text>
              <Text className="text-xs text-ink-muted">{tip.sub}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.inkMuted} />
          </View>
        ))}
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const profile = useAuthStore((s) => s.profile);
  const [type, setType] = useState<CampaignType>("reimbursement");
  const [sort, setSort] = useState<CampaignSort>("recommended");
  const [category, setCategory] = useState<string | null>(null);
  const { data: campaigns = [], isLoading, refetch, isRefetching } = useCampaigns({
    type,
    sort,
    category,
  });

  const barterLocked =
    !!profile && (type === "barter" || type === "paid") && profile.instagram_followers < BARTER_MIN;

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top + 6 }}>
      <HomeHeader name={profile?.full_name} />
      <TypeTabs value={type} onChange={setType} />

      {barterLocked ? (
        <FlatList
          data={[]}
          renderItem={null}
          keyExtractor={() => "x"}
          ListHeaderComponent={
            <BarterLocked
              followers={profile?.instagram_followers ?? 0}
              username={profile?.instagram_username}
              typeLabel={type === "paid" ? "paid" : "barter"}
            />
          }
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          data={campaigns}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View className="mb-4">
              <CampaignCard campaign={item} />
            </View>
          )}
          ListHeaderComponent={
            <View className="mb-2">
              <Banner type={type} />
              <CategoryChips value={category} onChange={setCategory} />
              <View className="mx-5 mt-5 flex-row items-center justify-between">
                <Text className="text-lg font-bold text-ink">
                  {category ?? "All"} Campaigns
                </Text>
                <SortButton sort={sort} onSort={setSort} />
              </View>
              <View className="mt-4" />
            </View>
          }
          ListEmptyComponent={
            !isLoading ? (
              <EmptyState
                icon="cube-outline"
                title="No campaigns available"
                message="Check back soon for new opportunities."
              />
            ) : null
          }
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
          }
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}
