import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import * as Linking from "expo-linking";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../src/lib/supabase";
import { updatePassword } from "../../src/api/auth";
import { Input } from "../../src/components/ui/Input";
import { Button } from "../../src/components/ui/Button";
import { colors } from "../../src/lib/theme";

/**
 * Landing screen for the password-reset email link (`aaina://auth/reset`).
 * Supabase sends back either tokens in the URL hash (implicit flow) or a
 * `?code=` (PKCE). We establish the recovery session here, then let the user
 * set a new password.
 */
export default function ResetPassword() {
  const url = Linking.useURL();
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // A recovery session may also be delivered via the auth listener.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    (async () => {
      if (!url) return;
      try {
        const parsed = new URL(url);
        const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ""));
        const access_token = hashParams.get("access_token");
        const refresh_token = hashParams.get("refresh_token");

        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) throw error;
          setReady(true);
          return;
        }

        const code = parsed.searchParams.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          setReady(true);
          return;
        }

        const description =
          parsed.searchParams.get("error_description") ?? hashParams.get("error_description");
        if (description) setLinkError(description);
      } catch (e: any) {
        setLinkError(e.message ?? "This reset link is invalid or has expired.");
      }
    })();
  }, [url]);

  const onSave = async () => {
    if (password.length < 6) {
      Alert.alert("Weak password", "Use at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      Alert.alert("Passwords don't match", "Please re-enter the same password.");
      return;
    }
    setSaving(true);
    try {
      await updatePassword(password);
      Alert.alert("Password updated", "You can now use your new password.", [
        { text: "Continue", onPress: () => router.replace("/(tabs)") },
      ]);
    } catch (e: any) {
      Alert.alert("Couldn't update password", e.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (linkError) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: colors.canvas }}>
        <View className="h-16 w-16 items-center justify-center rounded-2xl bg-primary-100">
          <Ionicons name="alert-circle-outline" size={28} color={colors.primary} />
        </View>
        <Text className="mt-4 text-xl font-extrabold text-ink">Link expired</Text>
        <Text className="mt-2 text-center text-base text-ink-soft">{linkError}</Text>
        <View className="mt-6 w-full">
          <Button label="Request a new link" onPress={() => router.replace("/(auth)/forgot-password")} fullWidth />
        </View>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.canvas }}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text className="mt-4 text-base text-ink-soft">Verifying your reset link…</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: 56 }} className="bg-canvas">
      <Pressable onPress={() => router.replace("/(auth)/login")} className="mb-6 self-start">
        <Ionicons name="chevron-back" size={26} color={colors.ink} />
      </Pressable>

      <View className="items-center">
        <View className="h-16 w-16 items-center justify-center rounded-2xl bg-primary-100">
          <Ionicons name="lock-closed" size={28} color={colors.primary} />
        </View>
        <Text className="mt-4 text-3xl font-extrabold text-ink">Set a new password</Text>
        <Text className="mt-2 text-center text-base text-ink-soft">
          Choose a strong password you'll{"\n"}remember.
        </Text>
      </View>

      <View className="mt-8 gap-5">
        <Input
          label="New Password"
          icon="lock-closed-outline"
          placeholder="Enter new password"
          secure
          autoCapitalize="none"
          value={password}
          onChangeText={setPassword}
        />
        <Input
          label="Confirm Password"
          icon="lock-closed-outline"
          placeholder="Re-enter new password"
          secure
          autoCapitalize="none"
          value={confirm}
          onChangeText={setConfirm}
        />
        <Button label="Update Password" onPress={onSave} loading={saving} fullWidth />
      </View>
    </ScrollView>
  );
}
