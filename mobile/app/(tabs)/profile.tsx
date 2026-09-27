import { Alert, Platform, Pressable, ScrollView, StatusBar, Text, View } from "react-native";
import { useCallback, useEffect, useState } from "react";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Avatar } from "../../src/components/Avatar";
import { Card } from "../../src/components/ui/Card";
import { NichePicker } from "../../src/components/NichePicker";
import { useAuthStore } from "../../src/store/auth";
import { useProfileStats, useUpdateProfile } from "../../src/api/profile";
import { colors } from "../../src/lib/theme";
import { compactNumber, formatCurrency } from "../../src/lib/format";

function Stat({ icon, value, label }: { icon: keyof typeof Ionicons.glyphMap; value: string | number; label: string }) {
  return (
    <View className="flex-row items-center gap-2">
      <View className="h-9 w-9 items-center justify-center rounded-full bg-white/70">
        <Ionicons name={icon} size={16} color={colors.primary} />
      </View>
      <View>
        <Text className="text-base font-extrabold text-ink">{value}</Text>
        <Text className="text-[10px] text-ink-soft">{label}</Text>
      </View>
    </View>
  );
}

function MenuItem({
  icon, label, onPress, badge,
}: {
  icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; badge?: React.ReactNode;
}) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-3 py-4">
      <View className="h-11 w-11 items-center justify-center rounded-full bg-primary-100">
        <Ionicons name={icon} size={20} color={colors.ink} />
      </View>
      <Text className="flex-1 text-base font-semibold text-ink">{label}</Text>
      {badge}
      <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useAuthStore((s) => s.profile);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const signOut = useAuthStore((s) => s.signOut);
  const { data: stats, refetch: refetchStats } = useProfileStats();
  const topPad = Math.max(insets.top, Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0) + 12;

  // Keep earnings/stats current when returning to this screen (e.g. after a
  // payment is released to the wallet).
  useFocusEffect(
    useCallback(() => {
      refreshProfile();
      refetchStats();
    }, [refreshProfile, refetchStats])
  );

  const creatorId = `CRTR-${(profile?.id ?? "").slice(0, 6).toUpperCase()}`;

  // Content niches — editable inline from the profile screen, but only up to
  // NICHE_CHANGE_LIMIT changes total (then locked). The count is stamped
  // server-side; staff bypass.
  const NICHE_CHANGE_LIMIT = 3;
  const updateProfile = useUpdateProfile();
  const [niches, setNiches] = useState<string[]>(profile?.niches ?? []);
  const [editingNiches, setEditingNiches] = useState(false);
  const nicheChangesUsed = profile?.niches_change_count ?? 0;
  const nicheChangesLeft = Math.max(0, NICHE_CHANGE_LIMIT - nicheChangesUsed);
  const nichesLocked = nicheChangesLeft <= 0;
  // Keep local selection in sync when the profile loads/refreshes (unless the
  // user is mid-edit).
  useEffect(() => {
    if (!editingNiches) setNiches(profile?.niches ?? []);
  }, [profile?.niches, editingNiches]);

  const saveNiches = async () => {
    // No-op if unchanged — avoids burning a change.
    const unchanged =
      niches.length === (profile?.niches?.length ?? 0) &&
      niches.every((n) => profile?.niches?.includes(n));
    if (unchanged) {
      setEditingNiches(false);
      return;
    }
    try {
      await updateProfile.mutateAsync({ niches });
      await refreshProfile();
      setEditingNiches(false);
      const leftAfter = nicheChangesLeft - 1;
      Alert.alert(
        "Saved",
        leftAfter > 0
          ? `Your content niches have been updated. You can change them ${leftAfter} more time${leftAfter === 1 ? "" : "s"}.`
          : "Your content niches have been updated. This was your last change — they're now locked."
      );
    } catch (e: any) {
      const msg = /NICHES_LOCKED/.test(e?.message ?? "")
        ? "You've used all 3 niche changes, so they're locked now."
        : e?.message ?? "Please try again.";
      Alert.alert("Couldn't update", msg);
    }
  };

  const copyId = async () => {
    await Clipboard.setStringAsync(creatorId);
    Alert.alert("Copied", "Creator ID copied to clipboard.");
  };

  const onLogout = () => {
    // Alert.alert's button callbacks don't fire on react-native-web, so use the
    // browser confirm there and the native alert on iOS/Android.
    if (Platform.OS === "web") {
      const ok = typeof window !== "undefined" ? window.confirm("Are you sure you want to logout?") : true;
      if (ok) signOut();
      return;
    }
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      { text: "Logout", style: "destructive", onPress: () => signOut() },
    ]);
  };

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView
        className="flex-1 bg-canvas"
        contentContainerStyle={{ paddingBottom: 140, paddingTop: topPad }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center justify-between px-5 pb-3">
          <Pressable onPress={() => router.back()}><Ionicons name="chevron-back" size={26} color={colors.ink} /></Pressable>
          <Text className="text-xl font-bold text-ink">Profile</Text>
          <Pressable onPress={() => router.push("/notifications")}>
            <Ionicons name="notifications-outline" size={24} color={colors.ink} />
          </Pressable>
        </View>

      {/* Lifetime earnings */}
      <LinearGradient
        colors={["#FADFE5", "#F6B6C1"]}
        style={{ borderRadius: 24, marginHorizontal: 20, overflow: "hidden" }}
      >
        <Pressable onPress={() => router.push("/wallet")} className="p-5">
          <Text className="text-sm text-ink-soft">Total Life Time Earnings</Text>
          <View className="flex-row items-center gap-1">
            <Text className="text-4xl font-extrabold text-ink">{formatCurrency(profile?.total_earnings)}</Text>
            <Ionicons name="chevron-forward" size={22} color={colors.primary} />
          </View>
          <View className="mt-4 flex-row justify-between">
            <Stat icon="checkmark-done-outline" value={stats?.completed ?? 0} label={"Completed\nCampaigns"} />
            <Stat icon="sync-outline" value={stats?.ongoing ?? 0} label={"Ongoing\nCampaigns"} />
            <Stat icon="people-outline" value={stats?.referrals ?? 0} label={"Total\nReferrals"} />
          </View>
        </Pressable>
      </LinearGradient>

      {/* Profile card */}
      <Card className="mx-5 mt-4">
        <View className="flex-row items-center gap-4">
          <Avatar uri={profile?.profile_image} name={profile?.full_name} size={72} />
          <View className="flex-1">
            <Text className="text-xl font-extrabold text-ink">{profile?.full_name ?? "Creator"}</Text>
            <Pressable onPress={copyId} className="mt-1 flex-row items-center gap-1.5 self-start rounded-full bg-primary-100 px-2.5 py-1">
              <Text className="text-xs font-semibold text-primary">Creator ID: {creatorId}</Text>
              <Ionicons name="copy-outline" size={13} color={colors.primary} />
            </Pressable>
            <View className="mt-2 flex-row flex-wrap items-center gap-x-3 gap-y-1.5">
              <View className="flex-row items-center gap-1.5">
                <Ionicons name="logo-instagram" size={16} color="#E1306C" />
                <Text className="text-sm font-bold text-ink">{compactNumber(profile?.instagram_followers)}</Text>
                <Text className="text-[10px] text-ink-muted">Followers</Text>
              </View>
              <View className="h-5 w-px bg-primary-100" />
              <View className="flex-row items-center gap-1.5">
                <Ionicons name="logo-youtube" size={16} color="#FF0000" />
                <Text className="text-sm font-bold text-ink">{compactNumber(profile?.youtube_subscribers)}</Text>
                <Text className="text-[10px] text-ink-muted">Subscribers</Text>
              </View>
            </View>
          </View>
          <Pressable onPress={() => router.push("/personal-info")}>
            <Ionicons name="chevron-forward" size={20} color={colors.inkMuted} />
          </Pressable>
        </View>
      </Card>

      {/* Content Niches */}
      <Card className="mx-5 mt-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <Ionicons name="pricetags-outline" size={18} color={colors.primary} />
            <Text className="text-base font-bold text-ink">Content Niches</Text>
          </View>
          {editingNiches ? (
            <Pressable onPress={() => { setEditingNiches(false); setNiches(profile?.niches ?? []); }}>
              <Text className="text-sm font-semibold text-ink-muted">Cancel</Text>
            </Pressable>
          ) : nichesLocked ? (
            <View className="flex-row items-center gap-1 rounded-full bg-primary-50 px-2 py-1">
              <Ionicons name="lock-closed" size={13} color={colors.inkMuted} />
              <Text className="text-xs font-semibold text-ink-muted">Locked</Text>
            </View>
          ) : (
            <Pressable onPress={() => setEditingNiches(true)} className="flex-row items-center gap-1">
              <Ionicons name="create-outline" size={16} color={colors.primary} />
              <Text className="text-sm font-bold text-primary">{niches.length ? "Edit" : "Add"}</Text>
            </Pressable>
          )}
        </View>

        {editingNiches ? (
          <View className="mt-3">
            <NichePicker
              label=""
              hint="Pick the kinds of content you create so brands can match you."
              value={niches}
              onChange={setNiches}
            />
            <Text className="mt-2 text-xs font-semibold text-primary">
              {nicheChangesLeft} change{nicheChangesLeft === 1 ? "" : "s"} left — this counts as one.
            </Text>
            <Pressable
              onPress={saveNiches}
              disabled={updateProfile.isPending}
              className="mt-3 items-center rounded-2xl bg-ink py-3.5"
            >
              <Text className="text-sm font-bold text-white">
                {updateProfile.isPending ? "Saving…" : "Save Niches"}
              </Text>
            </Pressable>
          </View>
        ) : niches.length ? (
          <View className="mt-3">
            <View className="flex-row flex-wrap gap-2">
              {niches.map((n) => (
                <View key={n} className="rounded-full bg-primary-100 px-3 py-1.5">
                  <Text className="text-xs font-semibold text-primary">{n}</Text>
                </View>
              ))}
            </View>
            <Text className="mt-2 text-[11px] text-ink-muted">
              {nichesLocked
                ? "You've used all 3 niche changes — these are now locked."
                : `You can change your niches ${nicheChangesLeft} more time${nicheChangesLeft === 1 ? "" : "s"}.`}
            </Text>
          </View>
        ) : (
          <Text className="mt-2 text-xs text-ink-muted">
            {nichesLocked
              ? "Niche changes are locked."
              : "No niches yet. Tap Add to tell brands what content you create."}
          </Text>
        )}
      </Card>

      {/* Insights entry */}
      <Pressable onPress={() => router.push("/insights" as Href)}>
        <Card className="mx-5 mt-4">
          <View className="flex-row items-center gap-3">
            <View className="h-11 w-11 items-center justify-center rounded-full bg-primary-100">
              <Ionicons name="stats-chart-outline" size={20} color={colors.ink} />
            </View>
            <View className="flex-1">
              <Text className="text-base font-bold text-ink">My Insights</Text>
              <Text className="text-xs text-ink-muted">Instagram & YouTube stats</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.inkMuted} />
          </View>
        </Card>
      </Pressable>

      {/* Menu */}
      <Card className="mx-5 mt-4 py-1">
        <MenuItem icon="wallet-outline" label="Wallet" onPress={() => router.push("/wallet")} />
        <View className="h-px bg-primary-50" />
        <MenuItem
          icon="shield-checkmark-outline"
          label="KYC Verification"
          onPress={() => router.push("/kyc")}
          badge={
            profile?.kyc_status === "verified" ? (
              <View className="flex-row items-center gap-1 rounded-full bg-green-50 px-2 py-1">
                <Ionicons name="checkmark-circle" size={13} color={colors.success} />
                <Text className="text-xs font-semibold text-success">Verified</Text>
              </View>
            ) : undefined
          }
        />
        <View className="h-px bg-primary-50" />
        <MenuItem icon="person-outline" label="Personal Information" onPress={() => router.push("/personal-info")} />
        <View className="h-px bg-primary-50" />
        <MenuItem icon="location-outline" label="Address" onPress={() => router.push("/address")} />
      </Card>

      <Pressable onPress={onLogout} className="mx-5 mt-4 flex-row items-center justify-center gap-2 rounded-2xl bg-primary-100 py-4">
          <Ionicons name="log-out-outline" size={20} color={colors.primary} />
          <Text className="text-base font-bold text-primary">Logout</Text>
        </Pressable>
      </ScrollView>

      {/* Opaque status-bar cover so scrolled content doesn't bleed under it */}
      <View
        pointerEvents="none"
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: insets.top, backgroundColor: colors.canvas }}
      />
    </View>
  );
}
