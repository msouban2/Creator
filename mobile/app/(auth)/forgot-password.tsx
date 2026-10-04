import { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View, Pressable, Alert, Platform } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Input } from "../../src/components/ui/Input";
import { Button } from "../../src/components/ui/Button";
import { sendPasswordReset } from "../../src/api/auth";
import { sendResetOtp, resendResetOtp, verifyResetOtp } from "../../src/api/phone";
import { colors } from "../../src/lib/theme";

type Method = "email" | "mobile";
type MobileStep = "phone" | "code";
const RESEND_COOLDOWN = 30;

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [method, setMethod] = useState<Method>("email");

  // Email flow
  const [email, setEmail] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);

  // Mobile flow
  const [step, setStep] = useState<MobileStep>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [resetError, setResetError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timer.current = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const onSendEmail = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      Alert.alert("Enter a valid email", "Please check your email address.");
      return;
    }
    setEmailLoading(true);
    try {
      await sendPasswordReset(email.trim());
      Alert.alert("Email sent", "Check your inbox for a password reset link.");
      router.back();
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Could not send reset email.");
    } finally {
      setEmailLoading(false);
    }
  };

  const onSendOtp = async () => {
    if (phone.trim().length !== 10) {
      Alert.alert("Enter your number", "Please enter your 10-digit mobile number.");
      return;
    }
    setBusy(true);
    try {
      await sendResetOtp(phone.trim());
      setStep("code");
      setCooldown(RESEND_COOLDOWN);
    } catch (e: any) {
      Alert.alert("Couldn't send code", e.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const onResendOtp = async () => {
    if (cooldown > 0) return;
    setBusy(true);
    try {
      await resendResetOtp(phone.trim());
      setCooldown(RESEND_COOLDOWN);
      Alert.alert("Code sent", "We've texted you a new code.");
    } catch (e: any) {
      Alert.alert("Couldn't resend", e.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const onVerifyReset = async () => {
    setResetError("");
    if (code.trim().length < 4) {
      Alert.alert("Enter the code", "Please enter the code we texted you.");
      return;
    }
    if (password.length < 6) {
      Alert.alert("Weak password", "Use at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      Alert.alert("Passwords don't match", "Please re-enter the same password.");
      return;
    }
    setBusy(true);
    try {
      await verifyResetOtp(phone.trim(), code.trim(), password);
      router.replace("/(auth)/login");
    } catch (e: any) {
      const message = e.message ?? "That code is invalid or expired.";
      if (Platform.OS === "web") setResetError(message);
      else Alert.alert("Couldn't reset password", message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: 56 }} className="bg-canvas">
      <Pressable onPress={() => router.back()} className="mb-6 self-start">
        <Ionicons name="chevron-back" size={26} color={colors.ink} />
      </Pressable>

      <View className="items-center">
        <View className="h-16 w-16 items-center justify-center rounded-2xl bg-primary-100">
          <Ionicons name="lock-closed" size={28} color={colors.primary} />
        </View>
        <Text className="mt-4 text-3xl font-extrabold text-ink">Forgot Password?</Text>
        <Text className="mt-2 text-center text-base text-ink-soft">
          Choose how you'd like to reset your password.
        </Text>
      </View>

      {/* Method switch */}
      <View className="mt-6 flex-row rounded-2xl bg-primary-50 p-1">
        {(["email", "mobile"] as Method[]).map((m) => {
          const active = method === m;
          return (
            <Pressable
              key={m}
              onPress={() => setMethod(m)}
              className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2.5 ${active ? "bg-white" : ""}`}
            >
              <Ionicons
                name={m === "email" ? "mail-outline" : "phone-portrait-outline"}
                size={16}
                color={active ? colors.primary : colors.inkMuted}
              />
              <Text className={`text-sm font-bold ${active ? "text-primary" : "text-ink-muted"}`}>
                {m === "email" ? "Email" : "Mobile OTP"}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {method === "email" ? (
        <View className="mt-6 gap-5">
          <Input
            label="Email Address"
            icon="mail-outline"
            placeholder="Enter your email"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <Button label="Send Reset Link" onPress={onSendEmail} loading={emailLoading} fullWidth />
        </View>
      ) : (
        <View className="mt-6 gap-5">
          <Input
            label="Mobile Number"
            icon="call-outline"
            placeholder="10-digit mobile number"
            keyboardType="number-pad"
            maxLength={10}
            value={phone}
            editable={step === "phone"}
            onChangeText={(t) => setPhone(t.replace(/[^0-9]/g, ""))}
          />
          <Text className="text-xs text-ink-muted">
            Reset codes are sent only to the verified phone number on an existing account. A different number cannot reset the password.
          </Text>

          {step === "phone" ? (
            <Button label="Send Code" onPress={onSendOtp} loading={busy} fullWidth />
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
              {resetError ? (
                <Text accessibilityRole="alert" className="text-sm font-semibold text-red-700">
                  {resetError}
                </Text>
              ) : null}
              <Button label="Reset Password" onPress={onVerifyReset} loading={busy} fullWidth />

              <View className="flex-row items-center justify-center gap-3">
                <Pressable onPress={() => { setStep("phone"); setCode(""); }}>
                  <Text className="text-sm font-semibold text-ink-soft">Change number</Text>
                </Pressable>
                <Text className="text-ink-muted">·</Text>
                <Pressable onPress={onResendOtp} disabled={cooldown > 0 || busy}>
                  <Text className={`text-sm font-bold ${cooldown > 0 ? "text-ink-muted" : "text-primary"}`}>
                    {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend"}
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
}
