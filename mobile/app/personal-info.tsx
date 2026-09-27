import { useState } from "react";
import { Alert, Image, Pressable, ScrollView, Text, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import type { Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { Input } from "../src/components/ui/Input";
import { Button } from "../src/components/ui/Button";
import { Avatar } from "../src/components/Avatar";
import { NichePicker } from "../src/components/NichePicker";
import { useUpdateProfile, useUploadAvatar } from "../src/api/profile";
import { useAuthStore } from "../src/store/auth";
import { colors } from "../src/lib/theme";
import type { Profile } from "../src/lib/types";

export default function PersonalInfoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useAuthStore((s) => s.profile);
  const update = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const igConnected = !!profile?.instagram_connected_at;
  const ytVerified = !!profile?.youtube_verified;

  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [instaUser, setInstaUser] = useState(profile?.instagram_username ?? "");
  const [instaFollowers, setInstaFollowers] = useState(String(profile?.instagram_followers ?? 0));
  const [ytChannel, setYtChannel] = useState(profile?.youtube_channel ?? "");
  const [ytSubs, setYtSubs] = useState(String(profile?.youtube_subscribers ?? 0));
  const [amazonUrl, setAmazonUrl] = useState(profile?.amazon_profile_url ?? "");
  const [niches, setNiches] = useState<string[]>(profile?.niches ?? []);

  const onSave = async () => {
    try {
      const payload: Partial<Profile> = {
        full_name: fullName,
        phone,
        amazon_profile_url: amazonUrl.trim() || null,
        niches,
      };
      // Instagram + YouTube are fully managed by their connect/verify flows in
      // Insights — never written from here.
      await update.mutateAsync(payload);
      Alert.alert("Saved", "Your profile has been updated.");
      router.back();
    } catch (e: any) {
      Alert.alert("Failed", e.message ?? "Try again.");
    }
  };

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Please allow photo access to change your picture.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;
    try {
      await uploadAvatar.mutateAsync(result.assets[0].uri);
    } catch (e: any) {
      Alert.alert("Upload failed", e.message ?? "Please try again.");
    }
  };

  return (
    <KeyboardAvoidingView
      behavior="padding"
      className="flex-1 bg-canvas"
    >
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerStyle={{ paddingBottom: insets.bottom + 120, paddingTop: insets.top + 12 }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    >
      <View className="flex-row items-center gap-3 px-5 pb-4">
        <Pressable onPress={() => router.back()}><Ionicons name="chevron-back" size={26} color={colors.ink} /></Pressable>
        <Text className="text-xl font-bold text-ink">Personal Information</Text>
      </View>

      {/* Profile picture */}
      <View className="mb-5 items-center">
        <Pressable onPress={pickAvatar} disabled={uploadAvatar.isPending}>
          <Avatar uri={profile?.profile_image} name={profile?.full_name} size={96} />
          <View className="absolute bottom-0 right-0 h-8 w-8 items-center justify-center rounded-full border-2 border-canvas bg-ink">
            <Ionicons name={uploadAvatar.isPending ? "hourglass-outline" : "camera"} size={15} color="#fff" />
          </View>
        </Pressable>
        <Pressable onPress={pickAvatar} disabled={uploadAvatar.isPending}>
          <Text className="mt-2 text-sm font-semibold text-primary">
            {uploadAvatar.isPending ? "Uploading…" : "Change profile picture"}
          </Text>
        </Pressable>
      </View>

      <View className="gap-4 px-5">
        <Input label="Full Name" icon="person-outline" value={fullName} onChangeText={setFullName} />
        <Input label="Mobile Number" icon="call-outline" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
        <Input label="Email" icon="mail-outline" value={profile?.email ?? ""} editable={false} />

        {igConnected ? (
          <>
            <Input label="Instagram Username" icon="lock-closed" value={instaUser ? `@${instaUser}` : ""} editable={false} />
            <Input
              label="Instagram Followers (verified)"
              icon="lock-closed"
              keyboardType="number-pad"
              value={instaFollowers}
              editable={false}
            />
            <View className="-mt-2 flex-row items-center gap-1.5">
              <Ionicons name="checkmark-circle" size={15} color={colors.success} />
              <Text className="text-xs font-semibold text-ink-soft">
                Connected — your followers are pulled from Instagram and can’t be edited.
              </Text>
            </View>
          </>
        ) : (
          <View className="rounded-2xl border border-primary-100 bg-primary-50 p-4">
            <View className="flex-row items-center gap-2">
              <Ionicons name="logo-instagram" size={18} color="#E1306C" />
              <Text className="text-sm font-bold text-ink">Connect your Instagram</Text>
            </View>
            <Text className="mt-1 text-xs text-ink-soft">
              Connect from Insights to show verified, auto-updating followers here.
            </Text>
            <View className="mt-3">
              <Button
                label="Connect Instagram"
                variant="dark"
                fullWidth
                onPress={() => router.push("/insights" as Href)}
                leftIcon={<Ionicons name="logo-instagram" size={16} color="#fff" />}
              />
            </View>
          </View>
        )}

        {ytVerified ? (
          <>
            <Input
              label="YouTube Channel (verified)"
              icon="lock-closed"
              value={profile?.youtube_channel_title ?? profile?.youtube_channel ?? ytChannel}
              editable={false}
            />
            <Input
              label="YouTube Subscribers (verified)"
              icon="lock-closed"
              keyboardType="number-pad"
              value={ytSubs}
              editable={false}
            />
            <View className="-mt-2 flex-row items-center gap-1.5">
              <Ionicons name="checkmark-circle" size={15} color={colors.success} />
              <Text className="text-xs font-semibold text-ink-soft">
                Verified — your subscriber count is pulled from YouTube and can’t be edited.
              </Text>
            </View>
            <Button
              label="Change YouTube channel"
              variant="soft"
              fullWidth
              onPress={() => router.push("/insights" as Href)}
              leftIcon={<Ionicons name="logo-youtube" size={16} color={colors.primary} />}
            />
            <Text className="-mt-2 text-xs text-ink-muted">
              To connect a different channel, verify it again from Insights (same paste-a-code process).
            </Text>
          </>
        ) : (
          <View className="rounded-2xl border border-primary-100 bg-primary-50 p-4">
            <View className="flex-row items-center gap-2">
              <Ionicons name="logo-youtube" size={18} color="#FF0000" />
              <Text className="text-sm font-bold text-ink">Verify your YouTube channel</Text>
            </View>
            <Text className="mt-1 text-xs text-ink-soft">
              Verify from Insights to show a real, locked subscriber count that updates automatically.
            </Text>
            <View className="mt-3">
              <Button
                label="Verify YouTube channel"
                variant="dark"
                fullWidth
                onPress={() => router.push("/insights" as Href)}
                leftIcon={<Ionicons name="logo-youtube" size={16} color="#fff" />}
              />
            </View>
          </View>
        )}

        <Input
          label="Amazon Profile Link"
          icon="logo-amazon"
          autoCapitalize="none"
          keyboardType="url"
          value={amazonUrl}
          onChangeText={setAmazonUrl}
          placeholder="https://www.amazon.in/shop/yourprofile"
        />

        {(profile?.niches_change_count ?? 0) >= 3 ? (
          <View className="gap-2">
            <Text className="text-sm font-semibold text-ink">Content Niches</Text>
            <View className="flex-row flex-wrap gap-2">
              {(profile?.niches ?? []).map((n) => (
                <View key={n} className="rounded-full bg-primary-100 px-3 py-2">
                  <Text className="text-sm font-semibold text-primary">{n}</Text>
                </View>
              ))}
            </View>
            <Text className="text-xs text-ink-muted">
              You've used all 3 niche changes — these are locked now.
            </Text>
          </View>
        ) : (
          <View className="gap-1">
            <NichePicker
              hint="The categories your content belongs to. Shown to brands reviewing your applications."
              value={niches}
              onChange={setNiches}
            />
            <Text className="text-xs font-semibold text-primary">
              {Math.max(0, 3 - (profile?.niches_change_count ?? 0))} niche change
              {3 - (profile?.niches_change_count ?? 0) === 1 ? "" : "s"} left.
            </Text>
          </View>
        )}

        <Button label="Save Changes" onPress={onSave} loading={update.isPending} variant="dark" fullWidth />
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}
