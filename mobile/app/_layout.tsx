import "../global.css";
import { useEffect, useRef, useState, Component, type ReactNode } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import type { Href } from "expo-router";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { Animated, Easing, Text, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { queryClient } from "../src/lib/queryClient";
import { useAuthStore } from "../src/store/auth";
import { setPendingReferralCode } from "../src/lib/referral";
import { registerForPush } from "../src/lib/push";
import { colors } from "../src/lib/theme";
import { useAppFonts } from "../src/lib/fonts";

const SPLASH_BG = "#FEE9F0";

// Splash overlay that sits on top of the app. The cat rises up out of the "b"
// and a little heart pops beside it while the app boots; once everything is
// ready the whole logo gently zooms while fading out, handing off to the first
// screen as a smooth crossfade instead of an abrupt cut.
function AnimatedSplash({ visible }: { visible: boolean }) {
  const { width } = useWindowDimensions();
  const SIZE = Math.min(width * 0.62, 300); // logo box

  const opacity = useRef(new Animated.Value(1)).current; // whole-overlay fade
  const exitScale = useRef(new Animated.Value(1)).current; // whole-logo zoom on exit
  const catY = useRef(new Animated.Value(1)).current; // 1 = tucked away, 0 = peeking home
  const heartScale = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(true);

  // Entrance: the cat rises out of the b, then the heart pops.
  useEffect(() => {
    catY.setValue(1);
    heartScale.setValue(0);
    heartOpacity.setValue(0);
    const anim = Animated.sequence([
      Animated.delay(200),
      Animated.timing(catY, {
        toValue: 0,
        duration: 640,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.spring(heartScale, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
        Animated.timing(heartOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]),
    ]);
    anim.start();
    return () => anim.stop();
  }, [catY, heartScale, heartOpacity]);

  // Exit: zoom + fade out once ready.
  useEffect(() => {
    if (visible) return;
    const anim = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 650,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(exitScale, {
        toValue: 1.12,
        duration: 650,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    anim.start(({ finished }) => {
      if (finished) setMounted(false);
    });
    return () => anim.stop();
  }, [visible, opacity, exitScale]);

  if (!mounted) return null;

  // Cat travels from tucked-away (down, hidden behind the b's body) to home.
  const catTranslate = catY.interpolate({ inputRange: [0, 1], outputRange: [0, SIZE * 0.2] });
  const heartSize = SIZE * 0.13;

  return (
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      style={[
        StyleSheet.absoluteFill,
        { opacity, alignItems: "center", justifyContent: "center", backgroundColor: SPLASH_BG },
      ]}
    >
      <Animated.View style={{ width: SIZE, height: SIZE, transform: [{ scale: exitScale }] }}>
        {/* Cat sits BEHIND the b and rises up through the counter. */}
        <Animated.Image
          source={require("../assets/splash-cat.png")}
          style={{ position: "absolute", width: SIZE, height: SIZE, transform: [{ translateY: catTranslate }] }}
        />
        {/* The b has a transparent counter hole; its opaque body masks the cat
            to the bowl so the cat only ever shows inside the letter. */}
        <Animated.Image
          source={require("../assets/splash-b.png")}
          style={{ position: "absolute", width: SIZE, height: SIZE }}
        />
        {/* Heart pops beside the b. */}
        <Animated.Image
          source={require("../assets/splash-heart.png")}
          style={{
            position: "absolute",
            width: heartSize,
            height: heartSize,
            left: SIZE * 0.72 - heartSize / 2,
            top: SIZE * 0.34 - heartSize / 2,
            opacity: heartOpacity,
            transform: [{ scale: heartScale }],
          }}
        />
      </Animated.View>
    </Animated.View>
  );
}

// Ensures the splash is visible for at least `ms` so it doesn't just flash.
function useMinimumSplash(ms: number) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDone(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return done;
}


// Catches any render/startup error and shows it on screen instead of the app
// silently closing — critical for diagnosing standalone (APK) crashes.
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error("[Aaina] Startup error:", error);
  }
  render() {
    if (this.state.error) {
      return (
        <ScrollView
          style={{ flex: 1, backgroundColor: "#FFF6F7" }}
          contentContainerStyle={{ padding: 24, paddingTop: 80 }}
        >
          <Text style={{ fontSize: 18, fontWeight: "800", color: "#141414", marginBottom: 12 }}>
            Something went wrong
          </Text>
          <Text style={{ fontSize: 13, color: "#B23F5A", fontWeight: "700", marginBottom: 8 }}>
            {this.state.error.name}: {this.state.error.message}
          </Text>
          <Text style={{ fontSize: 11, color: "#4B4B4B" }}>
            {this.state.error.stack ?? "No stack trace"}
          </Text>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

// Captures a referral code from an incoming deep link
// (aaina://campaign/<id>?ref=<code>) so it can be applied at signup, even if
// the recipient isn't signed in yet. expo-router handles navigating to the
// campaign path itself.
function useCaptureReferral() {
  useEffect(() => {
    const handle = (url: string | null) => {
      if (!url) return;
      try {
        const ref = Linking.parse(url).queryParams?.ref;
        if (typeof ref === "string" && ref.trim()) {
          void setPendingReferralCode(ref);
        }
      } catch {
        // malformed URL — ignore
      }
    };
    void Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener("url", ({ url }) => handle(url));
    return () => sub.remove();
  }, []);
}

// Registers this device for push once signed in, and routes notification taps
// to their deep link (e.g. a support reply or campaign update).
function usePushNotifications(userId: string | undefined) {
  const router = useRouter();
  useEffect(() => {
    if (userId) void registerForPush(userId);
  }, [userId]);

  useEffect(() => {
    const go = (resp: Notifications.NotificationResponse | null) => {
      const link = (resp?.notification.request.content.data as { link?: string } | undefined)?.link;
      if (link && typeof link === "string" && link.startsWith("/")) {
        try {
          router.push(link as never);
        } catch {
          // ignore bad link
        }
      }
    };
    // App opened by tapping a notification (cold start).
    void Notifications.getLastNotificationResponseAsync().then(go);
    // Taps while the app is running.
    const sub = Notifications.addNotificationResponseReceivedListener(go);
    return () => sub.remove();
  }, [router]);
}

function AuthGate() {
  const router = useRouter();
  const segments = useSegments();
  const { session, profile, initialized, init } = useAuthStore();

  useCaptureReferral();
  usePushNotifications(session?.user?.id);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (!initialized) return;
    const routeSegments = segments as readonly string[];
    const inAuthGroup = routeSegments[0] === "(auth)";
    // `/auth/reset` and `/auth/callback` are deep-link landing screens that
    // establish their own session (password recovery / OAuth). Never redirect
    // them — otherwise the reset link bounces to login before the user can set
    // a new password.
    const inAuthFlow = routeSegments[0] === "auth";
    const onVerifyPhone = inAuthGroup && routeSegments[1] === "verify-phone";

    if (inAuthFlow) return;

    if (!session) {
      const inCampaignBrowse = routeSegments[0] === "campaign";
      const inPublicHome = !routeSegments.length || routeSegments[0] === "index" || (routeSegments[0] === "(tabs)" && !routeSegments[1]);
      const inPublicCampaignList = routeSegments[0] === "(tabs)" && routeSegments[1] === "campaigns";
      if (!inAuthGroup && !inCampaignBrowse && !inPublicHome && !inPublicCampaignList) router.replace("/(auth)/login");
      return;
    }

    // Signed in but phone not verified yet — force the SMS OTP step first.
    // (Wait for the profile to load before deciding.)
    if (profile && profile.phone_verified === false) {
      if (!onVerifyPhone) router.replace("/(auth)/verify-phone" as Href);
      return;
    }

    if (profile && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [session, profile, initialized, segments, router]);

  if (!initialized) {
    // Render nothing here; the fading splash overlay in RootLayout covers the
    // screen until the app is ready.
    return null;
  }

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }} />;
}

export default function RootLayout() {
  const fontsLoaded = useAppFonts();
  const minSplash = useMinimumSplash(1400);
  const initialized = useAuthStore((s) => s.initialized);
  const ready = fontsLoaded && minSplash && initialized;

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
          <SafeAreaProvider>
            <QueryClientProvider client={queryClient}>
              <StatusBar style="dark" />
              <AuthGate />
              <AnimatedSplash visible={!ready} />
            </QueryClientProvider>
          </SafeAreaProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
