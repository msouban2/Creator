import { useState, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, ShieldCheck, UserCog, User, ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/store/auth";
import type { Profile, UserRole } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { EMPLOYEE_SECTIONS } from "@/lib/permissions";

async function fetchProfiles(search: string) {
  let q = supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(100);
  if (search.trim()) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
  const { data, error } = await q;
  if (error) throw error;
  return data as Profile[];
}

const ROLE_BADGE: Record<UserRole, "primary" | "info" | "default" | "success"> = {
  admin: "primary",
  employee: "info",
  creator: "default",
  seller: "success",
};

const SELLER_TYPE_LABEL: Record<string, string> = {
  ships_directly: "Ships directly",
  coupon_code: "Order via code",
};
const roleLabel = (role: UserRole) => (role === "seller" ? "brand" : role);

const REVIEW_TYPES: { key: string; label: string }[] = [
  { key: "barter", label: "Barter" },
  { key: "reimbursement", label: "Reimbursement" },
  { key: "paid", label: "Paid" },
];

export default function Employees() {
  const qc = useQueryClient();
  const { profile: me } = useAuth();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  // Pending (unsaved) permission edits, keyed by employee id.
  const [permDrafts, setPermDrafts] = useState<Record<string, string[]>>({});
  // Which staff row is currently expanded for management.
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: staff } = useQuery({ queryKey: ["staff"], queryFn: () => fetchStaff() });
  const { data: results } = useQuery({
    queryKey: ["profiles-search", debounced],
    queryFn: () => fetchProfiles(debounced),
    enabled: debounced.trim().length > 1,
  });

  const setRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: UserRole }) => {
      const { error } = await supabase.rpc("set_user_role", { p_user: userId, p_role: role });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff"] });
      qc.invalidateQueries({ queryKey: ["profiles-search"] });
    },
  });

  const setSellerType = useMutation({
    mutationFn: async ({ userId, type }: { userId: string; type: string | null }) => {
      const { error } = await supabase.rpc("admin_set_seller_type", { p_user: userId, p_type: type });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff"] }),
  });

  const setReviewTypes = useMutation({
    mutationFn: async ({ userId, types }: { userId: string; types: string[] }) => {
      const { error } = await supabase.rpc("admin_set_review_types", { p_user: userId, p_types: types });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff"] }),
  });

  const setPermissions = useMutation({
    mutationFn: async ({ userId, perms }: { userId: string; perms: string[] }) => {
      const { error } = await supabase.rpc("admin_set_permissions", { p_user: userId, p_perms: perms });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["staff"] });
      // Drop the local draft so the card reflects the freshly-saved value.
      setPermDrafts((d) => {
        const next = { ...d };
        delete next[vars.userId];
        return next;
      });
    },
  });

  // Current selection for an employee = unsaved draft if present, else saved value.
  const permsFor = (p: Profile) => permDrafts[p.id] ?? p.permissions ?? [];
  const toggleDraft = (p: Profile, key: string, on: boolean) => {
    const current = permsFor(p);
    const next = on ? [...current, key] : current.filter((k) => k !== key);
    setPermDrafts((d) => ({ ...d, [p.id]: next }));
  };
  const setAllPerms = (p: Profile, on: boolean) =>
    setPermDrafts((d) => ({ ...d, [p.id]: on ? EMPLOYEE_SECTIONS.map((s) => s.key) : [] }));
  const isDirty = (p: Profile) => {
    const a = [...permsFor(p)].sort().join(",");
    const b = [...(p.permissions ?? [])].sort().join(",");
    return a !== b;
  };

  return (
    <div className="space-y-6">
      {/* Current staff */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-400">
          <ShieldCheck size={15} /> Team members &amp; brands
          {staff && <span className="text-slate-300">({staff.length})</span>}
        </h2>
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Access</th>
                <th className="px-4 py-3 text-right">Manage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {staff?.map((p) => {
                const isMe = p.id === me?.id;
                const isEmployee = p.role === "employee";
                const isSeller = p.role === "seller";
                const isOpen = expanded === p.id;
                const granted = permsFor(p);
                const initial = (p.full_name ?? p.email ?? "?").trim().charAt(0).toUpperCase();
                return (
                  <Fragment key={p.id}>
                    <tr className={isOpen ? "bg-slate-50/70" : "hover:bg-slate-50/60"}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary">
                            {initial}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-ink">{p.full_name ?? "—"}</p>
                            <p className="truncate text-xs text-slate-400">{p.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={ROLE_BADGE[p.role]}>{roleLabel(p.role)}</Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {isEmployee ? (
                          <div className="space-y-0.5">
                            <span>
                              {granted.length}/{EMPLOYEE_SECTIONS.length} pages
                              {isDirty(p) && <span className="ml-2 text-xs text-amber-600">• unsaved</span>}
                            </span>
                            <p className="text-xs text-slate-400">
                              Reviews:{" "}
                              {(p.review_types ?? []).length
                                ? (p.review_types ?? [])
                                    .map((t) => REVIEW_TYPES.find((r) => r.key === t)?.label ?? t)
                                    .join(" · ")
                                : "none"}
                            </p>
                          </div>
                        ) : isSeller ? (
                          <span>{p.seller_type ? SELLER_TYPE_LABEL[p.seller_type] ?? p.seller_type : "Type not set"}</span>
                        ) : (
                          <span className="text-slate-400">Full access</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isMe ? (
                          <span className="text-xs text-slate-400">This is you</span>
                        ) : (
                          <Button
                            size="sm"
                            variant={isOpen ? "soft" : "outline"}
                            onClick={() => setExpanded(isOpen ? null : p.id)}
                          >
                            Manage
                            <ChevronDown size={14} className={isOpen ? "rotate-180 transition-transform" : "transition-transform"} />
                          </Button>
                        )}
                      </td>
                    </tr>
                    {isOpen && !isMe && (
                      <tr className="bg-slate-50/70">
                        <td colSpan={4} className="px-4 pb-4">
                          <div className="space-y-4 rounded-xl border border-slate-100 bg-white p-4">
                            {isSeller && (
                              <div className="max-w-md">
                                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                  Brand type
                                </label>
                                <Select
                                  value={p.seller_type ?? ""}
                                  onChange={(e) => setSellerType.mutate({ userId: p.id, type: e.target.value || null })}
                                  className="h-9 py-0 text-sm"
                                >
                                  <option value="">— Not set —</option>
                                  <option value="ships_directly">Ships directly (brand sends + tracking)</option>
                                  <option value="coupon_code">Order via code (buy with code, we ship)</option>
                                </Select>
                              </div>
                            )}
                            {isEmployee && (
                              <div>
                                <div className="mb-2 flex items-center justify-between">
                                  <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                    Page access
                                  </label>
                                  <div className="flex items-center gap-3 text-xs font-semibold text-primary">
                                    <button type="button" onClick={() => setAllPerms(p, true)} className="hover:underline">
                                      Select all
                                    </button>
                                    <button type="button" onClick={() => setAllPerms(p, false)} className="hover:underline">
                                      Clear
                                    </button>
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
                                  {EMPLOYEE_SECTIONS.map((s) => {
                                    const on = granted.includes(s.key);
                                    return (
                                      <label key={s.key} className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                                        <input
                                          type="checkbox"
                                          checked={on}
                                          onChange={(e) => toggleDraft(p, s.key, e.target.checked)}
                                          className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                                        />
                                        {s.label}
                                      </label>
                                    );
                                  })}
                                </div>
                                {granted.length === 0 && (
                                  <p className="mt-2 text-xs text-amber-600">
                                    No pages selected — this employee can&apos;t open anything yet.
                                  </p>
                                )}
                                <div className="mt-3 flex items-center gap-3">
                                  <Button
                                    size="sm"
                                    onClick={() => setPermissions.mutate({ userId: p.id, perms: granted })}
                                    disabled={!isDirty(p) || setPermissions.isPending}
                                  >
                                    {setPermissions.isPending ? "Saving…" : "Save access"}
                                  </Button>
                                  {isDirty(p) && <span className="text-xs text-amber-600">Unsaved changes</span>}
                                </div>
                              </div>
                            )}
                            {isEmployee && (
                              <div>
                                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                  Review queue — submission &amp; application types
                                </label>
                                <div className="flex flex-wrap gap-2">
                                  {REVIEW_TYPES.map((rt) => {
                                    const on = (p.review_types ?? []).includes(rt.key);
                                    return (
                                      <button
                                        key={rt.key}
                                        type="button"
                                        disabled={setReviewTypes.isPending}
                                        onClick={() =>
                                          setReviewTypes.mutate({
                                            userId: p.id,
                                            types: on
                                              ? (p.review_types ?? []).filter((k) => k !== rt.key)
                                              : [...(p.review_types ?? []), rt.key],
                                          })
                                        }
                                        className={
                                          "rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50 " +
                                          (on
                                            ? "border-primary bg-primary text-white"
                                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
                                        }
                                      >
                                        {rt.label}
                                      </button>
                                    );
                                  })}
                                </div>
                                <p className="mt-1.5 text-xs text-slate-400">
                                  Decides which campaign types this employee sees &amp; reviews in Applications and
                                  Submissions. Saved instantly.
                                </p>
                              </div>
                            )}
                            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                              {p.role !== "admin" && (
                                <Button size="sm" variant="outline" onClick={() => setRole.mutate({ userId: p.id, role: "admin" })}>
                                  Make admin
                                </Button>
                              )}
                              {p.role !== "seller" && (
                                <Button size="sm" variant="outline" onClick={() => setRole.mutate({ userId: p.id, role: "seller" })}>
                                  Make brand
                                </Button>
                              )}
                              <Button size="sm" variant="danger" onClick={() => setRole.mutate({ userId: p.id, role: "creator" })}>
                                Remove access
                              </Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {staff?.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                    No team members yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Add staff by searching users */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-400">
          <UserCog size={15} /> Add a team member
        </h2>
        <div className="relative max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-9"
            placeholder="Search users by name or email…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setDebounced(e.target.value);
            }}
          />
        </div>

        {debounced.trim().length > 1 && (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-100 bg-white">
            {results?.length === 0 && <p className="p-4 text-sm text-slate-400">No users found.</p>}
            {results?.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 p-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                    <User size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-ink">{p.full_name ?? "—"}</p>
                    <p className="text-xs text-slate-400">{p.email}</p>
                  </div>
                  <Badge variant={ROLE_BADGE[p.role]}>{roleLabel(p.role)}</Badge>
                </div>
                {p.role === "creator" && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => setRole.mutate({ userId: p.id, role: "employee" })}>
                      Make employee
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setRole.mutate({ userId: p.id, role: "seller" })}>
                      Make brand
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

async function fetchStaff() {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .in("role", ["admin", "employee", "seller"])
    .order("role", { ascending: true });
  if (error) throw error;
  return data as Profile[];
}
