import AsyncStorage from "@react-native-async-storage/async-storage";

// Holds a referral code captured from an incoming deep link
// (e.g. aaina://campaign/<id>?ref=<code>) until the recipient signs up.
// Persisted so it survives an app restart between tapping the link and
// completing signup.

const KEY = "pending_referral_code";

let cached: string | null = null;

export async function setPendingReferralCode(code: string): Promise<void> {
  const clean = code.trim().toUpperCase();
  if (!clean) return;
  cached = clean;
  try {
    await AsyncStorage.setItem(KEY, clean);
  } catch {
    // ignore storage errors — the in-memory value still works this session
  }
}

export async function getPendingReferralCode(): Promise<string | null> {
  if (cached) return cached;
  try {
    cached = await AsyncStorage.getItem(KEY);
  } catch {
    cached = null;
  }
  return cached;
}

export async function clearPendingReferralCode(): Promise<void> {
  cached = null;
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
