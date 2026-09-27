import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import type { Href } from "expo-router";
import * as Linking from "expo-linking";
import { supabase } from "../../src/lib/supabase";
import { useAuthStore } from "../../src/store/auth";
import { colors } from "../../src/lib/theme";

// After a Google (OAuth) sign-in the profile row is created by a DB trigger,
// which can lag a moment for a brand-new account. Poll briefly so we can read
// phone_verified and route correctly instead of dropping unverified users into
// the app.
async function fetchPhoneVerified(userId: string): Promise<boolean> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data } = await supabase
      .from("profiles")
      .select("phone_verified")
      .eq("id", userId)
      .single();
    if (data) return (data as { phone_verified: boolean }).phone_verified === true;
    await new Promise((r) => setTimeout(r, 400));
  }
  // Profile still not found — treat as unverified so they go through the SMS
  // step rather than skipping it.
  return false;
}

/**
 * Landing screen for the OAuth redirect (e.g. Google). Supabase sends the
 * browser back to `.../auth/callback` with either tokens in the URL hash
 * (implicit flow) or a `?code=` (PKCE). We complete the session here, then
 * route the user: a creator who hasn't verified their mobile number is sent to
 * phone verification first; everyone else goes into the app.
 */
export default function AuthCallback() {
  const url = Linking.useURL();

  useEffect(() => {
    (async () => {
      if (!url) return;
      let next: Href = "/(tabs)";
      try {
        const parsed = new URL(url);

        const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ""));
        const access_token = hashParams.get("access_token");
        const refresh_token = hashParams.get("refresh_token");

        if (access_token && refresh_token) {
          await supabase.auth.setSession({ access_token, refresh_token });
        } else {
          const code = parsed.searchParams.get("code");
          if (code) await supabase.auth.exchangeCodeForSession(code);
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await useAuthStore.getState().refreshProfile();
          const verified = await fetchPhoneVerified(user.id);
          if (!verified) next = "/(auth)/verify-phone" as Href;
        }
      } catch {
        // If parsing fails we still leave the loading screen below.
      } finally {
        router.replace(next);
      }
    })();
  }, [url]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.canvas }}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}
