// Supabase Edge Function: send-push
// -----------------------------------------------------------------------------
// Sends a push notification to all of a user's registered device tokens.
//   • Android tokens  -> Firebase Cloud Messaging (FCM HTTP v1)
//   • iOS tokens      -> Apple Push Notification service (APNs, token-based auth)
//
// Called internally by the notifications trigger (pg_net) with the shared
// INTERNAL_PUSH_KEY. Deploy WITHOUT JWT verification (we check the key ourselves).
//
// Secrets:
//   FCM_SERVICE_ACCOUNT  — full Firebase service-account JSON (Android)
//   INTERNAL_PUSH_KEY    — shared secret the caller must present
//   APNS_KEY             — APNs auth key (.p8 contents, PKCS8 PEM) (iOS)
//   APNS_KEY_ID          — the APNs key's Key ID (iOS)
//   APNS_TEAM_ID         — Apple Developer Team ID (iOS)
//   APNS_BUNDLE_ID       — app bundle id / APNs topic (default com.aaina.creator)
//   APNS_PRODUCTION      — "true" (default) uses api.push.apple.com; else sandbox
// -----------------------------------------------------------------------------

import { createClient } from "jsr:@supabase/supabase-js@2";
import { SignJWT, importPKCS8 } from "npm:jose@5";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SA_RAW = Deno.env.get("FCM_SERVICE_ACCOUNT") ?? "";
const INTERNAL_KEY = Deno.env.get("INTERNAL_PUSH_KEY") ?? "";

const APNS_KEY = (Deno.env.get("APNS_KEY") ?? "").replace(/\\n/g, "\n");
const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID") ?? "";
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID") ?? "";
const APNS_BUNDLE_ID = Deno.env.get("APNS_BUNDLE_ID") ?? "com.aaina.creator";
const APNS_PRODUCTION = (Deno.env.get("APNS_PRODUCTION") ?? "true") !== "false";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const admin = () => createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

type ServiceAccount = { client_email: string; private_key: string; project_id: string };

// -----------------------------------------------------------------------------
// Android: Firebase Cloud Messaging (FCM HTTP v1)
// -----------------------------------------------------------------------------

// Cache the Google OAuth access token until shortly before it expires.
let cachedGoogleToken: { token: string; exp: number } | null = null;

async function getGoogleAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedGoogleToken && cachedGoogleToken.exp - 60 > now) return cachedGoogleToken.token;

  const key = await importPKCS8(sa.private_key, "RS256");
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error("OAuth failed: " + JSON.stringify(data).slice(0, 200));
  cachedGoogleToken = { token: data.access_token, exp: now + (data.expires_in ?? 3600) };
  return data.access_token;
}

async function sendAndroid(
  db: ReturnType<typeof admin>,
  tokens: string[],
  title: string,
  message: string,
  link: string,
  type: string,
): Promise<{ sent: number; pruned: number }> {
  if (!SA_RAW || tokens.length === 0) return { sent: 0, pruned: 0 };
  const sa = JSON.parse(SA_RAW) as ServiceAccount;
  const accessToken = await getGoogleAccessToken(sa);
  const endpoint = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

  let sent = 0;
  const stale: string[] = [];
  await Promise.all(
    tokens.map(async (token) => {
      const payload = {
        message: {
          token,
          notification: { title, body: message },
          data: { link, type },
          android: { priority: "HIGH", notification: { channel_id: "default", sound: "default" } },
        },
      };
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        sent++;
      } else {
        const err = await r.text();
        if (/UNREGISTERED|InvalidRegistration|NotRegistered|invalid-argument/i.test(err)) stale.push(token);
      }
    }),
  );
  if (stale.length) await db.from("push_tokens").delete().in("token", stale);
  return { sent, pruned: stale.length };
}

// -----------------------------------------------------------------------------
// iOS: Apple Push Notification service (APNs, token-based / .p8 auth)
// -----------------------------------------------------------------------------

// The APNs provider JWT is valid up to 1h; refresh well before that.
let cachedApnsJwt: { token: string; exp: number } | null = null;

async function getApnsJwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedApnsJwt && cachedApnsJwt.exp - 60 > now) return cachedApnsJwt.token;

  const key = await importPKCS8(APNS_KEY, "ES256");
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: APNS_KEY_ID })
    .setIssuer(APNS_TEAM_ID)
    .setIssuedAt(now)
    .sign(key);
  // Reuse for ~40 min (Apple rejects tokens older than 1h, throttles frequent refresh).
  cachedApnsJwt = { token, exp: now + 2400 };
  return token;
}

async function apnsPost(host: string, jwt: string, token: string, payload: unknown) {
  const r = await fetch(`https://${host}/3/device/${token}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": APNS_BUNDLE_ID,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return r;
}

async function sendIos(
  db: ReturnType<typeof admin>,
  tokens: string[],
  title: string,
  message: string,
  link: string,
  type: string,
): Promise<{ sent: number; pruned: number }> {
  if (!APNS_KEY || !APNS_KEY_ID || !APNS_TEAM_ID || tokens.length === 0) return { sent: 0, pruned: 0 };
  const jwt = await getApnsJwt();
  const primary = APNS_PRODUCTION ? "api.push.apple.com" : "api.sandbox.push.apple.com";
  const secondary = APNS_PRODUCTION ? "api.sandbox.push.apple.com" : "api.push.apple.com";
  const payload = {
    aps: { alert: { title, body: message }, sound: "default", "mutable-content": 1 },
    link,
    type,
  };

  let sent = 0;
  const stale: string[] = [];
  await Promise.all(
    tokens.map(async (token) => {
      let r = await apnsPost(primary, jwt, token, payload);
      if (r.status === 400) {
        // Token minted for the other environment -> retry the other host once.
        const reason = await r.clone().text();
        if (/BadDeviceToken|DeviceTokenNotForTopic/i.test(reason)) {
          r = await apnsPost(secondary, jwt, token, payload);
        }
      }
      if (r.ok) {
        sent++;
      } else {
        const reason = await r.text();
        // 410 Unregistered, or a token Apple no longer recognises -> prune.
        if (r.status === 410 || /Unregistered|BadDeviceToken/i.test(reason)) stale.push(token);
      }
    }),
  );
  if (stale.length) await db.from("push_tokens").delete().in("token", stale);
  return { sent, pruned: stale.length };
}

// -----------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Internal auth: the caller must present the shared internal key.
  const provided = req.headers.get("x-internal-key") ?? "";
  if (!INTERNAL_KEY || provided !== INTERNAL_KEY) return json({ error: "Forbidden" }, 403);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const userId = String(body.user_id ?? "").trim();
  const title = String(body.title ?? "Bilkul");
  const message = String(body.body ?? "");
  const link = String(body.link ?? "");
  const type = String(body.type ?? "general");
  if (!userId) return json({ error: "Missing user_id" }, 400);

  const db = admin();

  // This user's device tokens, split by platform.
  const { data: rows } = await db
    .from("push_tokens")
    .select("token, platform")
    .eq("user_id", userId);
  const all = (rows ?? []) as { token: string; platform: string }[];
  const android = all.filter((r) => r.platform === "android").map((r) => r.token).filter(Boolean);
  const ios = all.filter((r) => r.platform === "ios").map((r) => r.token).filter(Boolean);
  if (android.length === 0 && ios.length === 0) return json({ sent: 0 });

  const results = await Promise.allSettled([
    sendAndroid(db, android, title, message, link, type),
    sendIos(db, ios, title, message, link, type),
  ]);

  let sent = 0, pruned = 0;
  const errors: string[] = [];
  for (const res of results) {
    if (res.status === "fulfilled") {
      sent += res.value.sent;
      pruned += res.value.pruned;
    } else {
      errors.push(res.reason instanceof Error ? res.reason.message : String(res.reason));
    }
  }

  return json({ sent, pruned, ...(errors.length ? { errors } : {}) });
});
