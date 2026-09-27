import { useCallback, useRef, useState } from "react";
import { Alert, Platform, Pressable, RefreshControl, ScrollView, StatusBar, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../src/components/ui/Card";
import { Button } from "../src/components/ui/Button";
import { useAuthStore } from "../src/store/auth";
import { useMyInstagramRequest, useRequestInstagram } from "../src/api/instagramRequests";
import { useConnectYouTube, useRefreshYouTube } from "../src/api/youtubeVerify";
import { useConnectInstagram, useRefreshInstagram } from "../src/api/social";
import * as Clipboard from "expo-clipboard";
import { Linking } from "react-native";
import { colors } from "../src/lib/theme";
import { compactNumber, formatDate } from "../src/lib/format";

function InsightTile({
  icon,
  value,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
}) {
  return (
    <View className="w-1/3 p-1.5">
      <View className="items-center rounded-2xl bg-primary-50 px-1 py-3">
        <Ionicons name={icon} size={18} color={colors.primary} />
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          className="mt-1 w-full text-center text-lg font-extrabold text-ink"
        >
          {value}
        </Text>
        <Text numberOfLines={2} className="text-center text-[10px] text-ink-soft">{label}</Text>
      </View>
    </View>
  );
}

function InstagramConnectFlow() {
  const { data: request, refetch } = useMyInstagramRequest();
  const requestIg = useRequestInstagram();
  const connectIg = useConnectInstagram();
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const [username, setUsername] = useState(request?.instagram_username ?? "");

  const submitRequest = async () => {
    if (!username.trim()) {
      Alert.alert("Add your handle", "Enter your Instagram username first.");
      return;
    }
    try {
      const u = await requestIg.mutateAsync(username);
      await refetch();
      Alert.alert(
        "Request sent 🎉",
        `We'll add @${u} for verification. This can take up to 24 hours — you'll get a notification the moment you're ready to connect.`
      );
    } catch (e: any) {
      Alert.alert("Couldn't send request", e.message ?? "Please try again.");
    }
  };

  const connect = async () => {
    try {
      const res = await connectIg.mutateAsync();
      if (res.connected) {
        await refreshProfile();
        Alert.alert("Instagram connected", "Your insights are now syncing.");
      } else if (res.error && res.error !== "error") {
        Alert.alert("Not connected", "Connection was cancelled or failed. Please try again.");
      }
    } catch (e: any) {
      Alert.alert("Connection failed", e.message ?? "Please try again.");
    }
  };

  // Invited → creator can connect now.
  if (request?.status === "invited") {
    return (
      <View className="mt-3 items-center rounded-2xl bg-green-50 p-4">
        <Ionicons name="checkmark-circle" size={26} color={colors.success} />
        <Text className="mt-2 text-center text-sm font-semibold text-ink">You've been added! ✅</Text>
        <Text className="mt-1 text-center text-xs text-ink-soft">
          Tap Connect Instagram to verify @{request.instagram_username} and unlock your payouts.
        </Text>
        <View className="mt-3">
          <Button
            label={connectIg.isPending ? "Connecting…" : "Connect Instagram"}
            variant="dark"
            loading={connectIg.isPending}
            onPress={connect}
          />
        </View>
      </View>
    );
  }

  // Pending → waiting for admin to add them (up to 24h).
  if (request?.status === "pending") {
    return (
      <View className="mt-3 items-center rounded-2xl bg-primary-50 p-4">
        <Ionicons name="time-outline" size={26} color={colors.warning} />
        <Text className="mt-2 text-center text-sm font-semibold text-ink">Verification requested ⏳</Text>
        <Text className="mt-1 text-center text-xs text-ink-soft">
          We're adding @{request.instagram_username} for verification. This can take up to 24 hours —
          you'll get a notification the moment you're ready to connect.
        </Text>
      </View>
    );
  }

  // No request yet, or rejected → let them submit / re-submit.
  return (
    <View className="mt-3 rounded-2xl bg-primary-50 p-4">
      <View className="items-center">
        <Ionicons name="logo-instagram" size={26} color="#E1306C" />
        <Text className="mt-2 text-center text-sm font-semibold text-ink">
          Verify your Instagram to see insights
        </Text>
        <Text className="mt-1 text-center text-xs text-ink-soft">
          Enter your Instagram username to request verification. We'll add you within 24 hours and
          notify you when you can connect. Only verified creators can receive payouts.
        </Text>
      </View>

      {request?.status === "rejected" && request.admin_note ? (
        <View className="mt-3 flex-row items-start gap-2 rounded-xl bg-red-50 p-3">
          <Ionicons name="alert-circle-outline" size={16} color="#DC2626" style={{ marginTop: 1 }} />
          <Text className="flex-1 text-xs text-red-600">{request.admin_note}</Text>
        </View>
      ) : null}

      <View className="mt-3 flex-row items-center gap-2 rounded-2xl border border-primary-100 bg-white px-3">
        <Text className="text-base text-ink-muted">@</Text>
        <TextInput
          className="h-12 flex-1 text-base text-ink"
          placeholder="your.username"
          placeholderTextColor={colors.inkMuted}
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={setUsername}
        />
      </View>
      <View className="mt-3">
        <Button
          label={requestIg.isPending ? "Sending…" : "Request Verification"}
          variant="dark"
          fullWidth
          loading={requestIg.isPending}
          onPress={submitRequest}
        />
      </View>
    </View>
  );
}

function YouTubeConnectFlow({ onVerified }: { onVerified?: () => void }) {
  const connect = useConnectYouTube();
  const refreshProfile = useAuthStore((s) => s.refreshProfile);

  const signIn = async () => {
    try {
      const res = await connect.mutateAsync();
      if (res.connected) {
        await refreshProfile();
        onVerified?.();
        Alert.alert(
          "YouTube verified ✅",
          res.title ? `Verified ${res.title}. Your channel stats are now syncing.` : "Your channel is verified."
        );
      } else if (res.error) {
        Alert.alert("Not connected", "YouTube sign-in was cancelled or failed. Please try again.");
      }
    } catch (e: any) {
      Alert.alert("YouTube connection failed", e.message ?? "Please try again.");
    }
  };

  return (
    <View className="mt-3 rounded-2xl bg-primary-50 p-4">
      <View className="items-center">
        <Ionicons name="logo-youtube" size={26} color="#FF0000" />
        <Text className="mt-2 text-center text-sm font-semibold text-ink">Verify your YouTube channel</Text>
        <Text className="mt-1 text-center text-xs text-ink-soft">
          Sign in with the Google account that owns your channel. We'll securely confirm it's yours and pull your real
          subscriber count and stats — nothing is posted and you can disconnect anytime.
        </Text>
      </View>

      <View className="mt-3">
        <Button
          label={connect.isPending ? "Opening Google…" : "Sign in with Google"}
          variant="dark"
          fullWidth
          loading={connect.isPending}
          onPress={signIn}
        />
      </View>
    </View>
  );
}

export default function InsightsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useAuthStore((s) => s.profile);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const topPad = Math.max(insets.top, Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0) + 12;
  const [changingYouTube, setChangingYouTube] = useState(false);

  const igConnected = !!profile?.ig_insights_synced_at || !!profile?.instagram_connected_at;
  const ytConnected = !!profile?.youtube_verified || !!profile?.youtube_channel_id;

  // Keep the latest mutation triggers in refs so the focus/refresh callback
  // never captures a stale closure.
  const refreshYt = useRefreshYouTube();
  const refreshIg = useRefreshInstagram();
  const refreshYtRef = useRef(refreshYt);
  const refreshIgRef = useRef(refreshIg);
  refreshYtRef.current = refreshYt;
  refreshIgRef.current = refreshIg;

  const [refreshing, setRefreshing] = useState(false);
  const busyRef = useRef(false);

  const doRefresh = useCallback(async () => {
    if (busyRef.current) return;
    if (!igConnected && !ytConnected) return;
    busyRef.current = true;
    setRefreshing(true);
    try {
      const tasks: Promise<unknown>[] = [];
      if (ytConnected) tasks.push(refreshYtRef.current.mutateAsync().catch(() => undefined));
      if (igConnected) tasks.push(refreshIgRef.current.mutateAsync().catch(() => undefined));
      if (tasks.length) {
        await Promise.all(tasks);
        await refreshProfile();
      }
    } finally {
      setRefreshing(false);
      busyRef.current = false;
    }
  }, [igConnected, ytConnected, refreshProfile]);

  // Auto-refresh insights every time the screen comes into focus.
  useFocusEffect(
    useCallback(() => {
      doRefresh();
    }, [doRefresh])
  );

  return (
    <KeyboardAvoidingView
      behavior="padding"
      className="flex-1 bg-canvas"
    >
      <ScrollView
        className="flex-1 bg-canvas"
        contentContainerStyle={{ paddingBottom: insets.bottom + 120, paddingTop: topPad }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={doRefresh} tintColor={colors.primary} colors={[colors.primary]} />
        }
      >
      <View className="flex-row items-center gap-3 px-5 pb-4">
        <Pressable onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text className="text-xl font-bold text-ink">My Insights</Text>
        {(igConnected || ytConnected) ? (
          <Pressable onPress={doRefresh} disabled={refreshing} className="ml-auto p-1">
            <Ionicons name="refresh" size={22} color={refreshing ? colors.inkMuted : colors.primary} />
          </Pressable>
        ) : null}
      </View>

      {/* Instagram */}
      <Card className="mx-5 mt-1">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <Ionicons name="logo-instagram" size={18} color="#E1306C" />
            <Text className="text-base font-bold text-ink">Instagram</Text>
          </View>
          {profile?.ig_insights_synced_at ? (
            <Text className="text-[10px] text-ink-muted">Updated {formatDate(profile.ig_insights_synced_at)}</Text>
          ) : null}
        </View>

        {profile?.instagram_username ? (
          <Text className="mt-1 text-xs text-ink-soft">@{profile.instagram_username}</Text>
        ) : null}

        {igConnected ? (
          <View className="mt-3 flex-row flex-wrap">
            <InsightTile icon="people-outline" value={compactNumber(profile?.instagram_followers)} label="Followers" />
            <InsightTile
              icon="trending-up-outline"
              value={profile?.ig_engagement_rate != null ? `${profile.ig_engagement_rate}%` : "—"}
              label="Engagement"
            />
            <InsightTile icon="eye-outline" value={compactNumber(profile?.ig_reach)} label={"Avg\nReach"} />
            <InsightTile icon="heart-outline" value={compactNumber(profile?.ig_avg_likes)} label={"Avg\nLikes"} />
            <InsightTile icon="play-outline" value={compactNumber(profile?.ig_avg_views)} label={"Avg\nViews"} />
            <InsightTile icon="chatbubble-outline" value={compactNumber(profile?.ig_avg_comments)} label={"Avg\nComments"} />
          </View>
        ) : (
          <InstagramConnectFlow />
        )}
      </Card>

      {/* YouTube */}
      <Card className="mx-5 mt-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <Ionicons name="logo-youtube" size={18} color="#FF0000" />
            <Text className="text-base font-bold text-ink">YouTube</Text>
            {profile?.youtube_verified ? (
              <View className="flex-row items-center gap-0.5 rounded-full bg-green-50 px-1.5 py-0.5">
                <Ionicons name="checkmark-circle" size={10} color={colors.success} />
                <Text className="text-[9px] font-bold text-success">Verified</Text>
              </View>
            ) : null}
          </View>
          {profile?.yt_insights_synced_at ? (
            <Text className="text-[10px] text-ink-muted">Updated {formatDate(profile.yt_insights_synced_at)}</Text>
          ) : null}
        </View>

        {profile?.youtube_channel ? (
          <Text className="mt-1 text-xs text-ink-soft">{profile.youtube_channel}</Text>
        ) : null}

        {ytConnected && !changingYouTube ? (
          <>
            <View className="mt-3 flex-row flex-wrap">
              <InsightTile icon="people-outline" value={compactNumber(profile?.youtube_subscribers)} label="Subscribers" />
              <InsightTile icon="eye-outline" value={compactNumber(profile?.youtube_views)} label={"Total\nViews"} />
              <InsightTile icon="film-outline" value={compactNumber(profile?.youtube_video_count)} label="Videos" />
              <InsightTile icon="trending-up-outline" value={compactNumber(profile?.youtube_avg_views)} label={"Avg\nViews"} />
              <InsightTile icon="heart-outline" value={compactNumber(profile?.youtube_avg_likes)} label={"Avg\nLikes"} />
              <InsightTile
                icon="pulse-outline"
                value={profile?.youtube_engagement_rate != null ? `${profile.youtube_engagement_rate}%` : "—"}
                label="Engagement"
              />
            </View>
            <Pressable onPress={() => setChangingYouTube(true)} className="mt-3 items-center py-1">
              <Text className="text-xs font-semibold text-primary">Verify a different channel</Text>
            </Pressable>
          </>
        ) : (
          <>
            <YouTubeConnectFlow onVerified={() => setChangingYouTube(false)} />
            {ytConnected ? (
              <Pressable onPress={() => setChangingYouTube(false)} className="mt-2 items-center py-1">
                <Text className="text-xs font-semibold text-ink-muted">Cancel</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </Card>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}
