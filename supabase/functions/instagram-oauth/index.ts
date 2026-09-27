// Supabase Edge Function: instagram-oauth
// -----------------------------------------------------------------------------
// Connects a creator's Instagram Business/Creator account using the official
// "Instagram API with Instagram Login" and fetches their real followers_count.
//
// The Instagram app secret and the OAuth token exchange stay on the server —
// the phone never sees them.
//
//  Two entry points (same function):
//
//   1) START  — POST { action: "start", app_redirect: "aaina://personal-info" }
//               (called from the app; must include the user's Supabase JWT in
//               the Authorization header — supabase.functions.invoke does this
//               automatically). Returns { url } to open in a browser.
//
//   2) CALLBACK — GET .../instagram-oauth/callback?code=...&state=...
//               (Instagram redirects the browser here). Exchanges the code for
//               a long-lived token, reads followers_count, updates the profile,
//               then redirects the browser back to the app deep link.
//
// Required secrets (Supabase → Project Settings → Edge Functions → Secrets):
//    IG_CLIENT_ID       — the Instagram app ID (Instagram Business Login)
//    IG_CLIENT_SECRET   — the Instagram app secret
//    IG_REDIRECT_URI    — must EXACTLY match a valid OAuth redirect URI in the
//                         Meta app, e.g.
//                         https://<ref>.supabase.co/functions/v1/instagram-oauth/callback
//    SUPABASE_URL             — provided automatically by Supabase
//    SUPABASE_SERVICE_ROLE_KEY — provided automatically by Supabase
//    SUPABASE_ANON_KEY         — provided automatically by Supabase
//
// Deploy WITHOUT JWT verification (the callback is hit by a browser with no JWT):
//    supabase functions deploy instagram-oauth --no-verify-jwt
// -----------------------------------------------------------------------------

import { createClient } from "jsr:@supabase/supabase-js@2";

const IG_CLIENT_ID = Deno.env.get("IG_CLIENT_ID") ?? "";
const IG_CLIENT_SECRET = Deno.env.get("IG_CLIENT_SECRET") ?? "";
const IG_REDIRECT_URI = Deno.env.get("IG_REDIRECT_URI") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const IG_SCOPE = "instagram_business_basic,instagram_business_manage_insights";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Admin client (bypasses RLS) for writing the profile + state rows.
const admin = () => createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

// Sends the browser back into the app via the deep link.
//
// The primary mechanism is an HTTP 302 redirect whose Location is the app's
// custom scheme (aaina://…). Both iOS ASWebAuthenticationSession and Android
// Chrome Custom Tabs — which is what expo-web-browser's openAuthSessionAsync
// uses — reliably intercept an HTTP-level redirect to the return scheme and
// hand control back to the app. (A JavaScript location.href to a custom scheme
// on page load is blocked by Android without a user gesture, which is why the
// old 200 + JS approach could leave users stranded on this page.)
//
// The HTML body is only shown if the redirect is somehow not followed; it adds
// a meta refresh, an immediate JS redirect, and a tappable link as fallbacks.
function bounce(appUrl: string, message: string): Response {
  const safeUrl = appUrl.replace(/"/g, "%22");
  const html = `<!doctype html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="refresh" content="0;url=${safeUrl}" />
<title>Aaina</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0f0b1e;color:#fff;
display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;text-align:center}
.card{max-width:340px;padding:28px}a{color:#B9A7FF}</style></head>
<body><div class="card">
<h2>${message}</h2>
<p>Returning you to Aaina…</p>
<p><a href="${safeUrl}">Tap here if it doesn't happen automatically.</a></p>
<script>location.replace("${safeUrl}");</script>
</div></body></html>`;
  return new Response(html, {
    status: 302,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/html; charset=utf-8",
      "Location": appUrl,
      "Cache-Control": "no-store",
    },
  });
}

function withParams(base: string, params: Record<string, string | number>): string {
  const sep = base.includes("?") ? "&" : "?";
  const q = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return `${base}${sep}${q}`;
}

// ---- START: build the Instagram authorize URL ------------------------------

async function handleStart(req: Request): Promise<Response> {
  if (!IG_CLIENT_ID || !IG_REDIRECT_URI) {
    return json({ error: "Instagram is not configured on the server yet." }, 500);
  }

  // Identify the signed-in creator from their JWT.
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Not signed in." }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Not signed in." }, 401);

  let body: { app_redirect?: string } = {};
  try {
    body = await req.json();
  } catch {
    // no body — fine, we'll use a default deep link
  }
  const appRedirect = (body.app_redirect || "aaina://personal-info").trim();

  // One-time random state that ties the callback back to this user.
  const state = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const db = admin();
  const { error: insErr } = await db.from("instagram_oauth_states").insert({
    state,
    user_id: userData.user.id,
    app_redirect: appRedirect,
  });
  if (insErr) return json({ error: "Could not start Instagram connection." }, 500);

  const url = withParams("https://www.instagram.com/oauth/authorize", {
    client_id: IG_CLIENT_ID,
    redirect_uri: IG_REDIRECT_URI,
    response_type: "code",
    scope: IG_SCOPE,
    state,
  });
  return json({ url });
}

// ---- CALLBACK: exchange the code and store the follower count --------------

async function exchangeShortLivedToken(code: string): Promise<{ access_token: string; user_id: string }> {
  const form = new URLSearchParams();
  form.set("client_id", IG_CLIENT_ID);
  form.set("client_secret", IG_CLIENT_SECRET);
  form.set("grant_type", "authorization_code");
  form.set("redirect_uri", IG_REDIRECT_URI);
  form.set("code", code);

  const res = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const data = await res.json();
  if (!res.ok || !data?.access_token) {
    throw new Error(data?.error_message || data?.error?.message || "Token exchange failed.");
  }
  return { access_token: String(data.access_token), user_id: String(data.user_id ?? "") };
}

async function exchangeLongLivedToken(shortToken: string): Promise<{ access_token: string; expires_in: number }> {
  const url = withParams("https://graph.instagram.com/access_token", {
    grant_type: "ig_exchange_token",
    client_secret: IG_CLIENT_SECRET,
    access_token: shortToken,
  });
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || !data?.access_token) {
    throw new Error(data?.error?.message || "Could not create a long-lived token.");
  }
  return { access_token: data.access_token, expires_in: Number(data.expires_in ?? 0) };
}

async function fetchIgProfile(token: string): Promise<{
  user_id: string;
  username: string;
  followers_count: number | null;
  account_type: string | null;
}> {
  const url = withParams("https://graph.instagram.com/me", {
    fields: "user_id,username,account_type,followers_count",
    access_token: token,
  });
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || "Could not read your Instagram profile.");
  }
  return {
    user_id: String(data.user_id ?? ""),
    username: String(data.username ?? ""),
    followers_count: typeof data.followers_count === "number" ? data.followers_count : null,
    account_type: data.account_type ?? null,
  };
}

// ---- Instagram insights ----------------------------------------------------
// Best-effort analytics for the connected account. Every call is wrapped so a
// failure in any single metric never breaks the connect flow — we just store
// whatever we could read and leave the rest null.

const IG_GRAPH = "https://graph.instagram.com";

// Reads one account-level insight (e.g. "reach", "profile_views") and returns a
// single total number, tolerating the two response shapes the API can return.
async function fetchAccountMetric(
  igId: string,
  token: string,
  metric: string,
  period: string,
): Promise<number | null> {
  try {
    const url = withParams(`${IG_GRAPH}/${igId}/insights`, {
      metric,
      period,
      metric_type: "total_value",
      access_token: token,
    });
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok || !Array.isArray(data?.data) || data.data.length === 0) return null;
    const row = data.data[0];
    if (row?.total_value && typeof row.total_value.value === "number") {
      return row.total_value.value;
    }
    if (Array.isArray(row?.values)) {
      return row.values.reduce((sum: number, v: { value?: number }) => sum + (v?.value ?? 0), 0);
    }
    return null;
  } catch {
    return null;
  }
}

// Pulls the most recent posts and averages likes/comments to derive an
// engagement rate against the follower count.
async function fetchMediaAverages(
  igId: string,
  token: string,
  followers: number | null,
): Promise<{
  avg_likes: number | null;
  avg_comments: number | null;
  engagement_rate: number | null;
}> {
  try {
    const url = withParams(`${IG_GRAPH}/${igId}/media`, {
      fields: "id,like_count,comments_count",
      limit: 12,
      access_token: token,
    });
    const res = await fetch(url);
    const data = await res.json();
    const items: { like_count?: number; comments_count?: number }[] = Array.isArray(data?.data) ? data.data : [];
    if (items.length === 0) return { avg_likes: null, avg_comments: null, engagement_rate: null };

    const totalLikes = items.reduce((s, m) => s + (m.like_count ?? 0), 0);
    const totalComments = items.reduce((s, m) => s + (m.comments_count ?? 0), 0);
    const avgLikes = Math.round(totalLikes / items.length);
    const avgComments = Math.round(totalComments / items.length);

    let engagement: number | null = null;
    if (followers && followers > 0) {
      engagement = Math.round(((avgLikes + avgComments) / followers) * 10000) / 100; // % with 2 decimals
    }
    return { avg_likes: avgLikes, avg_comments: avgComments, engagement_rate: engagement };
  } catch {
    return { avg_likes: null, avg_comments: null, engagement_rate: null };
  }
}

// Gathers all insight metrics into a profile patch. Never throws.
async function fetchInsightsPatch(
  igId: string,
  token: string,
  followers: number | null,
): Promise<Record<string, unknown>> {
  if (!igId) return {};
  const [reach, profileViews, media] = await Promise.all([
    fetchAccountMetric(igId, token, "reach", "days_28"),
    fetchAccountMetric(igId, token, "profile_views", "day"),
    fetchMediaAverages(igId, token, followers),
  ]);

  const patch: Record<string, unknown> = { ig_insights_synced_at: new Date().toISOString() };
  if (reach != null) patch.ig_reach = reach;
  if (profileViews != null) patch.ig_profile_views = profileViews;
  if (media.avg_likes != null) patch.ig_avg_likes = media.avg_likes;
  if (media.avg_comments != null) patch.ig_avg_comments = media.avg_comments;
  if (media.engagement_rate != null) patch.ig_engagement_rate = media.engagement_rate;
  return patch;
}

async function handleCallback(url: URL): Promise<Response> {
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const oauthError = url.searchParams.get("error_description") || url.searchParams.get("error");

  const db = admin();

  // Look up who started this flow (and where to send them back).
  let appRedirect = "aaina://personal-info";
  let userId = "";
  if (state) {
    const { data: row } = await db
      .from("instagram_oauth_states")
      .select("user_id, app_redirect")
      .eq("state", state)
      .maybeSingle();
    if (row) {
      userId = row.user_id as string;
      appRedirect = (row.app_redirect as string) || appRedirect;
    }
  }

  // Always clean up the one-time state row.
  const cleanup = async () => {
    if (state) await db.from("instagram_oauth_states").delete().eq("state", state);
  };

  if (oauthError) {
    await cleanup();
    return bounce(withParams(appRedirect, { instagram: "error" }), "Instagram connection cancelled.");
  }
  if (!state || !userId || !code) {
    await cleanup();
    return bounce(withParams(appRedirect, { instagram: "error" }), "Instagram connection expired. Please try again.");
  }

  try {
    const shortLived = await exchangeShortLivedToken(code);
    const longLived = await exchangeLongLivedToken(shortLived.access_token);
    const profile = await fetchIgProfile(longLived.access_token);

    const expiresAt = longLived.expires_in
      ? new Date(Date.now() + longLived.expires_in * 1000).toISOString()
      : null;

    const patch: Record<string, unknown> = {
      instagram_user_id: profile.user_id || shortLived.user_id || null,
      instagram_username: profile.username || null,
      instagram_url: profile.username ? `https://instagram.com/${profile.username}` : null,
      instagram_connected_at: new Date().toISOString(),
    };
    if (profile.followers_count != null) patch.instagram_followers = profile.followers_count;

    // Best-effort: also pull analytics (reach, profile views, avg engagement) so
    // the admin dashboard shows real insights right after connecting. Never fails
    // the connect flow — insights are simply left blank if the API rejects them.
    const igId = String(patch.instagram_user_id ?? "");

    // Enforce one Instagram account per app account: reject if this Instagram
    // account is already linked to a different profile.
    if (igId) {
      const { data: existing } = await db
        .from("profiles")
        .select("id")
        .eq("instagram_user_id", igId)
        .neq("id", userId)
        .maybeSingle();
      if (existing) {
        await cleanup();
        return bounce(
          withParams(appRedirect, { instagram: "error" }),
          "This Instagram account is already connected to another Aaina account."
        );
      }
    }

    const insights = await fetchInsightsPatch(igId, longLived.access_token, profile.followers_count);
    Object.assign(patch, insights);

    const { error: updErr } = await db.from("profiles").update(patch).eq("id", userId);
    // The access token is stored in a separate, service-role-only table so it
    // is never exposed through the staff-readable profiles row.
    const { error: tokErr } = await db.from("instagram_credentials").upsert({
      user_id: userId,
      instagram_token: longLived.access_token,
      instagram_token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    });
    await cleanup();
    if (updErr || tokErr) {
      // 23505 = unique_violation (this IG account got linked elsewhere in a race).
      const dupe = (updErr as { code?: string } | null)?.code === "23505";
      return bounce(
        withParams(appRedirect, { instagram: "error" }),
        dupe
          ? "This Instagram account is already connected to another Aaina account."
          : "Couldn't save your Instagram details."
      );
    }

    const followers = profile.followers_count ?? "";
    return bounce(
      withParams(appRedirect, { instagram: "connected", followers, username: profile.username }),
      "Instagram connected!"
    );
  } catch (e) {
    await cleanup();
    const message = e instanceof Error ? e.message : "Instagram connection failed.";
    return bounce(withParams(appRedirect, { instagram: "error" }), message.slice(0, 120));
  }
}

// ---- REFRESH: re-pull followers + insights for a connected account ---------

async function handleRefresh(req: Request): Promise<Response> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Not signed in." }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Not signed in." }, 401);
  const userId = userData.user.id;
  const db = admin();

  const { data: prof } = await db
    .from("profiles")
    .select("instagram_user_id")
    .eq("id", userId)
    .maybeSingle();
  const igId = String((prof as { instagram_user_id?: string } | null)?.instagram_user_id ?? "");
  if (!igId) return json({ refreshed: false, error: "No connected Instagram account to refresh." }, 200);

  const { data: cred } = await db
    .from("instagram_credentials")
    .select("instagram_token")
    .eq("user_id", userId)
    .maybeSingle();
  const igToken = String((cred as { instagram_token?: string } | null)?.instagram_token ?? "");
  if (!igToken) return json({ refreshed: false, error: "Instagram session expired. Please reconnect." }, 200);

  try {
    const profile = await fetchIgProfile(igToken);
    const patch: Record<string, unknown> = {};
    if (profile.username) {
      patch.instagram_username = profile.username;
      patch.instagram_url = `https://instagram.com/${profile.username}`;
    }
    if (profile.followers_count != null) patch.instagram_followers = profile.followers_count;

    const insights = await fetchInsightsPatch(igId, igToken, profile.followers_count);
    Object.assign(patch, insights);

    await db.from("profiles").update(patch).eq("id", userId);
    return json({ refreshed: true, followers: profile.followers_count ?? null });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Couldn't refresh Instagram right now.";
    return json({ refreshed: false, error: message.slice(0, 160) }, 200);
  }
}

// ---- Router ----------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  if (url.pathname.endsWith("/callback")) {
    return handleCallback(url);
  }
  if (req.method === "POST") {
    let action = "start";
    try {
      const b = await req.clone().json();
      action = String((b as { action?: string })?.action ?? "start");
    } catch {
      // no/invalid body — default to start
    }
    if (action === "refresh") return handleRefresh(req);
    return handleStart(req);
  }
  return json({ error: "Method not allowed" }, 405);
});
