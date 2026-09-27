import { useMutation } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { createURL } from "expo-linking";
import { supabase } from "../lib/supabase";

/**
 * The Supabase JS client puts a `Response` (not a string) in `error.context`
 * for edge-function non-2xx replies. We need to actually read that response
 * body to surface the real `{ error: "..." }` message instead of the
 * generic "Edge Function returned a non-2xx status code" text.
 */
async function extractErrorMessage(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: unknown; message?: string })?.context;
  try {
    if (ctx instanceof Response) {
      const cloned = ctx.clone();
      const text = await cloned.text();
      try {
        const json = JSON.parse(text) as { error?: string; message?: string };
        return json.error ?? json.message ?? text;
      } catch {
        return text || null;
      }
    }
    if (typeof (ctx as { body?: unknown })?.body === "string") {
      return (ctx as { body: string }).body;
    }
  } catch {
    // fall through to error.message below
  }
  return (error as { message?: string })?.message ?? null;
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("youtube-verify", { body });
  if (error) {
    throw new Error((await extractErrorMessage(error)) ?? "Something went wrong. Please try again.");
  }
  const res = data as T & { error?: string };
  if ((res as { error?: string })?.error && !("verified" in (res as object)) && !("code" in (res as object))) {
    throw new Error((res as { error?: string }).error);
  }
  return res;
}

export interface YtStartResult {
  channelId?: string;
  channelTitle?: string;
  code?: string;
  error?: string;
}

/** Step 1: resolve the channel and get a one-time code to paste in the About. */
export function useStartYouTubeVerify() {
  return useMutation({
    mutationFn: (channel: string) => call<YtStartResult>({ action: "start", channel }),
  });
}

export interface YtCheckResult {
  verified: boolean;
  title?: string | null;
  subscribers?: number | null;
  error?: string;
}

/** Step 2: confirm the code is now in the channel description. */
export function useCheckYouTubeVerify() {
  return useMutation({
    mutationFn: () => call<YtCheckResult>({ action: "check" }),
  });
}

export interface YtRefreshResult {
  refreshed: boolean;
  title?: string | null;
  subscribers?: number | null;
  error?: string;
}

/** Re-pull live subscriber count + analytics for an already-verified channel. */
export function useRefreshYouTube() {
  return useMutation({
    mutationFn: () => call<YtRefreshResult>({ action: "refresh" }),
  });
}

// ---------------------------------------------------------------------------
// OAuth verification (sign in with Google) — the youtube-oauth edge function
// reads the creator's OWN channel via channels?mine=true (impossible to fake).
// ---------------------------------------------------------------------------

export interface ConnectYouTubeResult {
  connected: boolean;
  subscribers?: number | null;
  title?: string | null;
  error?: string;
}

async function fetchYtSnapshot(): Promise<{ youtube_connected_at?: string | null; youtube_channel_title?: string | null; youtube_subscribers?: number | null } | null> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) return null;
  const { data: prof } = await supabase
    .from("profiles")
    .select("youtube_connected_at, youtube_channel_title, youtube_subscribers")
    .eq("id", uid)
    .maybeSingle();
  return (prof as any) ?? null;
}

/**
 * Connects the creator's YouTube channel by signing in with Google.
 *   1) ask `youtube-oauth` (action "start") for the Google authorize URL,
 *   2) open it in a secure browser session; the creator signs into Google,
 *   3) Google redirects to our callback, which reads their channel via
 *      channels?mine=true, stores the verified channel + stats server-side,
 *      then bounces back to the app with `?youtube=connected&subscribers=…`.
 */
export function useConnectYouTube() {
  return useMutation({
    mutationFn: async (): Promise<ConnectYouTubeResult> => {
      const before = await fetchYtSnapshot();
      const appRedirect = createURL("insights");

      const { data: startData, error: startError } = await supabase.functions.invoke("youtube-oauth", {
        body: { action: "start", app_redirect: appRedirect },
      });
      if (startError) {
        throw new Error((await extractErrorMessage(startError)) ?? "Couldn't start YouTube connection.");
      }
      const url = (startData as { url?: string; error?: string })?.url;
      if (!url) {
        throw new Error((startData as { error?: string })?.error ?? "Couldn't start YouTube connection.");
      }

      const result = await WebBrowser.openAuthSessionAsync(url, appRedirect);

      if (result.type === "success" && result.url) {
        const parsed = new URL(result.url);
        const status = parsed.searchParams.get("youtube");
        if (status === "connected") {
          const subsRaw = parsed.searchParams.get("subscribers");
          const subs = subsRaw ? Number(subsRaw) : null;
          return {
            connected: true,
            subscribers: Number.isFinite(subs as number) ? subs : null,
            title: parsed.searchParams.get("title"),
          };
        }
        if (status && status !== "connected") {
          return { connected: false, error: status };
        }
      }

      // Fallback: the connection may have completed even if the browser was
      // dismissed. Poll the profile a few times for a fresh connection.
      for (let i = 0; i < 5; i++) {
        const after = await fetchYtSnapshot();
        const justConnected =
          !!after?.youtube_connected_at &&
          after.youtube_connected_at !== before?.youtube_connected_at;
        if (justConnected) {
          return {
            connected: true,
            subscribers: after?.youtube_subscribers ?? null,
            title: after?.youtube_channel_title ?? null,
          };
        }
        await new Promise((r) => setTimeout(r, 1200));
      }

      return { connected: false };
    },
  });
}
