// Supabase Edge Function: insightiq-webhook
// -----------------------------------------------------------------------------
// InsightIQ (Phyllo) calls this when a creator's account connects or their data
// updates. We resolve which Bilkul creator it belongs to (via the stored
// InsightIQ user id) and sync their profile + insights server-side — so data
// populates reliably even if the in-app browser redirect is imperfect.
//
// Deployed with --no-verify-jwt (Phyllo is not a Supabase user). If a webhook
// secret is configured we verify the signature; otherwise we validate the event
// shape and that the user maps to a known creator.
//
// Secrets: INSIGHTIQ_CLIENT_ID, INSIGHTIQ_CLIENT_SECRET, INSIGHTIQ_BASE_URL,
//          INSIGHTIQ_WEBHOOK_SECRET (optional)
// -----------------------------------------------------------------------------

import { createClient } from "jsr:@supabase/supabase-js@2";

const CLIENT_ID = Deno.env.get("INSIGHTIQ_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("INSIGHTIQ_CLIENT_SECRET") ?? "";
const BASE_URL = (Deno.env.get("INSIGHTIQ_BASE_URL") ?? "https://api.staging.getphyllo.com").replace(/\/+$/, "");
const WEBHOOK_SECRET = Deno.env.get("INSIGHTIQ_WEBHOOK_SECRET") ?? "";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const admin = () => createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
const authHeader = () => "Basic " + btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);

async function iq(path: string) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { Authorization: authHeader(), "Content-Type": "application/json" } });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

const num = (v: unknown): number | null =>
  typeof v === "number" && isFinite(v) ? v : v != null && !isNaN(Number(v)) ? Number(v) : null;

function pickProfile(data: unknown): Record<string, unknown> | null {
  if (!data) return null;
  const d = data as Record<string, unknown>;
  if (Array.isArray(d.data) && d.data.length) return d.data[0] as Record<string, unknown>;
  if (Array.isArray(data) && (data as unknown[]).length) return (data as unknown[])[0] as Record<string, unknown>;
  return d;
}

async function verifySignature(req: Request, raw: string): Promise<boolean> {
  if (!WEBHOOK_SECRET) return true; // no secret configured -> skip
  const sig = req.headers.get("x-phyllo-signature") || req.headers.get("phyllo-signature") || "";
  if (!sig) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(WEBHOOK_SECRET),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
    const hex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
    return sig.includes(hex);
  } catch {
    return false;
  }
}

async function resolveCreator(db: ReturnType<typeof admin>, phylloUserId?: string, externalId?: string): Promise<string | null> {
  // external_id is our creator uuid (we set it when creating the InsightIQ user).
  if (externalId) {
    const { data } = await db.from("profiles").select("id").eq("id", externalId).maybeSingle();
    if ((data as { id?: string } | null)?.id) return externalId;
  }
  if (phylloUserId) {
    const { data } = await db.from("insightiq_accounts").select("user_id").eq("iq_user_id", phylloUserId).maybeSingle();
    return (data as { user_id?: string } | null)?.user_id ?? null;
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const raw = await req.text();
  if (!(await verifySignature(req, raw))) return new Response("bad signature", { status: 401 });

  let evt: Record<string, unknown> = {};
  try { evt = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }

  const event = String(evt.event ?? evt.name ?? "");
  const data = (evt.data ?? {}) as Record<string, unknown>;
  const accountId = (data.account_id ?? data.id) as string | undefined;
  const phylloUserId = (data.user_id ?? (data.user as Record<string, unknown>)?.id) as string | undefined;
  const externalId = (data.external_id ?? (data.user as Record<string, unknown>)?.external_id) as string | undefined;

  // Only act on connect / data-ready events.
  if (!/ACCOUNT|PROFILE|CONNECT/i.test(event)) {
    return new Response(JSON.stringify({ ignored: event }), { status: 200 });
  }

  const db = admin();
  const creatorId = await resolveCreator(db, phylloUserId, externalId);
  if (!creatorId) return new Response(JSON.stringify({ error: "creator not found" }), { status: 200 });

  // Resolve account if the event didn't include one.
  let accId = accountId ?? null;
  if (!accId && phylloUserId) {
    const accts = await iq(`/v1/accounts?user_id=${encodeURIComponent(phylloUserId)}`);
    const list = (accts.data as { data?: Array<{ id?: string; status?: string }> } | null)?.data ?? [];
    const chosen = list.find((a) => (a.status ?? "").toUpperCase() === "CONNECTED") ?? list[0];
    accId = chosen?.id ?? null;
  }
  if (!accId) return new Response(JSON.stringify({ error: "no account" }), { status: 200 });

  const patch: Record<string, unknown> = {
    ig_insights_synced_at: new Date().toISOString(),
    instagram_connected_at: new Date().toISOString(),
  };
  const prof = await iq(`/v1/profiles?account_id=${encodeURIComponent(accId)}`);
  const p = pickProfile(prof.data);
  if (p) {
    const rep = (p.reputation ?? {}) as Record<string, unknown>;
    const followers = num(rep.follower_count) ?? num(p.follower_count);
    if (followers != null) patch.instagram_followers = followers;
    if (typeof p.platform_username === "string") patch.instagram_username = p.platform_username;
    else if (typeof p.username === "string") patch.instagram_username = p.username;
    if (typeof p.url === "string") patch.instagram_url = p.url;
    const eng = (p.engagement ?? {}) as Record<string, unknown>;
    const er = num(eng.engagement_rate) ?? num(p.engagement_rate);
    if (er != null) patch.ig_engagement_rate = er <= 1 ? er * 100 : er;
    const likes = num(eng.average_likes) ?? num(rep.like_count);
    if (likes != null) patch.ig_avg_likes = likes;
    const comments = num(eng.average_comments);
    if (comments != null) patch.ig_avg_comments = comments;
    const views = num(eng.average_views);
    if (views != null) patch.ig_avg_views = views;
    const reach = num(eng.average_reach);
    if (reach != null) patch.ig_reach = reach;
  }

  await db.from("insightiq_accounts").upsert({ user_id: creatorId, iq_account_id: accId, updated_at: new Date().toISOString() });
  await db.from("profiles").update(patch).eq("id", creatorId);

  return new Response(JSON.stringify({ ok: true, creator: creatorId, account: accId }), { status: 200 });
});
