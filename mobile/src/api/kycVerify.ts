import { useMutation } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

// Calls the `verify-kyc` edge function, which holds the FinPayUltra API key
// server-side and validates PAN / Aadhaar / bank details in real time.
async function callVerify<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("verify-kyc", { body });
  if (error) {
    // Surface the function's JSON error message when present.
    const ctx = (error as { context?: { body?: unknown } }).context;
    const msg = typeof ctx?.body === "string" ? ctx.body : null;
    throw new Error(msg ?? error.message ?? "Verification failed. Please try again.");
  }
  const res = data as T & { error?: string };
  if (res?.error) throw new Error(res.error);
  return res;
}

export interface PanVerifyResult {
  verified: boolean;
  name?: string | null;
  panType?: string | null;
  error?: string;
}

export function useVerifyPan() {
  return useMutation({
    mutationFn: (pan: string) => callVerify<PanVerifyResult>({ action: "pan", pan }),
  });
}

export interface AadhaarOtpResult {
  sent: boolean;
  reqId?: string | null;
  error?: string;
}

export function useSendAadhaarOtp() {
  return useMutation({
    mutationFn: (aadhaar: string) => callVerify<AadhaarOtpResult>({ action: "aadhaar-otp", aadhaar }),
  });
}

export interface AadhaarVerifyResult {
  verified: boolean;
  name?: string | null;
  error?: string;
}

export function useVerifyAadhaarOtp() {
  return useMutation({
    mutationFn: (input: { aadhaar: string; otp: string; reqId: string }) =>
      callVerify<AadhaarVerifyResult>({ action: "aadhaar-verify", ...input }),
  });
}

export interface BankVerifyResult {
  verified: boolean;
  nameAtBank?: string | null;
  bankName?: string | null;
  branch?: string | null;
  error?: string;
}

export function useVerifyBank() {
  return useMutation({
    mutationFn: (accountId: string) => callVerify<BankVerifyResult>({ action: "bank", accountId }),
  });
}
