// Free, fully-offline KYC validation (no external API, no cost).
// PAN: government format check. Aadhaar: 12 digits + UIDAI Verhoeff checksum.
// These confirm the number is *structurally* valid, not that it belongs to the
// person (that needs a paid Protean/NSDL/DigiLocker API).

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

const PAN_HOLDER_TYPE: Record<string, string> = {
  P: "Individual",
  C: "Company",
  H: "HUF",
  F: "Firm / LLP",
  A: "AOP",
  T: "Trust",
  B: "Body of Individuals",
  L: "Local Authority",
  J: "Artificial Juridical Person",
  G: "Government",
};

export function isValidPan(pan: string | null | undefined): boolean {
  if (!pan) return false;
  return PAN_RE.test(pan.trim().toUpperCase());
}

export function panHolderType(pan: string | null | undefined): string | null {
  if (!pan) return null;
  const p = pan.trim().toUpperCase();
  if (!PAN_RE.test(p)) return null;
  return PAN_HOLDER_TYPE[p[3]] ?? "Unknown";
}

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

export function isValidAadhaar(aadhaar: string | null | undefined): boolean {
  if (!aadhaar) return false;
  const num = aadhaar.replace(/\s+/g, "");
  if (!/^\d{12}$/.test(num)) return false;
  if (num[0] === "0" || num[0] === "1") return false;
  let c = 0;
  const digits = num.split("").reverse().map(Number);
  for (let i = 0; i < digits.length; i++) {
    c = D[c][P[i % 8][digits[i]]];
  }
  return c === 0;
}
