import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Profile } from "../lib/types";
import { unregisterPush } from "../lib/push";

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  initialized: boolean;
  loading: boolean;
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  init: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

// Module-level guard so the Supabase auth listener is only ever bound once,
// even if init() is invoked again after a Fast Refresh or component re-mount.
let authListenerBound = false;

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  profile: null,
  initialized: false,
  loading: false,

  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),

  init: async () => {
    // Guard against double-init (e.g. Fast Refresh / re-mount) so we don't
    // register the auth listener twice and refetch the profile on every event.
    if (get().initialized || authListenerBound) return;
    authListenerBound = true;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    set({ session });
    if (session?.user) {
      await get().refreshProfile();
    }
    set({ initialized: true });

    supabase.auth.onAuthStateChange(async (event, newSession) => {
      set({ session: newSession });
      if (!newSession?.user) {
        set({ profile: null });
        return;
      }
      // Only refetch the profile when it can actually have changed. Skipping the
      // frequent TOKEN_REFRESHED / INITIAL_SESSION events avoids a redundant
      // network round-trip (and UI flicker) every time the token auto-refreshes.
      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        await get().refreshProfile();
      }
    });
  },

  refreshProfile: async () => {
    const userId = get().session?.user?.id;
    if (!userId) return;
    // A brand-new account (e.g. Google sign-up) has its profile row created by a
    // DB trigger, which can lag a moment. Retry a few times so we don't end up
    // with a null profile — otherwise the phone-verification gate can't fire and
    // the user would slip into the app unverified.
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      if (data) {
        set({ profile: data as Profile });
        return;
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  },

  signOut: async () => {
    try {
      await unregisterPush();
    } catch {
      // ignore
    }
    try {
      await supabase.auth.signOut();
    } catch {
      // Clear local state even if the server session is already invalid.
    }
    set({ session: null, profile: null });
  },
}));
