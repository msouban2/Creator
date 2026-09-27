// Supabase Edge Function: youtube-verify
// -----------------------------------------------------------------------------
// Proves a creator OWNS a YouTube channel WITHOUT OAuth: they paste a one-time
// code into the channel's About/description, and we read the description with
// our YouTube Data API key and confirm the code is present. No Google sign-in,
// no OAuth approval — just the API key we already have.
//
// Actions (POST JSON { action, ... }, with the caller's Supabase JWT):
//   • "start" { channel }  — resolve the channel, issue a code, remember the
//                            target channel. Returns { channelId, channelTitle, code }.
//   • "check" {}           — re-read the remembered channel's description; if it
//                            contains the code, mark verified + store real stats.
//
// Secret: YOUTUBE_API_KEY (already set). Deploy WITHOUT JWT verification (we
// verify the JWT ourselves): supabase functions deploy youtube-verify --no-verify-jwt
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

// ---- YouTube channel resolution (handle / URL / name -> channel id) --------
type Target = { id?: string; handle?: string; query?: string };
function parseYouTube(input: string): Target {
  const v = input.trim();
  let m = v.match(/youtube\.com\/channel\/(UC[\w-]+)/i);
  if (m) return { id: m[1] };
  m = v.match(/youtube\.com\/@([\w.\-]+)/i) || v.match(/^@([\w.\-]+)$/);
  if (m) return { handle: m[1] };
  m = v.match(/youtube\.com\/(?:c|user)\/([\w.\-]+)/i);
  if (m) return { query: m[1] };
  if (/^[\w.\-]+$/.test(v)) return { handle: v };
  return { query: v };
}

async function resolveChannelId(input: string): Promise<string | null> {
  const t = parseYouTube(input);
  if (t.id) return t.id;
  if (t.handle) {
    const r = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(t.handle)}&key=${YT_KEY}`
    );
    const d = await r.json();
    const id = d?.items?.[0]?.id;
    if (id) return id;
    t.query = t.handle;
  }
  if (t.query) {
    const r = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=1&q=${encodeURIComponent(
        t.query
      )}&key=${YT_KEY}`
    );
    const d = await r.json();
    return d?.items?.[0]?.id?.channelId ?? null;
  }
  return null;
}

async function fetchChannel(channelId: string): Promise<{
  title: string;
  description: string;
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
    description: String(item.snippet?.description ?? ""),
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

function makeCode(): string {
  const s = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c = "";
  for (let i = 0; i < 6; i++) c += s[Math.floor(Math.random() * s.length)];
  return `bilkul-verify-${c}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!YT_KEY) return json({ error: "YouTube is not configured on the server yet." }, 500);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Not signed in." }, 401);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Not signed in." }, 401);
  const userId = userData.user.id;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body.action ?? "");
  const db = admin();

  // -------------------------- START: issue a code --------------------------
  if (action === "start") {
    const input = String(body.channel ?? "").trim();
    if (!input) return json({ error: "Enter your YouTube channel handle or link." }, 400);

    const channelId = await resolveChannelId(input);
    if (!channelId) return json({ error: "Couldn't find that channel. Check the handle or link." }, 200);

    const ch = await fetchChannel(channelId);
    if (!ch) return json({ error: "Couldn't read that channel." }, 200);

    const code = makeCode();
    await db
      .from("profiles")
      .update({ youtube_verify_code: code, youtube_verify_channel_id: channelId })
      .eq("id", userId);

    return json({ channelId, channelTitle: ch.title, code });
  }

  // -------------------------- CHECK: confirm the code ----------------------
  if (action === "check") {
    const { data: prof } = await db
      .from("profiles")
      .select("youtube_verify_code, youtube_verify_channel_id")
      .eq("id", userId)
      .maybeSingle();
    const p = (prof ?? {}) as { youtube_verify_code?: string; youtube_verify_channel_id?: string };
    if (!p.youtube_verify_code || !p.youtube_verify_channel_id) {
      return json({ verified: false, error: "Start verification first." }, 200);
    }

    const ch = await fetchChannel(p.youtube_verify_channel_id);
    if (!ch) return json({ verified: false, error: "Couldn't read your channel. Try again." }, 200);

    if (!ch.description.includes(p.youtube_verify_code)) {
      return json({
        verified: false,
        error: "Code not found in your channel description yet. Add it, save, then try again (it can take a minute).",
      });
    }

    // One channel per account.
    const { data: existing } = await db
      .from("profiles")
      .select("id")
      .eq("youtube_channel_id", p.youtube_verify_channel_id)
      .neq("id", userId)
      .maybeSingle();
    if (existing) {
      return json({ verified: false, error: "This channel is already connected to another Bilkul account." }, 200);
    }

    const averages = ch.uploads
      ? await recentAverages(ch.uploads)
      : { avg_views: null, avg_likes: null, engagement_rate: null };

    const patch: Record<string, unknown> = {
      youtube_channel_id: p.youtube_verify_channel_id,
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

    await db.from("profiles").update(patch).eq("id", userId);

    return json({ verified: true, title: ch.title, subscribers: ch.subscribers });
  }

  // -------------------------- REFRESH: re-pull live stats ------------------
  // For an already-verified channel: re-read the current subscriber count and
  // analytics from YouTube and store them. No code needed — ownership was
  // already proven at verification time.
  if (action === "refresh") {
    const { data: prof } = await db
      .from("profiles")
      .select("youtube_channel_id")
      .eq("id", userId)
      .maybeSingle();
    const channelId = (prof as { youtube_channel_id?: string } | null)?.youtube_channel_id;
    if (!channelId) {
      return json({ refreshed: false, error: "No verified YouTube channel to refresh." }, 200);
    }

    const ch = await fetchChannel(channelId);
    if (!ch) return json({ refreshed: false, error: "Couldn't read your channel right now." }, 200);

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

    return json({ refreshed: true, title: ch.title, subscribers: ch.subscribers });
  }

  return json({ error: "Unknown action." }, 400);
});
