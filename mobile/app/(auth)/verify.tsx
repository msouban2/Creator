import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View, Alert } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Input } from "../../src/components/ui/Input";
import { Button } from "../../src/components/ui/Button";
import { verifyEmailOtp, resendSignupOtp } from "../../src/api/auth";
import { colors } from "../../src/lib/theme";

const RESEND_COOLDOWN = 30;

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email?: string }>();
  const address = (email ?? "").trim();

  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timer.current = setInterval(() => {
      setCooldown((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const onVerify = async () => {
    if (code.trim().length < 6) {
      Alert.alert("Enter the code", "Please enter the 6-digit code we emailed you.");
      return;
    }
    setVerifying(true);
    try {
      await verifyEmailOtp(address, code.trim());
      // A session is now set — the auth gate routes into the app automatically.
    } catch (e: any) {
      Alert.alert("Verification failed", e.message ?? "That code is invalid or expired.");
    } finally {
      setVerifying(false);
    }
  };

  const onResend = async () => {
    if (cooldown > 0) return;
    setResending(true);
    try {
      await resendSignupOtp(address);
      setCooldown(RESEND_COOLDOWN);
      Alert.alert("Code sent", "We've emailed you a new 6-digit code.");
    } catch (e: any) {
      Alert.alert("Couldn't resend", e.message ?? "Please try again in a moment.");
    } finally {
      setResending(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-canvas">
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}>
        <Pressable onPress={() => router.back()} className="mb-4 self-start">
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>

        <View className="items-center">
          <View className="h-16 w-16 items-center justify-center rounded-2xl bg-primary-100">
            <Ionicons name="mail-open-outline" size={30} color={colors.primary} />
          </View>
          <Text className="mt-4 text-3xl font-extrabold text-ink">Verify your email</Text>
          <Text className="mt-2 text-center text-base text-ink-soft">
            Enter the 6-digit code we sent to{"\n"}
            <Text className="font-bold text-ink">{address || "your email"}</Text>
          </Text>
        </View>

        <View
          className="mt-8 gap-5 rounded-3xl bg-white p-6"
          style={{ shadowColor: "#E36E86", shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 3 }}
        >
          <Input
            label="Verification Code"
            icon="keypad-outline"
            placeholder="Enter 6-digit code"
            keyboardType="number-pad"
            maxLength={6}
            value={code}
            onChangeText={(t) => setCode(t.replace(/[^0-9]/g, ""))}
          />

          <Button label="Verify" onPress={onVerify} loading={verifying} fullWidth />

          <View className="flex-row items-center justify-center gap-1">
            <Text className="text-sm text-ink-soft">Didn't get the code?</Text>
            <Pressable onPress={onResend} disabled={cooldown > 0 || resending}>
              <Text className={`text-sm font-bold ${cooldown > 0 ? "text-ink-muted" : "text-primary"}`}>
                {cooldown > 0 ? `Resend in ${cooldown}s` : resending ? "Sending…" : "Resend"}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
