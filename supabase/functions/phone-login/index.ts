// Supabase Edge Function: phone-login
// -----------------------------------------------------------------------------
// Lets a creator sign in with their MOBILE NUMBER + password. Accounts are
// created with an email identity (email + password) and the phone is verified
// once at signup, so here we look up the verified account by phone (service
// role), sign in with that account's email + password server-side, and return
// the session tokens. The email is never exposed to the client, and this works
// regardless of whether Supabase's phone provider is enabled.
//
// POST JSON { phone, password } -> { access_token, refresh_token } | { error }
//
// Deploy WITHOUT JWT verification (this is a login endpoint):
//   supabase functions deploy phone-login --no-verify-jwt
// -----------------------------------------------------------------------------

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function normalisePhone(raw: string): string | null {
  let digits = String(raw ?? "").replace(/[^0-9]/g, "");
  if (digits.length === 10) digits = "91" + digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }

  const mobile = normalisePhone(String(body.phone ?? ""));
  const password = String(body.password ?? "");
  if (!mobile) return json({ error: "Enter a valid 10-digit mobile number." }, 400);
  if (password.length < 6) return json({ error: "Enter your password." }, 400);

  // Resolve the verified account for this number (stored as +91XXXXXXXXXX).
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const { data: prof } = await admin
    .from("profiles")
    .select("email")
    .in("phone", ["+" + mobile, mobile])
    .eq("phone_verified", true)
    .limit(1)
    .maybeSingle();

  const email = (prof?.email ?? "").trim();
  // Generic message either way — don't reveal whether the number exists.
  if (!email) return json({ error: "Invalid mobile number or password." }, 401);

  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: signIn, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !signIn?.session) {
    return json({ error: "Invalid mobile number or password." }, 401);
  }

  return json({
    access_token: signIn.session.access_token,
    refresh_token: signIn.session.refresh_token,
  });
});
