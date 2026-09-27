// Supabase Edge Function: youtube-oauth
// -----------------------------------------------------------------------------
// Proves a creator OWNS a YouTube channel by signing in with Google (OAuth).
// The Google client secret and token exchange stay on the server — the phone
// never sees them. We read THEIR OWN channel via channels?mine=true (impossible
// to fake) and write the verified channel id, title, subscriber count and
// analytics back to the profile.
//
//   1) START  — POST { action: "start", app_redirect: "aaina://insights" }
//               (with the caller's Supabase JWT). Returns { url } to open.
//   2) CALLBACK — GET .../youtube-oauth/callback?code=...&state=...
//               Google redirects here. Exchanges the code, reads the channel,
//               stores stats + tokens, bounces back to the app deep link.
//   3) REFRESH — POST { action: "refresh" } (with JWT). Re-pulls live stats
//               using the stored refresh token.
//
// Required secrets:
//    YT_CLIENT_ID      — Google OAuth 2.0 Client ID (Web application)
//    YT_CLIENT_SECRET  — Google OAuth 2.0 Client secret
//    YT_REDIRECT_URI   — must EXACTLY match an authorized redirect URI, e.g.
//                        https://<ref>.supabase.co/functions/v1/youtube-oauth/callback
//    YOUTUBE_API_KEY   — used for the (non-authenticated) analytics reads
//    SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY — automatic
//
// Deploy WITHOUT JWT verification (the callback is a browser hit with no JWT).
// -----------------------------------------------------------------------------

import { createClient } from "jsr:@supabase/supabase-js@2";

const YT_CLIENT_ID = Deno.env.get("YT_CLIENT_ID") ?? "";
const YT_CLIENT_SECRET = Deno.env.get("YT_CLIENT_SECRET") ?? "";
const YT_REDIRECT_URI = Deno.env.get("YT_REDIRECT_URI") ?? "";
const YT_KEY = Deno.env.get("YOUTUBE_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const YT_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const admin = () => createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

function withParams(base: string, params: Record<string, string | number>): string {
  const sep = base.includes("?") ? "&" : "?";
  const q = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return `${base}${sep}${q}`;
}

// Sends the browser back into the app via the deep link (HTTP 302 to the custom
// scheme, which iOS ASWebAuthenticationSession / Android Custom Tabs intercept).
function bounce(appUrl: string, message: string): Response {
  const safeUrl = appUrl.replace(/"/g, "%22");
  const html = `<!doctype html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="refresh" content="0;url=${safeUrl}" />
<title>Bilkul</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0f0b1e;color:#fff;
display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;text-align:center}
.card{max-width:340px;padding:28px}a{color:#F6B6C1}</style></head>
<body><div class="card"><h2>${message}</h2><p>Returning you to Bilkul…</p>
<p><a href="${safeUrl}">Tap here if it doesn't happen automatically.</a></p>
<script>location.replace("${safeUrl}");</script></div></body></html>`;
  return new Response(html, {
    status: 302,
    headers: { ...cors, "Content-Type": "text/html; charset=utf-8", "Location": appUrl, "Cache-Control": "no-store" },
  });
}

// ---- OAuth token exchange --------------------------------------------------

async function exchangeCode(code: string): Promise<{ access_token: string; refresh_token: string | null; expires_in: number }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: YT_CLIENT_ID,
      client_secret: YT_CLIENT_SECRET,
      redirect_uri: YT_REDIRECT_URI,
      grant_type: "authorization_code",
      code,
    }).toString(),
  });
  const data = await res.json();
  if (!res.ok || !data?.access_token) {
    throw new Error(data?.error_description || data?.error || "Token exchange failed.");
  }
  return {
    access_token: String(data.access_token),
    refresh_token: data.refresh_token ? String(data.refresh_token) : null,
    expires_in: Number(data.expires_in ?? 3600),
  };
}

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: YT_CLIENT_ID,
      client_secret: YT_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
  });
  const data = await res.json();
  if (!res.ok || !data?.access_token) {
    throw new Error(data?.error_description || data?.error || "Could not refresh Google token.");
  }
  return { access_token: String(data.access_token), expires_in: Number(data.expires_in ?? 3600) };
}

// ---- YouTube reads ---------------------------------------------------------

type Channel = {
  id: string;
  title: string;
  subscribers: number | null;
  views: number | null;
  videoCount: number | null;
  uploads: string | null;
};

// Reads the signed-in user's OWN channel — mine=true means Google returns the
// channel that belongs to the OAuth token, which cannot be faked.
async function fetchMyChannel(accessToken: string): Promise<Channel | null> {
  const r = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&mine=true",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const d = await r.json();
  const item = d?.items?.[0];
  if (!item) return null;
  const s = item.statistics ?? {};
  return {
    id: String(item.id ?? ""),
    title: String(item.snippet?.title ?? ""),
    subscribers: s.hiddenSubscriberCount ? null : Number(s.subscriberCount ?? 0),
    views: s.viewCount != null ? Number(s.viewCount) : null,
    videoCount: s.videoCount != null ? Number(s.videoCount) : null,
    uploads: item.contentDetails?.relatedPlaylists?.uploads ?? null,
  };
}

async function recentAverages(uploads: string) {
  try {
    const l = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=10&playlistId=${encodeURIComponent(
        uploads
      )}&key=${YT_KEY}`
    );
    const ld = await l.json();
    const ids: string[] = (ld?.items ?? [])
      .map((i: { contentDetails?: { videoId?: string } }) => i?.contentDetails?.videoId)
      .filter(Boolean);
    if (!ids.length) return { avg_views: null, avg_likes: null, engagement_rate: null };
    const v = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${ids.join(",")}&key=${YT_KEY}`
    );
    const vd = await v.json();
    const items: { statistics?: { viewCount?: string; likeCount?: string } }[] = vd?.items ?? [];
    if (!items.length) return { avg_views: null, avg_likes: null, engagement_rate: null };
    let tv = 0, tl = 0;
    for (const it of items) {
      tv += Number(it.statistics?.viewCount ?? 0);
      tl += Number(it.statistics?.likeCount ?? 0);
    }
    const avgViews = Math.round(tv / items.length);
    const avgLikes = Math.round(tl / items.length);
    const eng = avgViews > 0 ? Math.round((avgLikes / avgViews) * 10000) / 100 : null;
    return { avg_views: avgViews, avg_likes: avgLikes, engagement_rate: eng };
  } catch {
    return { avg_views: null, avg_likes: null, engagement_rate: null };
  }
}

// Builds the profile patch (verified channel + stats) from a channel read.
async function channelPatch(ch: Channel): Promise<Record<string, unknown>> {
  const averages = ch.uploads
    ? await recentAverages(ch.uploads)
    : { avg_views: null, avg_likes: null, engagement_rate: null };
  const patch: Record<string, unknown> = {
    youtube_channel_id: ch.id,
    youtube_channel_title: ch.title,
    youtube_channel: ch.title,
    youtube_verified: true,
    youtube_connected_at: new Date().toISOString(),
    yt_insights_synced_at: new Date().toISOString(),
    youtube_verify_code: null,
    youtube_verify_channel_id: null,
  };
  if (ch.subscribers != null) patch.youtube_subscribers = ch.subscribers;
  if (ch.views != null) patch.youtube_views = ch.views;
  if (ch.videoCount != null) patch.youtube_video_count = ch.videoCount;
  if (averages.avg_views != null) patch.youtube_avg_views = averages.avg_views;
  if (averages.avg_likes != null) patch.youtube_avg_likes = averages.avg_likes;
  if (averages.engagement_rate != null) patch.youtube_engagement_rate = averages.engagement_rate;
  return patch;
}

// ---- START -----------------------------------------------------------------

async function handleStart(req: Request): Promise<Response> {
  if (!YT_CLIENT_ID || !YT_REDIRECT_URI) {
    return json({ error: "YouTube sign-in is not configured on the server yet." }, 500);
  }
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Not signed in." }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Not signed in." }, 401);

  let body: { app_redirect?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }
  const appRedirect = (body.app_redirect || "aaina://insights").trim();

  const state = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const db = admin();
  const { error: insErr } = await db.from("youtube_oauth_states").insert({
    state,
    user_id: userData.user.id,
    app_redirect: appRedirect,
  });
  if (insErr) return json({ error: "Could not start YouTube connection." }, 500);

  const url = withParams("https://accounts.google.com/o/oauth2/v2/auth", {
    client_id: YT_CLIENT_ID,
    redirect_uri: YT_REDIRECT_URI,
    response_type: "code",
    scope: YT_SCOPE,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });
  return json({ url });
}

// ---- CALLBACK --------------------------------------------------------------

async function handleCallback(url: URL): Promise<Response> {
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const oauthError = url.searchParams.get("error");

  const db = admin();
  let appRedirect = "aaina://insights";
  let userId = "";
  if (state) {
    const { data: row } = await db
      .from("youtube_oauth_states")
      .select("user_id, app_redirect")
      .eq("state", state)
      .maybeSingle();
    if (row) {
      userId = row.user_id as string;
      appRedirect = (row.app_redirect as string) || appRedirect;
    }
  }
  const cleanup = async () => {
    if (state) await db.from("youtube_oauth_states").delete().eq("state", state);
  };

  if (oauthError) {
    await cleanup();
    return bounce(withParams(appRedirect, { youtube: "error" }), "YouTube connection cancelled.");
  }
  if (!state || !userId || !code) {
    await cleanup();
    return bounce(withParams(appRedirect, { youtube: "error" }), "YouTube connection expired. Please try again.");
  }

  try {
    const tok = await exchangeCode(code);
    const ch = await fetchMyChannel(tok.access_token);
    if (!ch || !ch.id) {
      await cleanup();
      return bounce(withParams(appRedirect, { youtube: "error" }), "No YouTube channel found on that Google account.");
    }

    // One channel per account.
    const { data: existing } = await db
      .from("profiles")
      .select("id")
      .eq("youtube_channel_id", ch.id)
      .neq("id", userId)
      .maybeSingle();
    if (existing) {
      await cleanup();
      return bounce(
        withParams(appRedirect, { youtube: "error" }),
        "This YouTube channel is already connected to another Bilkul account."
      );
    }

    const patch = await channelPatch(ch);
    const { error: updErr } = await db.from("profiles").update(patch).eq("id", userId);

    const expiresAt = tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000).toISOString() : null;
    // Only overwrite the stored refresh token when Google returns a new one.
    const cred: Record<string, unknown> = {
      user_id: userId,
      youtube_access_token: tok.access_token,
      youtube_token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    };
    if (tok.refresh_token) cred.youtube_refresh_token = tok.refresh_token;
    const { error: tokErr } = await db.from("youtube_credentials").upsert(cred);

    await cleanup();
    if (updErr || tokErr) {
      const dupe = (updErr as { code?: string } | null)?.code === "23505";
      return bounce(
        withParams(appRedirect, { youtube: "error" }),
        dupe
          ? "This YouTube channel is already connected to another Bilkul account."
          : "Couldn't save your YouTube details."
      );
    }

    return bounce(
      withParams(appRedirect, { youtube: "connected", subscribers: ch.subscribers ?? "", title: ch.title }),
      "YouTube connected!"
    );
  } catch (e) {
    await cleanup();
    const message = e instanceof Error ? e.message : "YouTube connection failed.";
    return bounce(withParams(appRedirect, { youtube: "error" }), message.slice(0, 120));
  }
}

// ---- REFRESH ---------------------------------------------------------------

async function handleRefresh(req: Request): Promise<Response> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Not signed in." }, 401);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Not signed in." }, 401);
  const userId = userData.user.id;
  const db = admin();

  const { data: cred } = await db
    .from("youtube_credentials")
    .select("youtube_refresh_token")
    .eq("user_id", userId)
    .maybeSingle();
  const refreshToken = String((cred as { youtube_refresh_token?: string } | null)?.youtube_refresh_token ?? "");
  if (!refreshToken) return json({ refreshed: false, error: "YouTube session expired. Please reconnect." }, 200);

  try {
    const fresh = await refreshAccessToken(refreshToken);
    const ch = await fetchMyChannel(fresh.access_token);
    if (!ch) return json({ refreshed: false, error: "Couldn't read your channel right now." }, 200);

    const patch = await channelPatch(ch);
    await db.from("profiles").update(patch).eq("id", userId);
    await db.from("youtube_credentials").update({
      youtube_access_token: fresh.access_token,
      youtube_token_expires_at: fresh.expires_in
        ? new Date(Date.now() + fresh.expires_in * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId);

    return json({ refreshed: true, title: ch.title, subscribers: ch.subscribers });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Couldn't refresh YouTube right now.";
    return json({ refreshed: false, error: message.slice(0, 160) }, 200);
  }
}

// ---- Router ----------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = new URL(req.url);
  if (url.pathname.endsWith("/callback")) return handleCallback(url);

  if (req.method === "POST") {
    let action = "start";
    try {
      const b = await req.clone().json();
      action = String((b as { action?: string })?.action ?? "start");
    } catch { /* default start */ }
    if (action === "refresh") return handleRefresh(req);
    return handleStart(req);
  }
  return json({ error: "Method not allowed" }, 405);
});
