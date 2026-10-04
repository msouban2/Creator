import { useEffect, useState } from "react";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "../../src/components/ui/Button";
import { Input } from "../../src/components/ui/Input";
import { NichePicker } from "../../src/components/NichePicker";
import { useCompleteSocialProfile } from "../../src/api/profile";
import { clearPendingReferralCode, getPendingReferralCode } from "../../src/lib/referral";
import { colors } from "../../src/lib/theme";

export default function CompleteProfileScreen() {
  const router = useRouter();
  const completeProfile = useCompleteSocialProfile();
  const [niches, setNiches] = useState<string[]>([]);
  const [referralCode, setReferralCode] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void getPendingReferralCode().then((code) => {
      if (code) setReferralCode(code);
    });
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const previousOverflow = document.body.style.overflowY;
    document.body.style.overflowY = "auto";
    return () => {
      document.body.style.overflowY = previousOverflow;
    };
  }, []);

  const onContinue = async () => {
    if (niches.length === 0) {
      setError("Choose at least one content niche to continue.");
      return;
    }
    setError("");
    try {
      await completeProfile.mutateAsync({
        niches,
        referralCode: referralCode.trim().toUpperCase(),
      });
      await clearPendingReferralCode();
    } catch (e: any) {
      setError(e.message ?? "Could not save your profile. Please try again.");
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-canvas">
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24, paddingTop: 56, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={() => router.back()} className="mb-4 self-start">
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>

        <View className="items-center">
          <View className="h-16 w-16 items-center justify-center rounded-2xl bg-primary-100">
            <Ionicons name="person-circle-outline" size={30} color={colors.primary} />
          </View>
          <Text className="mt-4 text-3xl font-extrabold text-ink">Complete your profile</Text>
          <Text className="mt-2 text-center text-base text-ink-soft">
            Choose your content niches so brands can find the right match.
          </Text>
        </View>

        <View className="mt-6 gap-5 rounded-3xl bg-white p-6" style={{ shadowColor: "#E36E86", shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 3 }}>
          <NichePicker
            hint="Choose at least one. You can select up to three."
            value={niches}
            onChange={setNiches}
          />
          <Input
            label="Referral Code (optional)"
            icon="ticket-outline"
            placeholder="Enter referral code"
            autoCapitalize="characters"
            value={referralCode}
            onChangeText={(value) => setReferralCode(value.toUpperCase())}
          />
          {error ? (
            <Text accessibilityRole="alert" className="text-sm font-semibold text-red-700">
              {error}
            </Text>
          ) : null}
          <Button
            label="Continue"
            onPress={onContinue}
            loading={completeProfile.isPending}
            disabled={niches.length === 0 || completeProfile.isPending}
            fullWidth
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
