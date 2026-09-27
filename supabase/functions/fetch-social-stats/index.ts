// Supabase Edge Function: fetch-social-stats
// -----------------------------------------------------------------------------
// Securely fetches follower/subscriber counts on the server so API keys and
// access tokens never live in the mobile app.
//
//  POST body: {
//    youtube_channel?: string,    // @handle, channel URL, or channel name
//    instagram_username?: string, // public @username or profile URL (no login)
//    instagram_token?: string     // OAuth access token from Meta (optional)
//  }
//  Response:  { youtube_subscribers?: number|null, instagram_followers?: number|null, errors?: string[] }
//
// Required secret (set in Supabase → Project Settings → Edge Functions → Secrets):
//    YOUTUBE_API_KEY   — a free YouTube Data API v3 key from Google Cloud
//
// Deploy:  supabase functions deploy fetch-social-stats
// -----------------------------------------------------------------------------

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

// ---- YouTube ---------------------------------------------------------------

type YouTubeTarget = { id?: string; handle?: string; query?: string };

function parseYouTube(input: string): YouTubeTarget {
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

export interface YouTubeStats {
  subscribers: number | null;
  views: number | null;
  video_count: number | null;
  avg_views: number | null;
  avg_likes: number | null;
  engagement_rate: number | null;
}

const EMPTY_YT: YouTubeStats = {
  subscribers: null,
  views: null,
  video_count: null,
  avg_views: null,
  avg_likes: null,
  engagement_rate: null,
};

// Averages views + likes across the channel's most recent uploads and derives
// an engagement rate (likes per view). Best-effort — never throws.
async function recentVideoAverages(
  uploadsPlaylistId: string,
  key: string,
): Promise<{ avg_views: number | null; avg_likes: number | null; engagement_rate: number | null }> {
  try {
    const listUrl =
      `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=10` +
      `&playlistId=${encodeURIComponent(uploadsPlaylistId)}&key=${key}`;
    const listRes = await fetch(listUrl);
    const listData = await listRes.json();
    const ids: string[] = (listData?.items ?? [])
      .map((i: { contentDetails?: { videoId?: string } }) => i?.contentDetails?.videoId)
      .filter(Boolean);
    if (ids.length === 0) return { avg_views: null, avg_likes: null, engagement_rate: null };

    const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${ids.join(",")}&key=${key}`;
    const statsRes = await fetch(statsUrl);
    const statsData = await statsRes.json();
    const items: { statistics?: { viewCount?: string; likeCount?: string } }[] = statsData?.items ?? [];
    if (items.length === 0) return { avg_views: null, avg_likes: null, engagement_rate: null };

    let totalViews = 0;
    let totalLikes = 0;
    for (const it of items) {
      totalViews += Number(it.statistics?.viewCount ?? 0);
      totalLikes += Number(it.statistics?.likeCount ?? 0);
    }
    const avgViews = Math.round(totalViews / items.length);
    const avgLikes = Math.round(totalLikes / items.length);
    const engagement = avgViews > 0 ? Math.round((avgLikes / avgViews) * 10000) / 100 : null; // % with 2 decimals
    return { avg_views: avgViews, avg_likes: avgLikes, engagement_rate: engagement };
  } catch {
    return { avg_views: null, avg_likes: null, engagement_rate: null };
  }
}

async function statsForChannelId(id: string, key: string): Promise<YouTubeStats> {
  const url = `https://www.googleapis.com/youtube/v3/channels?part=statistics,contentDetails&id=${id}&key=${key}`;
  const res = await fetch(url);
  const data = await res.json();
  const item = data?.items?.[0];
  const s = item?.statistics;
  if (!s) return EMPTY_YT;

  const subscribers = s.hiddenSubscriberCount ? null : Number(s.subscriberCount ?? 0);
  const views = s.viewCount != null ? Number(s.viewCount) : null;
  const videoCount = s.videoCount != null ? Number(s.videoCount) : null;

  const uploads = item?.contentDetails?.relatedPlaylists?.uploads;
  const averages = uploads
    ? await recentVideoAverages(uploads, key)
    : { avg_views: null, avg_likes: null, engagement_rate: null };

  return { subscribers, views, video_count: videoCount, ...averages };
}

async function fetchYouTube(input: string, key: string): Promise<YouTubeStats> {
  const target = parseYouTube(input);

  if (target.id) return statsForChannelId(target.id, key);

  if (target.handle) {
    const url = `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(
      target.handle,
    )}&key=${key}`;
    const res = await fetch(url);
    const data = await res.json();
    const channelId = data?.items?.[0]?.id;
    if (channelId) return statsForChannelId(channelId, key);
    // fall through to search if handle didn't resolve
    target.query = target.handle;
  }

  if (target.query) {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=1&q=${encodeURIComponent(
      target.query,
    )}&key=${key}`;
    const res = await fetch(url);
    const data = await res.json();
    const channelId = data?.items?.[0]?.id?.channelId;
    if (channelId) return statsForChannelId(channelId, key);
  }

  return EMPTY_YT;
}

// ---- Instagram (public profile, no login) ----------------------------------
// Best-effort read of a public account's follower count straight from the
// username. No creator login required. This is unofficial, so it can fail or
// be rate-limited — callers should let a human confirm/override the number.

function cleanInstagramUsername(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/[/?#].*$/, "")
    .replace(/^@/, "")
    .trim();
}

async function fetchInstagramPublic(usernameOrUrl: string): Promise<number | null> {
  const username = cleanInstagramUsername(usernameOrUrl);
  if (!username) return null;
  try {
    const res = await fetch(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
      {
        headers: {
          // Public web app id Instagram's own site sends with this request.
          "x-ig-app-id": "936619743392459",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "application/json",
        },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const count = data?.data?.user?.edge_followed_by?.count;
    return typeof count === "number" ? count : null;
  } catch {
    return null;
  }
}

// ---- Instagram (official Graph API) ----------------------------------------
// Works with either "Instagram API with Instagram Login" tokens
// (graph.instagram.com) or Facebook-Login-for-Business tokens (Pages).

async function fetchInstagram(token: string): Promise<number | null> {
  // 1) Instagram Login token
  try {
    const url = `https://graph.instagram.com/me?fields=followers_count,username&access_token=${encodeURIComponent(
      token
    )}`;
    const res = await fetch(url);
    const data = await res.json();
    if (typeof data?.followers_count === "number") return data.followers_count;
  } catch {
    // ignore, try the next method
  }

  // 2) Facebook Login for Business → Page → IG business account
  try {
    const url = `https://graph.facebook.com/v21.0/me/accounts?fields=instagram_business_account{followers_count,username}&access_token=${encodeURIComponent(
      token
    )}`;
    const res = await fetch(url);
    const data = await res.json();
    for (const page of data?.data ?? []) {
      const count = page?.instagram_business_account?.followers_count;
      if (typeof count === "number") return count;
    }
  } catch {
    // ignore
  }

  return null;
}

// ---- Handler ---------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let payload: { youtube_channel?: string; instagram_username?: string; instagram_token?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const errors: string[] = [];
  const result: {
    youtube_subscribers?: number | null;
    youtube?: YouTubeStats;
    instagram_followers?: number | null;
  } = {};

  if (payload.youtube_channel) {
    const key = Deno.env.get("YOUTUBE_API_KEY");
    if (!key) {
      errors.push("YOUTUBE_API_KEY is not configured.");
    } else {
      try {
        const yt = await fetchYouTube(payload.youtube_channel, key);
        result.youtube = yt;
        result.youtube_subscribers = yt.subscribers; // backward compat
      } catch (e) {
        errors.push(`YouTube: ${e instanceof Error ? e.message : "lookup failed"}`);
      }
    }
  }

  if (payload.instagram_token) {
    try {
      result.instagram_followers = await fetchInstagram(payload.instagram_token);
    } catch (e) {
      errors.push(`Instagram: ${e instanceof Error ? e.message : "lookup failed"}`);
    }
  } else if (payload.instagram_username) {
    try {
      result.instagram_followers = await fetchInstagramPublic(payload.instagram_username);
      if (result.instagram_followers == null) {
        errors.push("Instagram: couldn't read followers (private/blocked). Enter it manually.");
      }
    } catch (e) {
      errors.push(`Instagram: ${e instanceof Error ? e.message : "lookup failed"}`);
    }
  }

  return json({ ...result, errors: errors.length ? errors : undefined });
});
