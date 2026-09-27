// Free, fully-offline KYC validation helpers (no external API, no cost).
//
// - PAN : Government PAN format check + card-holder type hint. This confirms the
//         number is *structurally* a real PAN (it does NOT confirm it belongs to
//         the person — that needs a paid Protean/NSDL API).
// - Aadhaar : 12 digits + UIDAI's Verhoeff checksum. Every real Aadhaar number's
//         last digit is a Verhoeff check digit, so this rejects typos and made-up
//         numbers for free (it does NOT prove the person owns it).

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

// 4th character of a PAN encodes the holder type.
const PAN_HOLDER_TYPE: Record<string, string> = {
  P: "Individual",
  C: "Company",
  H: "Hindu Undivided Family",
  F: "Firm / LLP",
  A: "Association of Persons",
  T: "Trust",
  B: "Body of Individuals",
  L: "Local Authority",
  J: "Artificial Juridical Person",
  G: "Government",
};

export function normalizePan(pan: string): string {
  return pan.trim().toUpperCase();
}

export function isValidPan(pan: string): boolean {
  return PAN_RE.test(normalizePan(pan));
}

/** Returns the holder type (e.g. "Individual") for a valid PAN, else null. */
export function panHolderType(pan: string): string | null {
  const p = normalizePan(pan);
  if (!PAN_RE.test(p)) return null;
  return PAN_HOLDER_TYPE[p[3]] ?? "Unknown";
}

// ---- Verhoeff checksum (used by UIDAI for the Aadhaar check digit) ----
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

export function normalizeAadhaar(aadhaar: string): string {
  return aadhaar.replace(/\s+/g, "");
}

export function isValidAadhaar(aadhaar: string): boolean {
  const num = normalizeAadhaar(aadhaar);
  if (!/^\d{12}$/.test(num)) return false;
  // Aadhaar numbers never begin with 0 or 1.
  if (num[0] === "0" || num[0] === "1") return false;
  let c = 0;
  const digits = num.split("").reverse().map(Number);
  for (let i = 0; i < digits.length; i++) {
    c = D[c][P[i % 8][digits[i]]];
  }
  return c === 0;
}

/** Masks all but the last 4 digits for safe display: "XXXX XXXX 1234". */
export function maskAadhaar(aadhaar: string): string {
  const num = normalizeAadhaar(aadhaar);
  if (num.length !== 12) return aadhaar;
  return `XXXX XXXX ${num.slice(8)}`;
}
