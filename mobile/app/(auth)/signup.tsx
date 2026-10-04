import { useState, useEffect } from "react";
import { ScrollView, Text, View, Pressable, Alert, Linking, Platform } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useRouter } from "expo-router";
import type { Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as AppleAuthentication from "expo-apple-authentication";
import { Input } from "../../src/components/ui/Input";
import { Button } from "../../src/components/ui/Button";
import { NichePicker } from "../../src/components/NichePicker";
import { signInWithApple, signInWithAppleOAuth, signUpWithEmail, signInWithGoogle } from "../../src/api/auth";
import { getPendingReferralCode, clearPendingReferralCode } from "../../src/lib/referral";
import { PRIVACY_POLICY_URL } from "../../src/lib/links";
import { colors } from "../../src/lib/theme";

const schema = z.object({
  full_name: z.string().min(2, "Enter your full name"),
  phone: z.string().min(10, "Enter a valid mobile number"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Minimum 6 characters"),
  instagram_username: z.string().optional(),
  instagram_url: z.string().optional(),
  instagram_followers: z.string().optional(),
  youtube_channel: z.string().optional(),
  youtube_subscribers: z.string().optional(),
  referred_by_code: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function SignupScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [appleError, setAppleError] = useState("");
  const [niches, setNiches] = useState<string[]>([]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const previousOverflow = document.body.style.overflowY;
    document.body.style.overflowY = "auto";
    return () => {
      document.body.style.overflowY = previousOverflow;
    };
  }, []);

  const onApple = async () => {
    setAppleLoading(true);
    setAppleError("");
    try {
      if (Platform.OS === "ios") await signInWithApple();
      else await signInWithAppleOAuth();
    } catch (e: any) {
      if (e?.code !== "ERR_REQUEST_CANCELED") {
        const message = e.message ?? "Try again.";
        if (Platform.OS === "web") setAppleError(message);
        else Alert.alert("Apple sign-in failed", message);
      }
    } finally {
      setAppleLoading(false);
    }
  };

  const { control, handleSubmit, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: "", phone: "", email: "", password: "" },
  });

  // Pre-fill the referral code if the user arrived via a shared campaign link.
  useEffect(() => {
    void getPendingReferralCode().then((code) => {
      if (code) setValue("referred_by_code", code);
    });
  }, [setValue]);

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    try {
      const email = values.email.trim();
      const data = await signUpWithEmail({
        full_name: values.full_name,
        email,
        phone: `+91${values.phone}`,
        password: values.password,
        instagram_username: values.instagram_username,
        instagram_url: values.instagram_url,
        instagram_followers: Number(values.instagram_followers ?? 0),
        youtube_channel: values.youtube_channel,
        youtube_subscribers: Number(values.youtube_subscribers ?? 0),
        niches,
        referred_by_code: values.referred_by_code,
      });
      void clearPendingReferralCode();
      // If email confirmation is off, Supabase returns a session and the auth
      // gate signs the user straight in. Otherwise send them to enter the code.
      if (!data.session) {
        router.replace(`/(auth)/verify?email=${encodeURIComponent(email)}` as Href);
      }
    } catch (e: any) {
      Alert.alert("Signup failed", e.message ?? "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const onGoogle = async () => {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (e: any) {
      Alert.alert("Google sign-in failed", e.message ?? "Try again.");
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-canvas">
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={{ padding: 24, paddingTop: 56, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          onPress={() => router.canGoBack() ? router.back() : router.replace("/(auth)/login")}
          accessibilityRole="button"
          accessibilityLabel="Back to login"
          className="mb-4 self-start"
        >
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>

        <View className="items-center">
          <View className="h-16 w-16 items-center justify-center rounded-2xl bg-primary-100">
            <Ionicons name="gift" size={30} color={colors.primary} />
          </View>
          <Text className="mt-4 text-3xl font-extrabold text-ink">Create Account</Text>
          <Text className="mt-2 text-center text-base text-ink-soft">
            Join Bilkul — crack brand deals{"\n"}and grow your influence.
          </Text>
        </View>

        <View
          className="mt-6 gap-5 rounded-3xl bg-white p-6"
          style={{ shadowColor: "#E36E86", shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 3 }}
        >
          <Controller control={control} name="full_name" render={({ field: { onChange, value } }) => (
            <Input label="Full Name" icon="person-outline" placeholder="Enter your full name" onChangeText={onChange} value={value} error={errors.full_name?.message} />
          )} />

          <Controller control={control} name="phone" render={({ field: { onChange, value } }) => (
            <Input label="Mobile Number" icon="call-outline" placeholder="Enter your mobile number" keyboardType="phone-pad" onChangeText={onChange} value={value} error={errors.phone?.message} />
          )} />

          <Controller control={control} name="email" render={({ field: { onChange, value } }) => (
            <Input label="Email Address" icon="mail-outline" placeholder="Enter your email address" autoCapitalize="none" keyboardType="email-address" onChangeText={onChange} value={value} error={errors.email?.message} />
          )} />

          <Controller control={control} name="password" render={({ field: { onChange, value } }) => (
            <Input label="Password" icon="lock-closed-outline" placeholder="Create a password" secure onChangeText={onChange} value={value} error={errors.password?.message} />
          )} />

          <Controller control={control} name="referred_by_code" render={({ field: { onChange, value } }) => (
            <Input label="Referral Code (optional)" icon="ticket-outline" placeholder="Enter referral code" autoCapitalize="characters" onChangeText={onChange} value={value} />
          )} />

          <NichePicker
            hint="Pick the categories your content belongs to. Helps brands match you to the right campaigns."
            value={niches}
            onChange={setNiches}
          />

          <Button label="Create Account" onPress={handleSubmit(onSubmit)} loading={loading} fullWidth />

          <View className="flex-row items-center gap-3">
            <View className="h-px flex-1 bg-primary-100" />
            <Text className="text-xs text-ink-muted">OR</Text>
            <View className="h-px flex-1 bg-primary-100" />
          </View>

          <Button
            label="Continue with Google"
            variant="outline"
            onPress={onGoogle}
            loading={googleLoading}
            fullWidth
            leftIcon={<Ionicons name="logo-google" size={18} color="#DB4437" />}
          />
          {appleError ? (
            <Text accessibilityRole="alert" className="text-sm font-semibold text-red-700">
              {appleError}
            </Text>
          ) : null}
          {Platform.OS === "ios" ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={14}
              style={{ width: "100%", height: 48 }}
              onPress={onApple}
            />
          ) : (
            <Button
              label="Continue with Apple"
              variant="outline"
              onPress={onApple}
              loading={appleLoading}
              fullWidth
              leftIcon={<Ionicons name="logo-apple" size={18} color="#000" />}
            />
          )}
        </View>

        <View className="mt-6 flex-row items-center justify-center gap-1">
          <Text className="text-sm text-ink-soft">Already have an account?</Text>
          <Link href="/(auth)/login" asChild>
            <Pressable><Text className="text-sm font-bold text-primary">Login</Text></Pressable>
          </Link>
        </View>
        <Pressable
          onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
          accessibilityRole="link"
          className="mt-4 items-center py-2"
        >
          <Text className="text-sm font-semibold text-primary">Privacy Policy</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
