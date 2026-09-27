import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  init: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuth = create<AuthState>((set, get) => ({
  session: null,
  profile: null,
  loading: true,
  init: async () => {
    const { data } = await supabase.auth.getSession();
    set({ session: data.session });
    if (data.session) await get().refreshProfile();
    set({ loading: false });
    supabase.auth.onAuthStateChange(async (_event, session) => {
      set({ session });
      if (session) await get().refreshProfile();
      else set({ profile: null });
    });
  },
  refreshProfile: async () => {
    const uid = get().session?.user.id;
    if (!uid) return;
    const { data } = await supabase.from("profiles").select("*").eq("id", uid).single();
    set({ profile: data ?? null });
  },
  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, profile: null });
  },
}));
