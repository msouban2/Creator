// Supabase Edge Function: admin-refresh-insights
// -----------------------------------------------------------------------------
// Lets an admin / employee re-pull a creator's Instagram or YouTube insights
// from the admin dashboard, in case the creator can't do it themselves.
//
// POST JSON { user_id, platform: "instagram" | "youtube" } with the caller's
// Supabase JWT. The caller MUST be an admin or employee. Writes are done with
// the service role.
//
// Secrets: YOUTUBE_API_KEY (already set). Deploy WITHOUT JWT verification (we
// verify + role-check the JWT ourselves).
// -----------------------------------------------------------------------------

import { createClient } from "jsr:@supabase/supabase-js@2";

const YT_KEY = Deno.env.get("YOUTUBE_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const admin = () => createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

function withParams(base: string, params: Record<string, string | number>): string {
  const sep = base.includes("?") ? "&" : "?";
  const q = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return `${base}${sep}${q}`;
}

// ---- YouTube -------------------------------------------------------------
async function fetchChannel(channelId: string): Promise<{
  title: string;
  subscribers: number | null;
  views: number | null;
  videoCount: number | null;
  uploads: string | null;
} | null> {
  const r = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${channelId}&key=${YT_KEY}`
  );
  const d = await r.json();
  const item = d?.items?.[0];
  if (!item) return null;
  const s = item.statistics ?? {};
  return {
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
    let tv = 0,
      tl = 0;
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

async function refreshYouTube(db: ReturnType<typeof admin>, userId: string) {
  const { data: prof } = await db
    .from("profiles")
    .select("youtube_channel_id")
    .eq("id", userId)
    .maybeSingle();
  const channelId = (prof as { youtube_channel_id?: string } | null)?.youtube_channel_id;
  if (!channelId) return json({ refreshed: false, error: "This creator has no verified YouTube channel." }, 200);

  const ch = await fetchChannel(channelId);
  if (!ch) return json({ refreshed: false, error: "Couldn't read the channel from YouTube right now." }, 200);

  const averages = ch.uploads
    ? await recentAverages(ch.uploads)
    : { avg_views: null, avg_likes: null, engagement_rate: null };

  const patch: Record<string, unknown> = {
    youtube_channel_title: ch.title,
    youtube_channel: ch.title,
    yt_insights_synced_at: new Date().toISOString(),
  };
  if (ch.subscribers != null) patch.youtube_subscribers = ch.subscribers;
  if (ch.views != null) patch.youtube_views = ch.views;
  if (ch.videoCount != null) patch.youtube_video_count = ch.videoCount;
  if (averages.avg_views != null) patch.youtube_avg_views = averages.avg_views;
  if (averages.avg_likes != null) patch.youtube_avg_likes = averages.avg_likes;
  if (averages.engagement_rate != null) patch.youtube_engagement_rate = averages.engagement_rate;

  await db.from("profiles").update(patch).eq("id", userId);
  return json({ refreshed: true, platform: "youtube", patch });
}

// ---- Instagram -----------------------------------------------------------
const IG_GRAPH = "https://graph.instagram.com";

async function fetchIgProfile(token: string): Promise<{
  username: string;
  followers_count: number | null;
}> {
  const url = withParams(`${IG_GRAPH}/me`, {
    fields: "user_id,username,account_type,followers_count",
    access_token: token,
  });
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Could not read the Instagram profile.");
  return {
    username: String(data.username ?? ""),
    followers_count: typeof data.followers_count === "number" ? data.followers_count : null,
  };
}

async function fetchAccountMetric(igId: string, token: string, metric: string, period: string): Promise<number | null> {
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
    if (row?.total_value && typeof row.total_value.value === "number") return row.total_value.value;
    if (Array.isArray(row?.values)) {
      return row.values.reduce((sum: number, v: { value?: number }) => sum + (v?.value ?? 0), 0);
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchMediaAverages(
  igId: string,
  token: string,
  followers: number | null,
): Promise<{ avg_likes: number | null; avg_comments: number | null; engagement_rate: number | null }> {
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
      engagement = Math.round(((avgLikes + avgComments) / followers) * 10000) / 100;
    }
    return { avg_likes: avgLikes, avg_comments: avgComments, engagement_rate: engagement };
  } catch {
    return { avg_likes: null, avg_comments: null, engagement_rate: null };
  }
}

async function refreshInstagram(db: ReturnType<typeof admin>, userId: string) {
  const { data: prof } = await db
    .from("profiles")
    .select("instagram_user_id")
    .eq("id", userId)
    .maybeSingle();
  const igId = String((prof as { instagram_user_id?: string } | null)?.instagram_user_id ?? "");
  if (!igId) return json({ refreshed: false, error: "This creator hasn't connected Instagram." }, 200);

  const { data: cred } = await db
    .from("instagram_credentials")
    .select("instagram_token")
    .eq("user_id", userId)
    .maybeSingle();
  const igToken = String((cred as { instagram_token?: string } | null)?.instagram_token ?? "");
  if (!igToken) return json({ refreshed: false, error: "Instagram token expired. The creator must reconnect." }, 200);

  try {
    const profile = await fetchIgProfile(igToken);
    const [reach, profileViews, media] = await Promise.all([
      fetchAccountMetric(igId, igToken, "reach", "days_28"),
      fetchAccountMetric(igId, igToken, "profile_views", "day"),
      fetchMediaAverages(igId, igToken, profile.followers_count),
    ]);

    const patch: Record<string, unknown> = { ig_insights_synced_at: new Date().toISOString() };
    if (profile.username) {
      patch.instagram_username = profile.username;
      patch.instagram_url = `https://instagram.com/${profile.username}`;
    }
    if (profile.followers_count != null) patch.instagram_followers = profile.followers_count;
    if (reach != null) patch.ig_reach = reach;
    if (profileViews != null) patch.ig_profile_views = profileViews;
    if (media.avg_likes != null) patch.ig_avg_likes = media.avg_likes;
    if (media.avg_comments != null) patch.ig_avg_comments = media.avg_comments;
    if (media.engagement_rate != null) patch.ig_engagement_rate = media.engagement_rate;

    await db.from("profiles").update(patch).eq("id", userId);
    return json({ refreshed: true, platform: "instagram", patch });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Couldn't refresh Instagram right now.";
    return json({ refreshed: false, error: message.slice(0, 160) }, 200);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Not signed in." }, 401);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: "Bearer " + token } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Not signed in." }, 401);

  const db = admin();

  // Role check: only admins / employees may refresh someone else's insights.
  const { data: me } = await db.from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
  const role = (me as { role?: string } | null)?.role;
  if (role !== "admin" && role !== "employee") {
    return json({ error: "Not authorized." }, 403);
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const userId = String(body.user_id ?? "").trim();
  const platform = String(body.platform ?? "").trim();
  if (!userId) return json({ error: "Missing user_id." }, 400);

  if (platform === "youtube") {
    if (!YT_KEY) return json({ refreshed: false, error: "YouTube is not configured on the server." }, 500);
    return await refreshYouTube(db, userId);
  }
  if (platform === "instagram") {
    return await refreshInstagram(db, userId);
  }
  return json({ error: "Unknown platform." }, 400);
});
