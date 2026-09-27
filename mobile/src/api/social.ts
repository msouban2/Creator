import { useMutation } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { createURL } from "expo-linking";
import { supabase } from "../lib/supabase";

export interface SocialStatsInput {
  youtube_channel?: string;
  instagram_username?: string;
  instagram_token?: string;
}

export interface YouTubeStats {
  subscribers: number | null;
  views: number | null;
  video_count: number | null;
  avg_views: number | null;
  avg_likes: number | null;
  engagement_rate: number | null;
}

export interface SocialStatsResult {
  youtube_subscribers?: number | null;
  youtube?: YouTubeStats;
  instagram_followers?: number | null;
  errors?: string[];
}

/**
 * Calls the `fetch-social-stats` edge function to look up follower/subscriber
 * counts from public sources (YouTube Data API, public Instagram profile).
 */
export function useFetchSocialStats() {
  return useMutation({
    mutationFn: async (input: SocialStatsInput): Promise<SocialStatsResult> => {
      const { data, error } = await supabase.functions.invoke("fetch-social-stats", {
        body: input,
      });
      if (error) throw error;
      return data as SocialStatsResult;
    },
  });
}

export interface ConnectInstagramResult {
  connected: boolean;
  followers?: number | null;
  username?: string | null;
  error?: string;
}

export interface RefreshInstagramResult {
  refreshed: boolean;
  followers?: number | null;
  error?: string;
}

/**
 * Re-pulls the latest followers + insights for an already-connected Instagram
 * account using the long-lived token stored server-side. Safe no-op (returns
 * refreshed:false) when the account isn't connected or the token expired.
 */
export function useRefreshInstagram() {
  return useMutation({
    mutationFn: async (): Promise<RefreshInstagramResult> => {
      const { data, error } = await supabase.functions.invoke("instagram-oauth", {
        body: { action: "refresh" },
      });
      if (error) throw error;
      return data as RefreshInstagramResult;
    },
  });
}

type IgProfileSnapshot = {
  instagram_connected_at: string | null;
  instagram_username: string | null;
  instagram_followers: number | null;
};

// Reads the current user's stored Instagram fields. Used to detect that the
// server-side callback completed the connection even if the browser didn't
// hand control cleanly back to the app.
async function fetchIgSnapshot(): Promise<IgProfileSnapshot | null> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) return null;
  const { data } = await supabase
    .from("profiles")
    .select("instagram_connected_at, instagram_username, instagram_followers")
    .eq("id", uid)
    .maybeSingle();
  return (data as IgProfileSnapshot | null) ?? null;
}

/**
 * Connects the creator's Instagram **Business/Creator** account using Meta's
 * official "Instagram API with Instagram Login". This is our own Meta app — the
 * creator must be added as a tester in the Meta App dashboard (and accept the
 * invite) while the app is in development mode.
 *
 * Flow:
 *   1) ask `instagram-oauth` (action "start") for the Instagram authorize URL,
 *   2) open it in a secure browser session; the creator logs into Instagram,
 *   3) Instagram redirects to our callback, which exchanges the code, stores the
 *      token + real followers/insights server-side, then bounces back to the app
 *      with `?instagram=connected&followers=…&username=…`.
 */
export function useConnectInstagram() {
  return useMutation({
    mutationFn: async (): Promise<ConnectInstagramResult> => {
      const before = await fetchIgSnapshot();
      const appRedirect = createURL("personal-info");

      // 1) Ask the server to build the Instagram authorize URL for this creator.
      const { data: startData, error: startError } = await supabase.functions.invoke("instagram-oauth", {
        body: { action: "start", app_redirect: appRedirect },
      });
      if (startError) throw startError;
      const url = (startData as { url?: string; error?: string })?.url;
      if (!url) {
        throw new Error((startData as { error?: string })?.error ?? "Couldn't start Instagram connection.");
      }

      // 2) Open the hosted Instagram login.
      const result = await WebBrowser.openAuthSessionAsync(url, appRedirect);

      // 3) Fast path: the callback returned with our params.
      if (result.type === "success" && result.url) {
        const parsed = new URL(result.url);
        const status = parsed.searchParams.get("instagram");
        if (status === "connected") {
          const followersRaw = parsed.searchParams.get("followers");
          const followers = followersRaw ? Number(followersRaw) : null;
          return {
            connected: true,
            followers: Number.isFinite(followers as number) ? followers : null,
            username: parsed.searchParams.get("username"),
          };
        }
        if (status && status !== "connected") {
          return { connected: false, error: status };
        }
      }

      // Fallback: the connection may have completed even if the browser was
      // dismissed. Poll the profile a few times for a fresh connection.
      for (let i = 0; i < 5; i++) {
        const after = await fetchIgSnapshot();
        const justConnected =
          !!after?.instagram_connected_at &&
          after.instagram_connected_at !== before?.instagram_connected_at;
        if (justConnected) {
          return {
            connected: true,
            followers: after?.instagram_followers ?? null,
            username: after?.instagram_username ?? null,
          };
        }
        await new Promise((r) => setTimeout(r, 1200));
      }

      return { connected: false };
    },
  });
}
