// Supabase Edge Function: phone-reset
// -----------------------------------------------------------------------------
// UNAUTHENTICATED password reset via mobile SMS OTP. The user is logged out, so
// we resolve the verified account by phone (service role), text a self-managed
// 6-digit code (FinPayUltra), and on verify set the new password with the admin
// API. Same OTP storage/rules as finpay-otp, but keyed here by the resolved
// user id since there's no JWT.
//
// Actions (POST JSON { action, ... }):
//   • "send" / "resend"  { phone }                    — text a fresh code
//   • "verify"           { phone, otp, new_password }  — set the new password
//
// Secrets: FINPAY_API_KEY (+ optional FINPAY_BASE_URL / FINPAY_OTP_PATH).
//
// Deploy WITHOUT JWT verification (this is a logged-out endpoint):
//   supabase functions deploy phone-reset --no-verify-jwt
// -----------------------------------------------------------------------------

import { createClient } from "jsr:@supabase/supabase-js@2";

const FINPAY_API_KEY = Deno.env.get("FINPAY_API_KEY") ?? "";
const BASE_URL = (Deno.env.get("FINPAY_BASE_URL") ?? "https://api.finpayultra.com").replace(/\/+$/, "");
const OTP_PATH = Deno.env.get("FINPAY_OTP_PATH") ?? "/api/otp1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const OTP_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_S = 30;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const admin = () => createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

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

function orderId(): string {
  return "RST" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function sendOtp(number: string, code: string): Promise<{ ok: boolean; message: string }> {
  const qs = new URLSearchParams({ api_key: FINPAY_API_KEY, orderid: orderId(), number, otp: code }).toString();
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

// Resolve the verified account id for a normalised `91XXXXXXXXXX` number.
async function resolveUserId(db: ReturnType<typeof admin>, mobile: string): Promise<string | null> {
  const { data } = await db
    .from("profiles")
    .select("id")
    .in("phone", ["+" + mobile, mobile])
    .eq("phone_verified", true)
    .limit(1)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!FINPAY_API_KEY) return json({ error: "Phone reset isn't configured on the server yet." }, 500);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body.action ?? "");

  const mobile = normalisePhone(String(body.phone ?? ""));
  if (!mobile) return json({ error: "Enter a valid 10-digit mobile number." }, 400);

  const db = admin();
  const userId = await resolveUserId(db, mobile);

  if (action === "send" || action === "resend") {
    // Generic success even if the number isn't found — don't reveal account
    // existence. Only actually text a code when we have a verified match.
    if (!userId) return json({ sent: true });

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
    if (upErr) return json({ error: "Couldn't start the reset. Please try again." }, 500);

    const sent = await sendOtp(mobile.slice(-10), code);
    if (!sent.ok) return json({ error: sent.message }, 400);
    return json({ sent: true });
  }

  if (action === "verify") {
    const otp = String(body.otp ?? "").replace(/[^0-9]/g, "");
    const newPassword = String(body.new_password ?? "");
    if (otp.length < 4) return json({ error: "Enter the code we texted you." }, 400);
    if (newPassword.length < 6) return json({ error: "Password must be at least 6 characters." }, 400);
    // Generic failure if the number isn't found — don't reveal account existence.
    if (!userId) return json({ error: "That code is incorrect." }, 400);

    const { data: row } = await db
      .from("phone_otps")
      .select("code_hash, expires_at, attempts")
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

    // Set the new password via the admin API, then clear the code.
    const { error: pwErr } = await db.auth.admin.updateUserById(userId, { password: newPassword });
    if (pwErr) return json({ error: "Couldn't update the password. Please try again." }, 500);
    await db.from("phone_otps").delete().eq("user_id", userId);

    return json({ reset: true });
  }

  return json({ error: "Unknown action." }, 400);
});
