// Content niches a creator can tag on their profile. Kept in sync with the
// mobile app's copy (mobile/src/lib/niches.ts) and the DB `profiles.niches`.
export const NICHE_OPTIONS = [
  "Fashion",
  "Beauty",
  "Tech",
  "Food",
  "Fitness",
  "Travel",
  "Lifestyle",
  "Gaming",
  "Health & Wellness",
  "Finance",
  "Education",
  "Entertainment",
  "Parenting",
  "Home & Decor",
  "Automobile",
  "Photography",
  "Comedy",
  "Music",
] as const;

export type Niche = (typeof NICHE_OPTIONS)[number];
