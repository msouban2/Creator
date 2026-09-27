import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View, Alert } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { Input } from "../../src/components/ui/Input";
import { Button } from "../../src/components/ui/Button";
import { sendPhoneOtp, resendPhoneOtp, verifyPhoneOtp } from "../../src/api/phone";
import { useAuthStore } from "../../src/store/auth";
import { colors } from "../../src/lib/theme";

const RESEND_COOLDOWN = 30;

// Strip a stored "+91XXXXXXXXXX" (or similar) down to the bare 10 digits.
function toLocal(phone?: string | null): string {
  const digits = (phone ?? "").replace(/[^0-9]/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export default function VerifyPhoneScreen() {
  const profile = useAuthStore((s) => s.profile);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const signOut = useAuthStore((s) => s.signOut);

  const [phone, setPhone] = useState(() => toLocal(profile?.phone));
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timer.current = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const onSend = async () => {
    if (phone.trim().length !== 10) {
      Alert.alert("Enter your number", "Please enter your 10-digit mobile number.");
      return;
    }
    setSending(true);
    try {
      await sendPhoneOtp(phone.trim());
      setSent(true);
      setCooldown(RESEND_COOLDOWN);
    } catch (e: any) {
      Alert.alert("Couldn't send code", e.message ?? "Please try again.");
    } finally {
      setSending(false);
    }
  };

  const onResend = async () => {
    if (cooldown > 0) return;
    setSending(true);
    try {
      await resendPhoneOtp(phone.trim());
      setCooldown(RESEND_COOLDOWN);
      Alert.alert("Code sent", "We've texted you a new code.");
    } catch (e: any) {
      Alert.alert("Couldn't resend", e.message ?? "Please try again.");
    } finally {
      setSending(false);
    }
  };

  const onVerify = async () => {
    if (code.trim().length < 4) {
      Alert.alert("Enter the code", "Please enter the code we texted you.");
      return;
    }
    setVerifying(true);
    try {
      await verifyPhoneOtp(phone.trim(), code.trim());
      await refreshProfile(); // phone_verified flips true → the gate lets them in
    } catch (e: any) {
      Alert.alert("Verification failed", e.message ?? "That code is invalid or expired.");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-canvas">
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}>
        <View className="items-center">
          <View className="h-16 w-16 items-center justify-center rounded-2xl bg-primary-100">
            <Ionicons name="chatbox-ellipses-outline" size={30} color={colors.primary} />
          </View>
          <Text className="mt-4 text-3xl font-extrabold text-ink">Verify your mobile</Text>
          <Text className="mt-2 text-center text-base text-ink-soft">
            {sent
              ? "Enter the 6-digit code we texted to your number."
              : "We'll text you a 6-digit code to confirm your number."}
          </Text>
        </View>

        <View
          className="mt-8 gap-5 rounded-3xl bg-white p-6"
          style={{ shadowColor: "#E36E86", shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 3 }}
        >
          <Input
            label="Mobile Number"
            icon="call-outline"
            placeholder="10-digit mobile number"
            keyboardType="number-pad"
            maxLength={10}
            value={phone}
            editable={!sent}
            onChangeText={(t) => setPhone(t.replace(/[^0-9]/g, ""))}
          />

          {!sent ? (
            <Button label="Send Code" onPress={onSend} loading={sending} fullWidth />
          ) : (
            <>
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

              <View className="flex-row items-center justify-center gap-3">
                <Pressable onPress={() => { setSent(false); setCode(""); }}>
                  <Text className="text-sm font-semibold text-ink-soft">Change number</Text>
                </Pressable>
                <Text className="text-ink-muted">·</Text>
                <Pressable onPress={onResend} disabled={cooldown > 0 || sending}>
                  <Text className={`text-sm font-bold ${cooldown > 0 ? "text-ink-muted" : "text-primary"}`}>
                    {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend"}
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </View>

        <View className="mt-6 flex-row items-center justify-center">
          <Pressable onPress={() => void signOut()}>
            <Text className="text-sm font-semibold text-ink-muted">Log out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
