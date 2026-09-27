import { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, Share, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../../src/components/ui/Card";
import { Avatar } from "../../src/components/Avatar";
import { useReferralDetail, useReferralRewards } from "../../src/api/referrals";
import { colors } from "../../src/lib/theme";
import { formatCurrency, formatDate } from "../../src/lib/format";

function TypeCard({
  icon, color, bg, title, rate, complete, inProcess,
}: {
  icon: keyof typeof Ionicons.glyphMap; color: string; bg: string;
  title: string; rate: string; complete: number; inProcess: number;
}) {
  return (
    <Card className="mx-5 mt-4">
      <View className="flex-row items-center gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-full" style={{ backgroundColor: bg }}>
          <Ionicons name={icon} size={20} color={color} />
        </View>
        <View className="flex-1">
          <Text className="text-base font-bold text-ink">{title}</Text>
          <Text className="text-xs text-ink-muted">Campaigns</Text>
        </View>
      </View>
      <View className="mt-3 self-start flex-row items-center gap-1 rounded-full px-3 py-1.5" style={{ backgroundColor: bg }}>
        <Text className="text-xs font-bold" style={{ color }}>{rate}</Text>
        <Text className="text-[11px]" style={{ color }}>per completed campaign</Text>
      </View>
      <View className="mt-3 h-px bg-primary-50" />
      <View className="mt-3 flex-row">
        <View className="flex-1 items-center">
          <Text className="text-xs font-semibold" style={{ color }}>Complete</Text>
          <Text className="text-2xl font-extrabold" style={{ color }}>{complete}</Text>
        </View>
        <View className="w-px bg-primary-50" />
        <View className="flex-1 items-center">
          <Text className="text-xs font-semibold text-warning">In Process</Text>
          <Text className="text-2xl font-extrabold text-warning">{inProcess}</Text>
        </View>
      </View>
    </Card>
  );
}

export default function ReferralDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, isLoading } = useReferralDetail(id!);
  const { data: rewards } = useReferralRewards();
  const [menuOpen, setMenuOpen] = useState(false);

  if (isLoading || !data) {
    return <View className="flex-1 items-center justify-center bg-canvas"><Text className="text-ink-muted">Loading…</Text></View>;
  }

  const { referral, breakdown, totalCompleted } = data;
  const p = referral.referred;
  const creatorId = `CRTR-${(p?.id ?? "").slice(0, 6).toUpperCase()}`;
  const refId = `REF-${(referral.referrer_id ?? "").slice(0, 5).toUpperCase()}`;

  const copy = async (text: string) => {
    await Clipboard.setStringAsync(text);
    Alert.alert("Copied");
  };

  const shareCreator = async () => {
    setMenuOpen(false);
    try {
      await Share.share({
        message: `${p?.full_name ?? "This creator"} on Bilkul\nCreator ID: ${creatorId}`,
      });
    } catch {
      // user dismissed the share sheet
    }
  };

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerStyle={{ paddingBottom: insets.bottom + 32, paddingTop: insets.top + 12 }} showsVerticalScrollIndicator={false}>
      <View className="flex-row items-center justify-between px-5 pb-4">
        <Pressable onPress={() => router.back()}><Ionicons name="chevron-back" size={26} color={colors.ink} /></Pressable>
        <Text className="text-xl font-bold text-ink">Referral Details</Text>
        <Pressable onPress={() => setMenuOpen(true)} hitSlop={10}>
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.ink} />
        </Pressable>
      </View>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable className="flex-1" onPress={() => setMenuOpen(false)}>
          <View
            className="absolute right-5 w-56 rounded-2xl border border-primary-100 bg-white py-1"
            style={{ top: insets.top + 44, elevation: 6 }}
          >
            <Pressable onPress={() => { setMenuOpen(false); copy(creatorId); }} className="flex-row items-center gap-3 px-4 py-3">
              <Ionicons name="copy-outline" size={18} color={colors.ink} />
              <Text className="text-sm font-semibold text-ink">Copy Creator ID</Text>
            </Pressable>
            <View className="mx-4 h-px bg-primary-50" />
            <Pressable onPress={() => { setMenuOpen(false); copy(refId); }} className="flex-row items-center gap-3 px-4 py-3">
              <Ionicons name="pricetag-outline" size={18} color={colors.ink} />
              <Text className="text-sm font-semibold text-ink">Copy Referral ID</Text>
            </Pressable>
            <View className="mx-4 h-px bg-primary-50" />
            <Pressable onPress={shareCreator} className="flex-row items-center gap-3 px-4 py-3">
              <Ionicons name="share-social-outline" size={18} color={colors.ink} />
              <Text className="text-sm font-semibold text-ink">Share creator</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <View className="flex-row items-center gap-3 px-5">
        <Avatar name={p?.full_name} uri={p?.profile_image} size={64} />
        <View className="flex-1">
          <Text className="text-xl font-extrabold text-ink">{p?.full_name ?? "Creator"}</Text>
          <Pressable onPress={() => copy(creatorId)} className="mt-0.5 flex-row items-center gap-1.5">
            <Text className="text-xs text-ink-soft">Creator ID: {creatorId}</Text>
            <Ionicons name="copy-outline" size={12} color={colors.inkMuted} />
          </Pressable>
          <View className="mt-1 flex-row items-center gap-1">
            <Ionicons name="calendar-outline" size={12} color={colors.inkMuted} />
            <Text className="text-xs text-ink-muted">Joined on {formatDate(p?.created_at)}</Text>
          </View>
        </View>
      </View>

      <Card className="mx-5 mt-4">
        <View className="flex-row">
          <View className="flex-1 flex-row items-center gap-3 pr-3">
            <View className="h-11 w-11 items-center justify-center rounded-full bg-primary-100">
              <Ionicons name="wallet-outline" size={20} color={colors.primary} />
            </View>
            <View className="flex-1">
              <Text className="text-xs text-ink-muted">Total Earning</Text>
              <Text className="text-lg font-extrabold text-ink">{formatCurrency(referral.commission_earned)}</Text>
              <Text className="text-[10px] text-ink-muted">From Completed Campaigns</Text>
            </View>
          </View>
          <View className="w-px bg-primary-50" />
          <View className="flex-1 flex-row items-center gap-3 pl-3">
            <View className="h-11 w-11 items-center justify-center rounded-full bg-primary-100">
              <Ionicons name="checkmark-done-outline" size={20} color={colors.primary} />
            </View>
            <View className="flex-1">
              <Text className="text-xs text-ink-muted">Total Completed</Text>
              <Text className="text-lg font-extrabold text-ink">{totalCompleted}</Text>
              <Text className="text-[10px] text-ink-muted">Across All Types</Text>
            </View>
          </View>
        </View>
      </Card>

      <TypeCard icon="wallet-outline" color="#1BA672" bg="#E6F6EF" title="Reimbursement" rate={formatCurrency(rewards?.reimbursement ?? 20)} complete={breakdown.reimbursement.complete} inProcess={breakdown.reimbursement.inProcess} />
      <TypeCard icon="cash-outline" color="#5B6EF5" bg="#EAECFE" title="Paid" rate={formatCurrency(rewards?.paid ?? 100)} complete={breakdown.paid.complete} inProcess={breakdown.paid.inProcess} />
      <TypeCard icon="gift-outline" color="#E4870B" bg="#FDF0DD" title="Barter" rate={formatCurrency(rewards?.barter ?? 50)} complete={breakdown.barter.complete} inProcess={breakdown.barter.inProcess} />

      <View className="mx-5 mt-5 flex-row items-center gap-3 rounded-2xl bg-primary-100 p-4">
        <View className="h-11 w-11 items-center justify-center rounded-full bg-white">
          <Ionicons name="megaphone-outline" size={20} color={colors.primary} />
        </View>
        <View className="flex-1">
          <Text className="text-sm font-bold text-ink">Refer more friends to get paid more!</Text>
          <Text className="text-xs text-ink-soft">The more creators you refer, the more you earn.</Text>
        </View>
      </View>

      <Pressable onPress={() => copy(refId)} className="mx-5 mt-3 items-center rounded-2xl bg-primary-50 p-4">
        <Text className="text-xs text-ink-muted">Referral ID</Text>
        <View className="flex-row items-center gap-2">
          <Text className="text-base font-extrabold text-ink">{refId}</Text>
          <Ionicons name="copy-outline" size={14} color={colors.primary} />
        </View>
      </Pressable>
    </ScrollView>
  );
}
