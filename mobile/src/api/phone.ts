import { supabase } from "../lib/supabase";

// Calls the `finpay-otp` edge function, which generates + verifies a self-managed
// SMS OTP and texts it through the FinPayUltra SMS API (API key stays server-side).
async function callOtp<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("finpay-otp", { body });
  if (error) {
    // Surface the function's JSON error message when present.
    const ctx = (error as { context?: { body?: unknown } }).context;
    const msg = typeof ctx?.body === "string" ? ctx.body : null;
    throw new Error(msg ?? error.message ?? "Something went wrong. Please try again.");
  }
  const res = data as T & { error?: string };
  if (res?.error) throw new Error(res.error);
  return res;
}

/** Sends a 6-digit OTP to the given mobile number. */
export function sendPhoneOtp(phone: string) {
  return callOtp<{ sent: boolean }>({ action: "send", phone });
}

/** Re-sends the OTP (text) to the given mobile number. */
export function resendPhoneOtp(phone: string) {
  return callOtp<{ sent: boolean }>({ action: "resend", phone });
}

/** Verifies the OTP; on success the server marks the profile phone-verified. */
export function verifyPhoneOtp(phone: string, otp: string) {
  return callOtp<{ verified: boolean }>({ action: "verify", phone, otp });
}

// ---- Password reset via mobile OTP (used while logged OUT) -------------------

async function callReset<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("phone-reset", { body });
  if (error) {
    const ctx = (error as { context?: { body?: unknown } }).context;
    const msg = typeof ctx?.body === "string" ? ctx.body : null;
    throw new Error(msg ?? error.message ?? "Something went wrong. Please try again.");
  }
  const res = data as T & { error?: string };
  if (res?.error) throw new Error(res.error);
  return res;
}

/** Texts a password-reset OTP to the given mobile number. */
export function sendResetOtp(phone: string) {
  return callReset<{ sent: boolean }>({ action: "send", phone });
}

/** Re-sends the password-reset OTP. */
export function resendResetOtp(phone: string) {
  return callReset<{ sent: boolean }>({ action: "resend", phone });
}

/** Verifies the reset OTP and sets the new password. */
export function verifyResetOtp(phone: string, otp: string, newPassword: string) {
  return callReset<{ reset: boolean }>({ action: "verify", phone, otp, new_password: newPassword });
}
