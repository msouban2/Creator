// Supabase Edge Function: finpay-otp
// -----------------------------------------------------------------------------
// Self-managed phone-number verification. WE generate the 6-digit code, store
// only its hash (table public.phone_otps), text the plain code through the
// FinPayUltra SMS API, then check the hash on verify. The FinPayUltra API key
// stays on the server; every action verifies the caller's Supabase JWT and only
// writes that creator's own rows (service-role writes).
//
// Actions (POST JSON { action, ... }):
//   • "send" / "resend"  { phone }        — generate + text a fresh code
//   • "verify"           { phone, otp }   — validate → sets profiles.phone_verified
//
// Secrets (Supabase → Edge Functions → Secrets):
//   FINPAY_API_KEY   — your FinPayUltra API key (same one KYC uses)
//   FINPAY_BASE_URL  — optional; default https://api.finpayultra.com
//   FINPAY_OTP_PATH  — optional; default /api/otp1
//
// FinPayUltra's /api/otp1 takes api_key, orderid, number and otp (the code) and
// delivers it via their DLT-approved OTP template — so we generate the code,
// send it here, and verify it against our stored hash.
//
// Deploy WITHOUT JWT verification (we verify the JWT ourselves below):
//   supabase functions deploy finpay-otp --no-verify-jwt
// -----------------------------------------------------------------------------

import { createClient } from "jsr:@supabase/supabase-js@2";

const FINPAY_API_KEY = Deno.env.get("FINPAY_API_KEY") ?? "";
const BASE_URL = (Deno.env.get("FINPAY_BASE_URL") ?? "https://api.finpayultra.com").replace(/\/+$/, "");
const OTP_PATH = Deno.env.get("FINPAY_OTP_PATH") ?? "/api/otp1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const OTP_TTL_MIN = 10;       // code lifetime
const MAX_ATTEMPTS = 5;       // verify tries before a new code is required
const RESEND_COOLDOWN_S = 30; // min gap between sends

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const admin = () => createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

// MSG-style E.164-ish normalisation to `91XXXXXXXXXX`.
function normalisePhone(raw: string): string | null {
  let digits = String(raw ?? "").replace(/[^0-9]/g, "");
  if (digits.length === 10) digits = "91" + digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return null;
}

function sixDigitCode(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(100000 + (arr[0] % 900000));
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// A short, unique-ish order id for the provider (aids their support lookups).
function orderId(): string {
  return "OTP" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Sends the OTP via FinPayUltra's /api/otp1 (GET + api_key). We pass the 6-digit
// code as `otp`; FinPayUltra delivers it through their DLT-approved OTP template.
async function sendOtp(number: string, code: string): Promise<{ ok: boolean; message: string }> {
  const qs = new URLSearchParams({
    api_key: FINPAY_API_KEY,
    orderid: orderId(),
    number,
    otp: code,
  }).toString();
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${OTP_PATH}?${qs}`, { method: "GET" });
  } catch (_e) {
    return { ok: false, message: "Couldn't reach the SMS service." };
  }
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  const ok = res.ok && String(data.status ?? "").toUpperCase() === "SUCCESS";
  const msg = String(data.message ?? (ok ? "OK" : `SMS service error (${res.status}).`));
  return { ok, message: msg };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!FINPAY_API_KEY) {
    return json({ error: "Phone verification isn't configured on the server yet." }, 500);
  }

  // Identify the signed-in creator.
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

  const mobile = normalisePhone(String(body.phone ?? ""));
  if (!mobile) return json({ error: "Enter a valid 10-digit mobile number." }, 400);

  const db = admin();

  if (action === "send" || action === "resend") {
    // Enforce the resend cooldown.
    const { data: existing } = await db
      .from("phone_otps")
      .select("last_sent_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (existing?.last_sent_at) {
      const elapsed = (Date.now() - new Date(existing.last_sent_at as string).getTime()) / 1000;
      if (elapsed < RESEND_COOLDOWN_S) {
        return json({ error: `Please wait ${Math.ceil(RESEND_COOLDOWN_S - elapsed)}s before requesting another code.` }, 429);
      }
    }

    const code = sixDigitCode();
    const now = new Date();
    const { error: upErr } = await db.from("phone_otps").upsert(
      {
        user_id: userId,
        phone: mobile,
        code_hash: await sha256(code + userId),
        expires_at: new Date(now.getTime() + OTP_TTL_MIN * 60 * 1000).toISOString(),
        attempts: 0,
        last_sent_at: now.toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (upErr) return json({ error: "Couldn't start verification. Please try again." }, 500);

    const sent = await sendOtp(mobile.slice(-10), code);
    if (!sent.ok) return json({ error: sent.message }, 400);

    return json({ sent: true });
  }

  if (action === "verify") {
    const otp = String(body.otp ?? "").replace(/[^0-9]/g, "");
    if (otp.length < 4) return json({ error: "Enter the code we texted you." }, 400);

    const { data: row } = await db
      .from("phone_otps")
      .select("code_hash, expires_at, attempts, phone")
      .eq("user_id", userId)
      .maybeSingle();
    if (!row) return json({ error: "No code found. Please request a new one." }, 400);
    if (new Date(row.expires_at as string).getTime() < Date.now()) {
      return json({ error: "That code expired. Please request a new one." }, 400);
    }
    if ((row.attempts as number) >= MAX_ATTEMPTS) {
      return json({ error: "Too many attempts. Please request a new code." }, 429);
    }

    const matches = (await sha256(otp + userId)) === row.code_hash;
    if (!matches) {
      await db.from("phone_otps").update({ attempts: (row.attempts as number) + 1 }).eq("user_id", userId);
      return json({ error: "That code is incorrect." }, 400);
    }

    // Success — mark the profile verified and clear the code.
    const { error: pErr } = await db
      .from("profiles")
      .update({ phone: "+" + (row.phone as string), phone_verified: true })
      .eq("id", userId);
    if (pErr) return json({ error: "Verified, but couldn't save. Please try again." }, 500);
    await db.from("phone_otps").delete().eq("user_id", userId);

    return json({ verified: true });
  }

  return json({ error: "Unknown action." }, 400);
});
