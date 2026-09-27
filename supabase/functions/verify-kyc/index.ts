// Supabase Edge Function: verify-kyc
// -----------------------------------------------------------------------------
// Real-time PAN / Aadhaar / Bank verification via FinPayUltra. The provider API
// key stays on the server — the phone only ever sends the value to check and
// receives a sanitized result. Every action verifies the caller's Supabase JWT
// and only reads/writes that creator's own rows (service-role writes).
//
// Actions (POST JSON { action, ... }):
//   • "pan"            { pan }                         — single-step PAN lookup
//   • "aadhaar-otp"    { aadhaar }                     — step 1: send OTP → reqId
//   • "aadhaar-verify" { aadhaar, otp, reqId }         — step 2: validate OTP
//   • "bank"           { accountId }                   — validate a saved bank acct
//
// Secrets (Supabase → Edge Functions → Secrets):
//   FINPAY_API_KEY    — your FinPayUltra API key
//   FINPAY_BASE_URL   — optional; default https://api.finpayultra.com
//
// Deploy WITHOUT JWT verification (we verify the JWT ourselves below):
//   supabase functions deploy verify-kyc --no-verify-jwt
// -----------------------------------------------------------------------------

import { createClient } from "jsr:@supabase/supabase-js@2";

const FINPAY_API_KEY = Deno.env.get("FINPAY_API_KEY") ?? "";
const BASE_URL = (Deno.env.get("FINPAY_BASE_URL") ?? "https://api.finpayultra.com").replace(/\/+$/, "");

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

// A short, unique-ish order id for the provider (aids their support lookups).
function orderId(prefix: string): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Calls a FinPayUltra GET endpoint and returns the parsed JSON (or a shaped
// error). Their APIs are GET with query params and always include api_key.
async function finpay(path: string, params: Record<string, string>) {
  const qs = new URLSearchParams({ api_key: FINPAY_API_KEY, ...params }).toString();
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}?${qs}`, { method: "GET" });
  } catch (_e) {
    return { ok: false, status: 0, data: null as unknown, message: "Couldn't reach the verification service." };
  }
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  const d = (data ?? {}) as Record<string, unknown>;
  const success = res.ok && String(d.status ?? "").toUpperCase() === "SUCCESS";
  const message = String(d.message ?? (res.ok ? "Verification failed." : `Service error (${res.status}).`));
  return { ok: success, status: res.status, data, message };
}

// Best-effort search for a request-id inside an arbitrary provider payload.
// Skips `meta` blocks, whose request_id is only a trace UUID (the real Aadhaar
// ReqId lives under data.data.request_id).
function findReqId(obj: unknown): string | null {
  if (obj == null) return null;
  if (typeof obj === "string") {
    // Sometimes provider_response is a JSON string.
    try { return findReqId(JSON.parse(obj)); } catch { return null; }
  }
  if (typeof obj !== "object") return null;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (/^req[_-]?id$/i.test(k) && (typeof v === "string" || typeof v === "number")) return String(v);
    if (/request[_-]?id$/i.test(k) && (typeof v === "string" || typeof v === "number")) return String(v);
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (k.toLowerCase() === "meta") continue; // trace-only ids live here
    if (v && typeof v === "object") {
      const found = findReqId(v);
      if (found) return found;
    }
  }
  return null;
}

// Pulls a field out of a nested provider payload by trying several key spellings.
function pick(obj: unknown, keys: string[]): string | null {
  if (obj == null || typeof obj !== "object") return null;
  const rec = obj as Record<string, unknown>;
  for (const key of keys) {
    for (const k of Object.keys(rec)) {
      if (k.toLowerCase() === key.toLowerCase() && rec[k] != null && rec[k] !== "") return String(rec[k]);
    }
  }
  for (const v of Object.values(rec)) {
    if (v && typeof v === "object") {
      const found = pick(v, keys);
      if (found) return found;
    }
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!FINPAY_API_KEY) return json({ error: "Verification is not configured on the server yet." }, 500);

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
  const db = admin();

  // -------------------------------- PAN --------------------------------
  if (action === "pan") {
    const pan = String(body.pan ?? "").trim().toUpperCase();
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) return json({ error: "Enter a valid PAN like ABCDE1234F." }, 400);

    const r = await finpay("/api/pan_verification", { orderid: orderId("PAN"), Panid: pan });
    if (!r.ok) return json({ verified: false, error: r.message }, 200);

    const data = (r.data as { data?: unknown })?.data ?? r.data;
    const name = pick(data, ["registered_name", "name"]);
    const panType = pick(data, ["pan_type", "type"]);

    await db.from("kyc").upsert(
      {
        user_id: userId,
        pan_number: pan,
        pan_verified: true,
        pan_name: name,
        pan_type: panType,
        pan_verified_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    return json({ verified: true, name, panType });
  }

  // --------------------------- AADHAAR: send OTP ---------------------------
  if (action === "aadhaar-otp") {
    const aadhaar = String(body.aadhaar ?? "").replace(/\s+/g, "");
    if (!/^[0-9]{12}$/.test(aadhaar)) return json({ error: "Enter a valid 12-digit Aadhaar number." }, 400);

    const orderIdV = orderId("ADH");
    const r = await finpay("/api/aadhaar-verification", {
      step: "1",
      orderid: orderIdV,
      Aadhaarid: aadhaar,
    });
    if (!r.ok) return json({ sent: false, error: r.message }, 200);

    const data = (r.data as { data?: unknown })?.data ?? r.data;
    const reqId = findReqId(data) ?? findReqId(r.data);

    // Persist the session server-side so step 2 reuses the exact order id +
    // request id — the phone never has to hold or round-trip them.
    await db.from("kyc").upsert(
      {
        user_id: userId,
        aadhaar_otp_order_id: orderIdV,
        aadhaar_otp_req_id: reqId,
        aadhaar_otp_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    return json({ sent: true });
  }

  // -------------------------- AADHAAR: validate OTP --------------------------
  if (action === "aadhaar-verify") {
    const aadhaar = String(body.aadhaar ?? "").replace(/\s+/g, "");
    const otp = String(body.otp ?? "").trim();
    if (!/^[0-9]{12}$/.test(aadhaar)) return json({ error: "Enter a valid 12-digit Aadhaar number." }, 400);
    if (!otp) return json({ error: "Enter the OTP sent to your Aadhaar-linked mobile." }, 400);

    // Reuse the exact order id + request id from the send-OTP step (stored
    // server-side). Fall back to any client-supplied reqId for safety.
    const { data: sess } = await db
      .from("kyc")
      .select("aadhaar_otp_order_id, aadhaar_otp_req_id")
      .eq("user_id", userId)
      .maybeSingle();
    const s = (sess ?? {}) as { aadhaar_otp_order_id?: string; aadhaar_otp_req_id?: string };
    const reqId = (s.aadhaar_otp_req_id ?? String(body.reqId ?? "")).trim();
    const orderIdV = s.aadhaar_otp_order_id ?? orderId("ADHV");
    if (!reqId) return json({ error: "Verification session expired. Please resend the OTP." }, 400);

    const r = await finpay("/api/aadhaar-verification", {
      step: "2",
      orderid: orderIdV,
      Aadhaarid: aadhaar,
      OTP: otp,
      ReqId: reqId,
    });
    if (!r.ok) return json({ verified: false, error: r.message }, 200);

    const data = (r.data as { data?: unknown })?.data ?? r.data;
    const name = pick(data, ["full_name", "name", "aadhaar_name"]);

    await db.from("kyc").upsert(
      {
        user_id: userId,
        aadhaar_number: aadhaar,
        aadhaar_verified: true,
        aadhaar_name: name,
        aadhaar_verified_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    return json({ verified: true, name });
  }

  // -------------------------------- BANK --------------------------------
  if (action === "bank") {
    const accountId = String(body.accountId ?? "").trim();
    if (!accountId) return json({ error: "Missing bank account." }, 400);

    // Read the saved account (must belong to the caller).
    const { data: acct } = await db
      .from("bank_accounts")
      .select("id, user_id, account_number, ifsc_code")
      .eq("id", accountId)
      .maybeSingle();
    const a = acct as { user_id?: string; account_number?: string; ifsc_code?: string } | null;
    if (!a || a.user_id !== userId) return json({ error: "Bank account not found." }, 404);

    const r = await finpay("/api/advance_bank_verification", {
      orderid: orderId("BNK"),
      account_number: String(a.account_number ?? ""),
      ifsc: String(a.ifsc_code ?? "").toUpperCase(),
    });
    if (!r.ok) return json({ verified: false, error: r.message }, 200);

    const data = (r.data as { data?: unknown })?.data ?? r.data;
    const nameAtBank = pick(data, ["nameAtBank", "name_at_bank", "name"]);
    const bankName = pick(data, ["bankName", "bank_name"]);
    const branch = pick(data, ["branch"]);

    await db
      .from("bank_accounts")
      .update({
        verified: true,
        verified_name: nameAtBank,
        branch,
        ...(bankName ? { bank_name: bankName } : {}),
        verified_at: new Date().toISOString(),
      })
      .eq("id", accountId)
      .eq("user_id", userId);

    return json({ verified: true, nameAtBank, bankName, branch });
  }

  return json({ error: "Unknown action." }, 400);
});
