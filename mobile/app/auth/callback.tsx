import { useEffect, useRef } from "react";
import { View, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import type { Href } from "expo-router";
import type { Session } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import { supabase } from "../../src/lib/supabase";
import { useAuthStore } from "../../src/store/auth";
import { colors } from "../../src/lib/theme";

/**
 * Landing screen for the OAuth redirect (e.g. Google). Supabase sends the
 * browser back to `.../auth/callback` with either tokens in the URL hash
 * (implicit flow) or a `?code=` (PKCE). We complete the session here, then
 * route the user: a creator who hasn't verified their mobile number is sent to
 * phone verification first; everyone else goes into the app.
 */
export default function AuthCallback() {
  const routed = useRef(false);

  useEffect(() => {
    let active = true;
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;

    const routeFromSession = async (session: Session | null) => {
      if (!active || routed.current) return;
      routed.current = true;
      if (!session) {
        router.replace("/(auth)/login");
        return;
      }

      useAuthStore.getState().setSession(session);
      await Promise.race([
        useAuthStore.getState().refreshProfile(),
        new Promise<void>((resolve) => setTimeout(resolve, 5000)),
      ]);
      if (!active) return;

      const profile = useAuthStore.getState().profile;
      const providers = session.user.app_metadata.providers as string[] | undefined;
      const appleSession = session.user.app_metadata.provider === "apple" || providers?.includes("apple");
      const socialSession = appleSession || session.user.app_metadata.provider === "google" || providers?.includes("google");

      if (!profile?.phone_verified || (appleSession && !profile.phone)) {
        router.replace("/(auth)/verify-phone" as Href);
      } else if (socialSession && !profile.niches?.length) {
        router.replace("/(auth)/complete-profile" as Href);
      } else {
        router.replace("/(tabs)");
      }
    };

    const getSession = async () => {
      const sessionPromise = supabase.auth.getSession().then(({ data }) => data.session);
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000));
      return (await Promise.race([sessionPromise, timeoutPromise])) ?? useAuthStore.getState().session;
    };

    const handleUrl = async (incomingUrl: string | null) => {
      if (!active || routed.current) return;

      try {
        let session: Session | null = null;
        if (incomingUrl) {
          const parsed = new URL(incomingUrl);
          const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ""));
          const accessToken = hashParams.get("access_token");
          const refreshToken = hashParams.get("refresh_token");

          if (accessToken && refreshToken) {
            const { data, error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
            if (error) throw error;
            session = data.session;
          } else {
            const code = parsed.searchParams.get("code");
            if (code) {
              const { data, error } = await supabase.auth.exchangeCodeForSession(code);
              if (error) throw error;
              session = data.session;
            }
          }
        }

        session ??= await getSession();
        await routeFromSession(session);
      } catch {
        await routeFromSession(await getSession());
      }
    };

    const urlSubscription = Linking.addEventListener("url", ({ url: incomingUrl }) => {
      void handleUrl(incomingUrl);
    });
    const { data: authSubscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setTimeout(() => void routeFromSession(session), 0);
    });

    void Linking.getInitialURL().then((initialUrl) => {
      if (initialUrl) {
        void handleUrl(initialUrl);
        return;
      }
      void getSession().then((session) => {
        if (session) void routeFromSession(session);
        else fallbackTimer = setTimeout(() => void handleUrl(null), 8000);
      });
    }).catch(() => {
      fallbackTimer = setTimeout(() => void handleUrl(null), 8000);
    });

    return () => {
      active = false;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      urlSubscription.remove();
      authSubscription.subscription.unsubscribe();
    };
  }, []);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.canvas }}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}
