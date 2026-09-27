// Supabase Edge Function: track-shipment
// -----------------------------------------------------------------------------
// Fetches a live courier tracking timeline for a seller order and caches it on
// the application. Proxies a self-hosted instance of the open-source
// indian-courier-api (https://github.com/rajatdhoot123/indian-courier-api),
// whose base URL is configured via the COURIER_API_URL secret.
//
// The upstream returns JSON like:
//   { "location": "BENGALURU", "detail": "Shipment delivered", "date": "26 Mar, 2018 12:50 hrs" }
// or an array of such objects (a timeline). We normalise both shapes.
//
// POST JSON { application_id }  with the caller's Supabase JWT.
// Caller must be staff OR the seller who owns the campaign behind the order.
//
// Deploy WITHOUT JWT verification (we verify the JWT ourselves).
// -----------------------------------------------------------------------------

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
// Base URL of the deployed indian-courier-api, e.g. https://my-courier.onrender.com
const COURIER_API_URL = (Deno.env.get("COURIER_API_URL") ?? "").replace(/\/+$/, "");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const admin = () => createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const SUPPORTED = ["ekart", "ecom", "delhivery", "bluedart", "dtdc", "dhl", "maruti"];

type Event = { location: string | null; detail: string | null; date: string | null };

function normaliseEvents(raw: unknown): Event[] {
  const pick = (o: Record<string, unknown>): Event => ({
    location: (o.location as string) ?? null,
    detail: (o.detail as string) ?? (o.status as string) ?? (o.description as string) ?? null,
    date: (o.date as string) ?? (o.time as string) ?? (o.timestamp as string) ?? null,
  });
  if (Array.isArray(raw)) {
    return raw.filter((x) => x && typeof x === "object").map((x) => pick(x as Record<string, unknown>));
  }
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    // Some responses wrap the timeline under a key.
    for (const key of ["data", "events", "history", "scans", "checkpoints"]) {
      if (Array.isArray(o[key])) return normaliseEvents(o[key]);
    }
    if (o.location || o.detail || o.status) return [pick(o)];
  }
  return [];
}

function looksDelivered(detail: string | null | undefined): boolean {
  return !!detail && /deliver/i.test(detail);
}

// Native Delhivery tracking — their own public unified-tracking API. No key or
// external host needed; just requires a browser-like Origin/Referer.
async function fetchDelhivery(waybill: string): Promise<{ events: Event[]; err: string }> {
  try {
    const r = await fetch(`https://dlv-api.delhivery.com/v3/unified-tracking?wbn=${encodeURIComponent(waybill)}`, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Origin: "https://www.delhivery.com",
        Referer: "https://www.delhivery.com/",
        Accept: "application/json",
      },
    });
    const data = await r.json();
    if (!r.ok) {
      return { events: [], err: (data?.message as string) || `Delhivery ${r.status}` };
    }
    const rec = Array.isArray(data?.data) ? data.data[0] : data?.data ?? data;
    const events: Event[] = [];
    // Collect scans across all tracking states.
    const states = rec?.trackingStates ?? rec?.tracking_states ?? [];
    for (const st of Array.isArray(states) ? states : []) {
      for (const s of Array.isArray(st?.scans) ? st.scans : []) {
        events.push({
          location: s.scanNlpCity ?? s.cityLocation ?? s.city ?? s.scannedLocation ?? null,
          detail: s.scanType ?? s.instructions ?? s.status ?? s.scan ?? null,
          date: s.scanDateTime ?? s.scan_date_time ?? s.statusDateTime ?? s.date ?? null,
        });
      }
    }
    // Newest first.
    events.reverse();
    // Fall back to the top-level status if no scans came through.
    if (!events.length && rec?.status) {
      const st = rec.status;
      events.push({
        location: st.statusLocation ?? st.location ?? null,
        detail: st.status ?? st.instructions ?? null,
        date: st.statusDateTime ?? st.statusDate ?? null,
      });
    }
    return { events, err: events.length ? "" : "No tracking details found yet." };
  } catch (e) {
    return { events: [], err: e instanceof Error ? e.message : "Delhivery fetch failed." };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Not signed in." }, 401);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: "Bearer " + token } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Not signed in." }, 401);
  const userId = userData.user.id;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const applicationId = String(body.application_id ?? "").trim();
  if (!applicationId) return json({ error: "Missing application_id." }, 400);

  const db = admin();

  // Authorise: staff, or the seller who owns the campaign behind this order.
  const { data: me } = await db.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = (me as { role?: string } | null)?.role;
  const isStaff = role === "admin" || role === "employee";

  const { data: app } = await db
    .from("applications")
    .select("id, seller_courier, seller_tracking_id, campaign:campaigns(seller_id)")
    .eq("id", applicationId)
    .maybeSingle();
  if (!app) return json({ error: "Order not found." }, 404);

  const ownerSeller = (app as { campaign?: { seller_id?: string } }).campaign?.seller_id;
  if (!isStaff && ownerSeller !== userId) return json({ error: "Not authorized." }, 403);

  const courier = String((app as { seller_courier?: string }).seller_courier ?? "").toLowerCase().trim();
  const tracking = String((app as { seller_tracking_id?: string }).seller_tracking_id ?? "").trim();

  if (!courier || !tracking) {
    return json({ ok: false, error: "Add a courier and tracking ID first.", configured: !!COURIER_API_URL });
  }
  if (!SUPPORTED.includes(courier)) {
    return json({ ok: false, error: `Unsupported courier "${courier}".`, supported: SUPPORTED });
  }

  let events: Event[] = [];
  let lastErr = "";

  // Delhivery is tracked natively (no external host / key needed).
  if (courier === "delhivery") {
    const res = await fetchDelhivery(tracking);
    events = res.events;
    lastErr = res.err;
  } else if (COURIER_API_URL) {
    // Other couriers via a self-hosted indian-courier-api instance. It exposes
    // /api/track/{courier}/{id} (and, on older builds, /{courier}/{id}).
    const urls = [
      `${COURIER_API_URL}/api/track/${courier}/${encodeURIComponent(tracking)}`,
      `${COURIER_API_URL}/${courier}/${encodeURIComponent(tracking)}`,
    ];
    for (const url of urls) {
      try {
        const r = await fetch(url, { headers: { Accept: "application/json" } });
        if (!r.ok) {
          lastErr = `Upstream ${r.status}`;
          continue;
        }
        const data = await r.json();
        events = normaliseEvents(data);
        if (events.length) break;
      } catch (e) {
        lastErr = e instanceof Error ? e.message : "fetch failed";
      }
    }
  } else {
    return json({
      ok: false,
      configured: false,
      error: `Live tracking for ${courier} isn't configured. Delhivery works out of the box; for other couriers set the COURIER_API_URL secret.`,
    });
  }

  if (!events.length) {
    return json({ ok: false, configured: true, error: lastErr || "No tracking details found yet." });
  }

  const latest = events[0];
  const patch: Record<string, unknown> = {
    seller_tracking_events: events,
    seller_tracking_synced_at: new Date().toISOString(),
  };
  // Auto-advance shipment status when the courier reports delivery.
  if (events.some((e) => looksDelivered(e.detail))) {
    patch.seller_shipment_status = "delivered";
    patch.delivered_at = new Date().toISOString();
  }
  await db.from("applications").update(patch).eq("id", applicationId);

  return json({ ok: true, configured: true, courier, tracking, latest, events });
});
