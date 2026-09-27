import { useState } from "react";
import { FlatList, Pressable, Share, Text, TextInput, View, Image } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { HomeHeader } from "../../src/components/HomeHeader";
import { EmptyState } from "../../src/components/ui/EmptyState";
import { useReferrals, useReferralRewards } from "../../src/api/referrals";
import { useAuthStore } from "../../src/store/auth";
import { colors } from "../../src/lib/theme";
import { formatCurrency } from "../../src/lib/format";

function ReferralAvatar({ uri }: { uri?: string | null }) {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: 44, height: 44, borderRadius: 22 }}
      />
    );
  }
  return (
    <View className="h-11 w-11 items-center justify-center rounded-full bg-primary-100">
      <Ionicons name="person-outline" size={20} color={colors.primary} />
    </View>
  );
}

export default function ReferralsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const { data: referrals = [], isLoading } = useReferrals(search);
  const { data: rewards } = useReferralRewards();
  const profile = useAuthStore((s) => s.profile);

  const code = profile?.referral_code ?? "";

  const shareCode = async () => {
    if (!code) return;
    const link = `https://thebilkul.com/r/${encodeURIComponent(code)}`;
    try {
      await Share.share({
        message:
          `Join me on Bilkul and start earning from brand campaigns! 🎉\n\n` +
          `Use my referral code: ${code}\n\n` +
          `📲 Download & sign up here:\n${link}\n\n` +
          `The code is applied automatically when you sign up from this link.`,
      });
    } catch {
      // user dismissed the share sheet
    }
  };

  const copyCode = async () => {
    if (!code) return;
    await Clipboard.setStringAsync(code);
  };

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top + 6 }}>
      <HomeHeader title="My Referrals" subtitle="Creators you referred" />

      {/* Share code */}
      {code ? (
        <View className="mx-5 mb-2 mt-1 flex-row items-center gap-3 rounded-2xl bg-ink px-4 py-3.5">
          <View className="flex-1">
            <Text className="text-[11px] text-white/70">Your referral code</Text>
            <Text className="text-lg font-extrabold tracking-widest text-white">{code}</Text>
          </View>
          <Pressable
            onPress={copyCode}
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full bg-white/10"
          >
            <Ionicons name="copy-outline" size={18} color="#FFFFFF" />
          </Pressable>
          <Pressable
            onPress={shareCode}
            className="flex-row items-center gap-1.5 rounded-full bg-white px-4 py-2.5"
          >
            <Ionicons name="share-social-outline" size={16} color={colors.ink} />
            <Text className="text-sm font-bold text-ink">Share</Text>
          </Pressable>
        </View>
      ) : null}

      {/* How much you earn per referred creator's campaign */}
      {rewards ? (
        <View className="mx-5 mb-2 rounded-2xl border border-primary-100 bg-white px-4 py-3.5">
          <View className="flex-row items-center gap-2">
            <Ionicons name="cash-outline" size={16} color={colors.primary} />
            <Text className="text-sm font-bold text-ink">You earn on every campaign they complete</Text>
          </View>
          <View className="mt-3 flex-row gap-2.5">
            <View className="flex-1 items-center rounded-xl bg-primary-50 py-2.5">
              <Text className="text-lg font-extrabold text-primary">{formatCurrency(rewards.reimbursement)}</Text>
              <Text className="mt-0.5 text-[11px] font-medium text-ink-soft">Reimbursement</Text>
            </View>
            <View className="flex-1 items-center rounded-xl bg-primary-50 py-2.5">
              <Text className="text-lg font-extrabold text-primary">{formatCurrency(rewards.barter)}</Text>
              <Text className="mt-0.5 text-[11px] font-medium text-ink-soft">Barter</Text>
            </View>
            <View className="flex-1 items-center rounded-xl bg-primary-50 py-2.5">
              <Text className="text-lg font-extrabold text-primary">{formatCurrency(rewards.paid)}</Text>
              <Text className="mt-0.5 text-[11px] font-medium text-ink-soft">Paid</Text>
            </View>
          </View>
          <Text className="mt-2.5 text-[11px] text-ink-muted">
            Paid to you each time a creator you referred completes a campaign, based on its type.
          </Text>
        </View>
      ) : null}

      {/* Search */}
      <View className="mx-5 mb-1 mt-1 flex-row items-center gap-2 rounded-2xl bg-primary-50 px-4 py-3">
        <Ionicons name="search" size={18} color={colors.inkMuted} />
        <TextInput
          className="flex-1 text-base text-ink"
          placeholder="Search creator name..."
          placeholderTextColor={colors.inkMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <FlatList
        data={referrals}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/referral/${item.id}`)}
            className="mb-2.5 flex-row items-center gap-3 rounded-2xl border border-primary-100 bg-white px-4 py-3.5"
          >
            <ReferralAvatar uri={item.referred?.profile_image} />
            <Text className="flex-1 text-base font-semibold text-ink" numberOfLines={1}>
              {item.referred?.full_name ?? "Creator"}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState
              icon="people-outline"
              title="No referrals yet"
              message="Share your code to start earning."
            />
          ) : null
        }
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
