import * as WebBrowser from "expo-web-browser";
import { createURL } from "expo-linking";
import { supabase } from "../lib/supabase";

export interface SignUpPayload {
  full_name: string;
  email: string;
  phone: string;
  password: string;
  instagram_username?: string;
  instagram_url?: string;
  instagram_followers?: number;
  youtube_channel?: string;
  youtube_subscribers?: number;
  niches?: string[];
  referred_by_code?: string;
}

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

/**
 * Signs in with a MOBILE NUMBER + password. Delegates to the `phone-login` edge
 * function (which resolves the verified account and signs in server-side), then
 * establishes the returned session locally.
 */
export async function signInWithPhone(phone: string, password: string) {
  const { data, error } = await supabase.functions.invoke("phone-login", { body: { phone, password } });
  if (error) {
    const ctx = (error as { context?: { body?: unknown } }).context;
    const msg = typeof ctx?.body === "string" ? ctx.body : null;
    throw new Error(msg ?? error.message ?? "Login failed. Please try again.");
  }
  const res = data as { access_token?: string; refresh_token?: string; error?: string };
  if (res?.error) throw new Error(res.error);
  if (!res.access_token || !res.refresh_token) throw new Error("Login failed. Please try again.");
  const { error: sessErr } = await supabase.auth.setSession({
    access_token: res.access_token,
    refresh_token: res.refresh_token,
  });
  if (sessErr) throw sessErr;
}

export async function signUpWithEmail(payload: SignUpPayload) {
  const { email, password, ...meta } = payload;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        role: "creator",
        ...meta,
      },
    },
  });
  if (error) throw error;
  return data;
}

/**
 * Confirms a new account with the 6-digit code Supabase emails at signup.
 * On success a session is created and the auth listener signs the user in.
 */
export async function verifyEmailOtp(email: string, token: string) {
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "signup" });
  if (error) throw error;
  return data;
}

/** Re-sends the signup verification code to the given email. */
export async function resendSignupOtp(email: string) {
  const { error } = await supabase.auth.resend({ type: "signup", email });
  if (error) throw error;
}

export async function signInWithGoogle() {
  // No forced scheme: resolves to exp:// inside Expo Go and aaina:// in a build,
  // so the browser can return to whichever app is actually running.
  const redirectTo = createURL("auth/callback");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) throw new Error("Couldn't start Google sign-in.");

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success" || !result.url) return;

  const url = new URL(result.url);

  // Implicit flow: tokens come back in the URL hash.
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  const access_token = hashParams.get("access_token");
  const refresh_token = hashParams.get("refresh_token");
  if (access_token && refresh_token) {
    await supabase.auth.setSession({ access_token, refresh_token });
    return;
  }

  // PKCE flow: an auth code comes back as ?code=...
  const code = url.searchParams.get("code");
  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
    return;
  }

  const errorDescription =
    url.searchParams.get("error_description") ?? hashParams.get("error_description");
  if (errorDescription) throw new Error(errorDescription);
}

export async function sendPasswordReset(email: string) {
  const redirectTo = createURL("auth/reset", { scheme: "aaina" });
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

export async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}
