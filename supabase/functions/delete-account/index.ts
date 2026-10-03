import { createClient } from "jsr:@supabase/supabase-js@2";
import { revokeAppleAuthorizationCode } from "./apple.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const USER_BUCKETS = [
  "avatars",
  "kyc-documents",
  "purchase-orders",
  "seller-products",
  "submission-screenshots",
  "submission-videos",
  "support-images",
];

async function removeUserFiles(admin: ReturnType<typeof createClient>, userId: string) {
  for (const bucket of USER_BUCKETS) {
    for (let batch = 0; batch < 100; batch++) {
      const { data, error } = await admin.storage.from(bucket).list(userId, { limit: 100 });
      if (error) throw error;
      const files = (data ?? []).filter((item) => item.id).map((item) => `${userId}/${item.name}`);
      if (!files.length) break;
      const { error: removeError } = await admin.storage.from(bucket).remove(files);
      if (removeError) throw removeError;
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }

  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "Sign in to delete your account." }, 401);

  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: { user }, error: userError } = await caller.auth.getUser();
  if (userError || !user) return json({ error: "Your session has expired. Sign in and try again." }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  try {
    const appleIdentity = user.identities?.find((identity) => identity.provider === "apple");
    if (appleIdentity) {
      const authorizationCode = body.appleAuthorizationCode;
      if (typeof authorizationCode !== "string" || !authorizationCode) {
        return json({ error: "Reauthorize with Apple to delete this account." }, 400);
      }
      await revokeAppleAuthorizationCode(authorizationCode, appleIdentity.identity_data?.sub);
    }

    const { error: paymentsError } = await admin
      .from("seller_payments")
      .update({ created_by: null })
      .eq("created_by", user.id);
    if (paymentsError) throw paymentsError;

    for (const table of ["review_notes", "order_comments"]) {
      const { error } = await admin.from(table).delete().eq("author_id", user.id);
      if (error) throw error;
    }

    await removeUserFiles(admin, user.id);

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;
    return json({ success: true });
  } catch (error) {
    console.error("delete-account failed", error);
    return json({ error: "We couldn't complete account deletion. Please try again or contact support." }, 500);
  }
});