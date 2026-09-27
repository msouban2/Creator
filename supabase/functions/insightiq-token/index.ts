// Supabase Edge Function: insightiq-token
// -----------------------------------------------------------------------------
// Step 1 of the InsightIQ (Phyllo) Connect flow.
//
// The mobile app calls this with the creator's JWT. We:
//   1) verify the caller,
//   2) find-or-create an InsightIQ *user* for this creator (POST /v1/users),
//   3) mint a short-lived SDK token (POST /v1/sdk-tokens) scoped to the
//      products we use (Identity + Engagement + Audience),
// and return { sdk_token, iq_user_id, environment } so the app can open the
// InsightIQ Connect flow. Credentials never leave the server.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   INSIGHTIQ_CLIENT_ID
//   INSIGHTIQ_CLIENT_SECRET
//   INSIGHTIQ_BASE_URL      (default https://api.sandbox.insightiq.ai)
//   INSIGHTIQ_PRODUCTS      (optional, comma list; default below)
// -----------------------------------------------------------------------------

import { createClient } from "jsr:@supabase/supabase-js@2";

const CLIENT_ID = Deno.env.get("INSIGHTIQ_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("INSIGHTIQ_CLIENT_SECRET") ?? "";
const BASE_URL = (Deno.env.get("INSIGHTIQ_BASE_URL") ?? "https://api.sandbox.insightiq.ai").replace(/\/+$/, "");
const PRODUCTS = (Deno.env.get("INSIGHTIQ_PRODUCTS") ?? "IDENTITY,IDENTITY.AUDIENCE,ENGAGEMENT,ENGAGEMENT.AUDIENCE")
  .split(",").map((s) => s.trim()).filter(Boolean);

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

function authHeader(): string {
  return "Basic " + btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);
}

async function iq(path: string, method: string, body?: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!CLIENT_ID || !CLIENT_SECRET) return json({ error: "InsightIQ is not configured on the server yet." }, 500);

  // Identify the signed-in creator.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Not signed in." }, 401);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Not signed in." }, 401);
  const creatorId = userData.user.id;

  const db = admin();

  // 1) Reuse an existing InsightIQ user id if we already made one.
  let iqUserId: string | null = null;
  const { data: existing } = await db
    .from("insightiq_accounts")
    .select("iq_user_id")
    .eq("user_id", creatorId)
    .maybeSingle();
  iqUserId = (existing as { iq_user_id?: string } | null)?.iq_user_id ?? null;

  // 2) Create the InsightIQ user if needed (external_id ties it to our creator).
  if (!iqUserId) {
    const created = await iq("/v1/users", "POST", {
      name: userData.user.email ?? creatorId,
      external_id: creatorId,
    });
    if (created.ok && (created.data as { id?: string })?.id) {
      iqUserId = (created.data as { id: string }).id;
    } else {
      // Idempotency: if the user already exists, look it up by external_id.
      const lookup = await iq(`/v1/users/external_id/${encodeURIComponent(creatorId)}`, "GET");
      if (lookup.ok && (lookup.data as { id?: string })?.id) {
        iqUserId = (lookup.data as { id: string }).id;
      } else {
        return json({ error: "Could not create InsightIQ user.", detail: created.data }, 502);
      }
    }
    await db.from("insightiq_accounts").upsert({
      user_id: creatorId,
      iq_user_id: iqUserId,
      updated_at: new Date().toISOString(),
    });
  }

  // 3) Mint the SDK token for the Connect flow.
  const tok = await iq("/v1/sdk-tokens", "POST", { user_id: iqUserId, products: PRODUCTS });
  if (!tok.ok || !(tok.data as { sdk_token?: string })?.sdk_token) {
    return json({ error: "Could not create SDK token.", detail: tok.data }, 502);
  }

  return json({
    sdk_token: (tok.data as { sdk_token: string }).sdk_token,
    iq_user_id: iqUserId,
    products: PRODUCTS,
    environment: BASE_URL.includes("sandbox") ? "sandbox" : BASE_URL.includes("staging") ? "staging" : "production",
  });
});
