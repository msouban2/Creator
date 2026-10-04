import { useEffect, useState } from "react";
import { ScrollView, Text, View, Pressable, Alert, Platform } from "react-native";
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
import { signInWithApple, signInWithAppleOAuth, signInWithEmail, signInWithGoogle, signInWithPhone, resendSignupOtp } from "../../src/api/auth";
import { colors } from "../../src/lib/theme";

const schema = z.object({
  email: z.string().min(3, "Enter your email or mobile number"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});
type FormValues = z.infer<typeof schema>;

export default function LoginScreen() {
  const router = useRouter();
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const previousOverflow = document.body.style.overflowY;
    document.body.style.overflowY = "auto";
    return () => {
      document.body.style.overflowY = previousOverflow;
    };
  }, []);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const onApple = async () => {
    setAppleLoading(true);
    setLoginError("");
    try {
      if (Platform.OS === "ios") await signInWithApple();
      else await signInWithAppleOAuth();
    } catch (e: any) {
      if (e?.code !== "ERR_REQUEST_CANCELED") {
        const message = e.message ?? "Try again.";
        if (Platform.OS === "web") setLoginError(message);
        else Alert.alert("Apple sign-in failed", message);
      }
    } finally {
      setAppleLoading(false);
    }
  };
  const { control, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    setLoginError("");
    const id = values.email.trim();
    const digits = id.replace(/[^0-9]/g, "");
    // Treat all-numeric input (10 or 12 digits, optional +/spaces) as a phone.
    const looksPhone = /^\+?[\d\s-]+$/.test(id) && (digits.length === 10 || digits.length === 12);
    try {
      if (looksPhone) {
        await signInWithPhone(digits, values.password);
      } else {
        await signInWithEmail(id, values.password);
      }
    } catch (e: any) {
      const msg = e.message ?? "";
      // Email account exists but was never verified — send them to enter the code.
      if (!looksPhone && /email not confirmed|not confirmed|email.*verif/i.test(msg)) {
        void resendSignupOtp(id).catch(() => {});
        router.push(`/(auth)/verify?email=${encodeURIComponent(id)}` as Href);
        return;
      }
      const message = msg || "Please check your credentials.";
      if (Platform.OS === "web") setLoginError(message);
      else Alert.alert("Login failed", message);
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
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="items-center">
          <View className="h-16 w-16 items-center justify-center rounded-2xl bg-primary-100">
            <Ionicons name="gift" size={30} color={colors.primary} />
          </View>
          <Text className="mt-4 text-4xl font-extrabold text-ink">Welcome!</Text>
          <Text className="mt-2 text-center text-base text-ink-soft">
            Crack brand deals.{"\n"}Grow your influence.
          </Text>
        </View>

        <View
          className="mt-8 gap-5 rounded-3xl bg-white p-6"
          style={{ shadowColor: "#E36E86", shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 3 }}
        >
          <Text className="text-lg font-bold text-ink">Login to your account</Text>

          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Email or Mobile Number"
                icon="mail-outline"
                placeholder="Enter email or mobile number"
                autoCapitalize="none"
                keyboardType="email-address"
                onChangeText={onChange}
                onBlur={onBlur}
                value={value}
                error={errors.email?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Password"
                icon="lock-closed-outline"
                placeholder="Enter your password"
                secure
                onChangeText={onChange}
                onBlur={onBlur}
                value={value}
                error={errors.password?.message}
              />
            )}
          />

          <Link href="/(auth)/forgot-password" asChild>
            <Pressable className="self-end">
              <Text className="text-sm font-semibold text-primary">Forgot Password?</Text>
            </Pressable>
          </Link>

          {loginError ? (
            <Text accessibilityRole="alert" className="text-sm font-semibold text-red-700">
              {loginError}
            </Text>
          ) : null}

          <Button label="Login" onPress={handleSubmit(onSubmit)} loading={loading} fullWidth />

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
          {Platform.OS === "ios" ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
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
          <Text className="text-sm text-ink-soft">Don't have an account?</Text>
          <Link href="/(auth)/signup" asChild>
            <Pressable>
              <Text className="text-sm font-bold text-primary">Sign Up</Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
