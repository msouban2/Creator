// Supabase Edge Function: insightiq-sync
// -----------------------------------------------------------------------------
// Step 3 of the InsightIQ (Phyllo) Connect flow.
//
// After the creator finishes InsightIQ Connect, the app calls this with the
// returned { account_id }. We:
//   1) verify the caller,
//   2) persist the account id against the creator,
//   3) fetch Identity (profile → followers, username, engagement) and Audience
//      (demographics), then write them into the existing profiles.ig_* columns
//      that the Profile screen already renders.
//
// This is also called by insightiq-webhook when InsightIQ signals fresh data.
//
// Secrets: INSIGHTIQ_CLIENT_ID, INSIGHTIQ_CLIENT_SECRET, INSIGHTIQ_BASE_URL
// -----------------------------------------------------------------------------

import { createClient } from "jsr:@supabase/supabase-js@2";

const CLIENT_ID = Deno.env.get("INSIGHTIQ_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("INSIGHTIQ_CLIENT_SECRET") ?? "";
const BASE_URL = (Deno.env.get("INSIGHTIQ_BASE_URL") ?? "https://api.sandbox.insightiq.ai").replace(/\/+$/, "");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const admin = () => createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const authHeader = () => "Basic " + btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);

async function iq(path: string) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

const num = (v: unknown): number | null =>
  typeof v === "number" && isFinite(v) ? v : v != null && !isNaN(Number(v)) ? Number(v) : null;

// Pull a profile object out of whatever shape InsightIQ returns (list or single).
function pickProfile(data: unknown): Record<string, unknown> | null {
  if (!data) return null;
  const d = data as Record<string, unknown>;
  if (Array.isArray(d.data) && d.data.length) return d.data[0] as Record<string, unknown>;
  if (Array.isArray(data) && (data as unknown[]).length) return (data as unknown[])[0] as Record<string, unknown>;
  return d;
}

/**
 * Runs the Identity + Audience fetch for one connected account and writes the
 * results onto the creator's profile. Shared by the HTTP handler and webhook.
 * If accountId is omitted, resolves the creator's most recent connected account
 * from InsightIQ using their stored InsightIQ user id.
 */
export async function syncAccount(creatorId: string, accountId?: string) {
  const db = admin();

  // Resolve the account id if the caller didn't supply one.
  let resolvedAccount = accountId ?? null;
  const { data: mapping } = await db
    .from("insightiq_accounts")
    .select("iq_user_id, iq_account_id")
    .eq("user_id", creatorId)
    .maybeSingle();
  const iqUserId = (mapping as { iq_user_id?: string } | null)?.iq_user_id ?? null;

  if (!resolvedAccount && iqUserId) {
    const accts = await iq(`/v1/accounts?user_id=${encodeURIComponent(iqUserId)}`);
    const list = (accts.data as { data?: Array<{ id?: string; status?: string }> } | null)?.data ?? [];
    // Prefer a connected account; fall back to the first returned.
    const chosen = list.find((a) => (a.status ?? "").toUpperCase() === "CONNECTED") ?? list[0];
    resolvedAccount = chosen?.id ?? (mapping as { iq_account_id?: string } | null)?.iq_account_id ?? null;
  }
  if (!resolvedAccount) throw new Error("No connected InsightIQ account found for this creator.");
  const accId = resolvedAccount;

  await db.from("insightiq_accounts").upsert({
    user_id: creatorId,
    iq_account_id: accId,
    updated_at: new Date().toISOString(),
  });

  const patch: Record<string, unknown> = { ig_insights_synced_at: new Date().toISOString() };

  // Identity / profile: followers, username, url, engagement.
  const prof = await iq(`/v1/profiles?account_id=${encodeURIComponent(accId)}`);
  const p = pickProfile(prof.data);
  if (p) {
    const reputation = (p.reputation ?? {}) as Record<string, unknown>;
    const followers = num(reputation.follower_count) ?? num(p.follower_count);
    if (followers != null) patch.instagram_followers = followers;
    if (typeof p.platform_username === "string") patch.instagram_username = p.platform_username;
    else if (typeof p.username === "string") patch.instagram_username = p.username;
    if (typeof p.url === "string") patch.instagram_url = p.url;

    const engagement = (p.engagement ?? {}) as Record<string, unknown>;
    const er = num(engagement.engagement_rate) ?? num(p.engagement_rate);
    if (er != null) patch.ig_engagement_rate = er <= 1 ? er * 100 : er; // normalise to %
    const avgLikes = num(engagement.average_likes) ?? num(reputation.like_count);
    if (avgLikes != null) patch.ig_avg_likes = avgLikes;
    const avgComments = num(engagement.average_comments);
    if (avgComments != null) patch.ig_avg_comments = avgComments;
    const avgViews = num(engagement.average_views);
    if (avgViews != null) patch.ig_avg_views = avgViews;
    const reach = num(engagement.average_reach);
    if (reach != null) patch.ig_reach = reach;
  }

  // Audience demographics (best-effort — stored as JSON for display).
  const aud = await iq(`/v1/audience?account_id=${encodeURIComponent(accId)}`);
  if (aud.ok && aud.data) {
    const a = pickProfile(aud.data);
    if (a) patch.ig_audience = a;
  }

  patch.instagram_connected_at = new Date().toISOString();
  await db.from("profiles").update(patch).eq("id", creatorId);
  return patch;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!CLIENT_ID || !CLIENT_SECRET) return json({ error: "InsightIQ is not configured on the server yet." }, 500);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Not signed in." }, 401);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Not signed in." }, 401);

  let body: { account_id?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }

  try {
    const patch = await syncAccount(userData.user.id, body.account_id);
    return json({
      connected: true,
      followers: patch.instagram_followers ?? null,
      username: patch.instagram_username ?? null,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Sync failed." }, 502);
  }
});
