import type { Profile } from "@/lib/types";

/**
 * Sections an admin can individually grant to an employee.
 * `key` is stored in profiles.permissions (text[]), `path` is the route,
 * `label` is what admins see on the Employees page + the sidebar label.
 */
export const EMPLOYEE_SECTIONS = [
  { key: "campaigns", label: "Campaigns", path: "/campaigns" },
  { key: "applications", label: "Applications", path: "/applications" },
  { key: "users", label: "Creators", path: "/users" },
  { key: "review_queue", label: "Review Queue", path: "/review-queue" },
  { key: "instagram_requests", label: "Instagram Requests", path: "/instagram-requests" },
  { key: "sellers", label: "Brand Management", path: "/sellers" },
  { key: "submissions", label: "Submissions", path: "/submissions" },
  { key: "support", label: "Support", path: "/support" },
] as const;

export type SectionKey = (typeof EMPLOYEE_SECTIONS)[number]["key"];

/**
 * Whether the given profile may access a section.
 * Admins can access everything; employees only their granted permissions.
 */
export function canAccess(profile: Profile | null | undefined, key: SectionKey): boolean {
  if (!profile) return false;
  if (profile.role === "admin") return true;
  if (profile.role === "employee") {
    if ((profile.permissions ?? []).includes(key)) return true;
    // An employee assigned any review type is a reviewer, so they can always
    // open the Review Queue — that's where they act on the items they're
    // notified about, even if the explicit menu permission wasn't granted.
    if (key === "review_queue" && (profile.review_types ?? []).length > 0) return true;
    return false;
  }
  return false;
}
