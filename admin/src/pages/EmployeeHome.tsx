import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ClipboardList,
  FileCheck2,
  CheckCircle2,
  ListChecks,
  Store,
  Instagram,
  LifeBuoy,
  Eye,
  Trophy,
  Power,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/store/auth";
import { canAccess, type SectionKey } from "@/lib/permissions";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, orderRef } from "@/lib/utils";
import { statusLabel } from "@/lib/workflow";
import type { CampaignType } from "@/lib/types";

const ALL_TYPES: CampaignType[] = ["barter", "reimbursement", "paid"];

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function startOfWeek() {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function daysElapsedThisWeek() {
  return ((new Date().getDay() + 6) % 7) + 1;
}
function ageLabel(iso: string | null | undefined) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function needsEmployeeAction(status: string, type: string | undefined): boolean {
  if (type === "reimbursement") return ["ordered", "link_submitted", "submitted"].includes(status);
  return ["applied", "selected", "product_shipped", "delivered", "draft_submitted", "submitted", "link_submitted"].includes(status);
}

type Activity = { id: string; text: string; time: string; ref: number | null };

export function EmployeeHome() {
  const { profile, refreshProfile } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const name = (profile?.full_name ?? "there").split(" ")[0];
  const uid = profile?.id;
  const available = profile?.available ?? true;

  const myTypes = useMemo<CampaignType[]>(
    () => (profile?.role === "admin" ? ALL_TYPES : ((profile?.review_types ?? []) as CampaignType[])),
    [profile]
  );

  const can = (key: SectionKey) => canAccess(profile, key);
  const canSupport = can("support");

  const { data: pendingReviews = 0 } = useQuery({
    queryKey: ["emp-pending-reviews", myTypes],
    enabled: myTypes.length > 0,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_submissions")
        .select("id, review_status, application:applications!inner(status, campaign:campaigns!inner(campaign_type))")
        .eq("review_status", "pending");
      if (error) throw error;
      return (data ?? []).filter((s) => {
        const t = (s as { application?: { campaign?: { campaign_type?: CampaignType } } }).application?.campaign?.campaign_type;
        return t && myTypes.includes(t);
      }).length;
    },
  });

  const { data: actionApps = 0 } = useQuery({
    queryKey: ["emp-action-apps", myTypes],
    enabled: myTypes.length > 0,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.from("applications").select("id, status, campaign:campaigns!inner(campaign_type)");
      if (error) throw error;
      return (data ?? []).filter((a) => {
        const t = (a as { campaign?: { campaign_type?: CampaignType } }).campaign?.campaign_type;
        return t && myTypes.includes(t) && needsEmployeeAction((a as { status: string }).status, t);
      }).length;
    },
  });

  const { data: myReviewed } = useQuery({
    queryKey: ["emp-my-reviewed", uid],
    enabled: !!uid,
    refetchInterval: 30000,
    queryFn: async () => {
      const [today, week] = await Promise.all([
        supabase.from("campaign_submissions").select("id", { count: "exact", head: true }).eq("reviewed_by", uid).gte("reviewed_at", startOfToday()),
        supabase.from("campaign_submissions").select("id", { count: "exact", head: true }).eq("reviewed_by", uid).gte("reviewed_at", startOfWeek()),
      ]);
      return { today: today.count ?? 0, week: week.count ?? 0 };
    },
  });

  // Support: how many open tickets I hold + how many are waiting.
  const { data: support } = useQuery({
    queryKey: ["emp-support", uid],
    enabled: !!uid && canSupport,
    refetchInterval: 30000,
    queryFn: async () => {
      const [mine, waiting] = await Promise.all([
        supabase.from("support_tickets").select("id", { count: "exact", head: true }).eq("claimed_by", uid).eq("status", "open"),
        supabase.from("support_tickets").select("id", { count: "exact", head: true }).is("claimed_by", null).eq("status", "open"),
      ]);
      return { mine: mine.count ?? 0, waiting: waiting.count ?? 0 };
    },
  });

  // Performance: my decisions this week broken down by outcome.
  const { data: perf } = useQuery({
    queryKey: ["emp-perf", uid],
    enabled: !!uid,
    refetchInterval: 60000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_submissions")
        .select("review_status")
        .eq("reviewed_by", uid)
        .gte("reviewed_at", startOfWeek());
      if (error) throw error;
      const rows = (data ?? []) as { review_status: string }[];
      const approved = rows.filter((r) => r.review_status === "approved").length;
      const revision = rows.filter((r) => r.review_status === "revision").length;
      const rejected = rows.filter((r) => r.review_status === "rejected").length;
      const total = approved + revision + rejected;
      return { approved, revision, rejected, total, perDay: total / daysElapsedThisWeek() };
    },
  });

  // Recent activity: my review decisions + my notes, newest first.
  const { data: recent = [] } = useQuery({
    queryKey: ["emp-recent", uid],
    enabled: !!uid,
    refetchInterval: 30000,
    queryFn: async () => {
      const [decisions, notes] = await Promise.all([
        supabase
          .from("campaign_submissions")
          .select("id, review_status, reviewed_at, application:applications(ref_no)")
          .eq("reviewed_by", uid)
          .not("reviewed_at", "is", null)
          .order("reviewed_at", { ascending: false })
          .limit(10),
        supabase
          .from("review_notes")
          .select("id, note, created_at, application:applications!inner(ref_no)")
          .eq("author_id", uid)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      const acts: Activity[] = [];
      for (const d of (decisions.data ?? []) as unknown as { id: string; review_status: string; reviewed_at: string; application?: { ref_no: number | null } }[]) {
        const verb = d.review_status === "approved" ? "Approved a submission" : d.review_status === "revision" ? "Requested a revision" : d.review_status === "rejected" ? "Rejected a submission" : "Reviewed a submission";
        acts.push({ id: "d" + d.id, text: verb, time: d.reviewed_at, ref: d.application?.ref_no ?? null });
      }
      for (const n of (notes.data ?? []) as unknown as { id: string; note: string; created_at: string; application?: { ref_no: number | null } }[]) {
        acts.push({ id: "n" + n.id, text: n.note, time: n.created_at, ref: n.application?.ref_no ?? null });
      }
      return acts.sort((a, b) => +new Date(b.time) - +new Date(a.time)).slice(0, 10);
    },
  });

  // Unified "assigned to me" work: claimed reviews, claimed tickets, watched apps.
  const { data: mywork } = useQuery({
    queryKey: ["emp-mywork", uid, canSupport],
    enabled: !!uid,
    refetchInterval: 30000,
    queryFn: async () => {
      const [claimedReviews, watched, claimedTickets] = await Promise.all([
        supabase
          .from("campaign_submissions")
          .select("id, created_at, application:applications!inner(id, ref_no, campaign:campaigns(title))")
          .eq("claimed_by", uid)
          .eq("review_status", "pending")
          .order("created_at", { ascending: true }),
        supabase
          .from("application_watchers")
          .select("application_id, application:applications!inner(id, ref_no, status, campaign:campaigns(title))")
          .eq("user_id", uid),
        canSupport
          ? supabase
              .from("support_tickets")
              .select("id, subject, last_message_at")
              .eq("claimed_by", uid)
              .eq("status", "open")
              .order("last_message_at", { ascending: true })
          : Promise.resolve({ data: [] as unknown[] } as { data: unknown[] }),
      ]);
      return {
        reviews: (claimedReviews.data ?? []) as unknown as { id: string; created_at: string; application?: { id: string; ref_no: number | null; campaign?: { title: string | null } } }[],
        watched: (watched.data ?? []) as unknown as { application_id: string; application?: { id: string; ref_no: number | null; status: string; campaign?: { title: string | null } } }[],
        tickets: (claimedTickets.data ?? []) as unknown as { id: string; subject: string; last_message_at: string }[],
      };
    },
  });

  // Team workload leaderboard (this week).
  const { data: leaderboard = [] } = useQuery({
    queryKey: ["emp-leaderboard"],
    refetchInterval: 60000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("review_leaderboard");
      if (error) throw error;
      return (data ?? []) as {
        reviewer_id: string;
        full_name: string | null;
        role: string;
        available: boolean;
        reviews_week: number;
        open_claimed: number;
        support_open: number;
      }[];
    },
  });

  const toggleAvailable = useMutation({
    mutationFn: async (next: boolean) => {
      const { error } = await supabase.from("profiles").update({ available: next }).eq("id", uid);
      if (error) throw error;
    },
    onSuccess: async () => {
      await refreshProfile();
      qc.invalidateQueries({ queryKey: ["emp-leaderboard"] });
    },
  });

  const tiles = [
    { key: "review_queue" as SectionKey, label: "Reviews waiting for me", value: pendingReviews, icon: ListChecks, to: "/review-queue", tone: pendingReviews > 0 ? "text-amber-600" : "text-slate-300" },
    { key: "applications" as SectionKey, label: "Applications to action", value: actionApps, icon: ClipboardList, to: "/applications", tone: actionApps > 0 ? "text-amber-600" : "text-slate-300" },
    ...(canSupport ? [{ key: "support" as SectionKey, label: `Support · ${support?.waiting ?? 0} waiting`, value: `${support?.mine ?? 0}/4`, icon: LifeBuoy, to: "/support", tone: (support?.mine ?? 0) > 0 ? "text-amber-600" : "text-slate-300" }] : []),
    { key: "review_queue" as SectionKey, label: "Reviewed today", value: myReviewed?.today ?? 0, icon: CheckCircle2, to: "/submissions", tone: "text-emerald-600" },
    { key: "review_queue" as SectionKey, label: "Reviewed this week", value: myReviewed?.week ?? 0, icon: CheckCircle2, to: "/submissions", tone: "text-ink" },
  ].filter((t) => can(t.key));

  const quickLinks = [
    { key: "review_queue" as SectionKey, label: "Review Queue", icon: ListChecks, to: "/review-queue" },
    { key: "submissions" as SectionKey, label: "Submissions", icon: FileCheck2, to: "/submissions" },
    { key: "applications" as SectionKey, label: "Applications", icon: ClipboardList, to: "/applications" },
    { key: "support" as SectionKey, label: "Support", icon: LifeBuoy, to: "/support" },
    { key: "instagram_requests" as SectionKey, label: "Instagram Requests", icon: Instagram, to: "/instagram-requests" },
    { key: "sellers" as SectionKey, label: "Brand Management", icon: Store, to: "/sellers" },
  ].filter((l) => can(l.key));

  const totalMyWork = (mywork?.reviews.length ?? 0) + (mywork?.tickets.length ?? 0) + (mywork?.watched.length ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-ink">Good day, {name} 👋</h1>
          <p className="text-sm text-slate-500">
            Here's your work at a glance.
            {myTypes.length > 0 ? (
              <>
                {" "}You handle: <span className="font-semibold capitalize text-ink">{myTypes.join(", ")}</span>.
              </>
            ) : (
              <> No review types assigned yet — ask an admin to assign you Barter, Reimbursement, or Paid.</>
            )}
          </p>
        </div>
        <button
          onClick={() => toggleAvailable.mutate(!available)}
          disabled={toggleAvailable.isPending}
          className={
            "flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold transition " +
            (available ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-slate-200 text-slate-500 hover:bg-slate-300")
          }
          title="Toggle your availability"
        >
          <Power size={14} /> {available ? "Available" : "Away"}
        </button>
      </div>

      {tiles.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {tiles.map((t, i) => (
            <button key={i} onClick={() => navigate(t.to)} className="rounded-2xl border border-slate-100 bg-white px-4 py-4 text-left transition hover:border-primary-200 hover:shadow-sm">
              <t.icon size={18} className="text-slate-400" />
              <p className={`mt-2 text-2xl font-black ${t.tone}`}>{t.value}</p>
              <p className="mt-0.5 text-xs text-slate-500">{t.label}</p>
            </button>
          ))}
        </div>
      )}

      {/* Performance */}
      <Card>
        <CardContent className="p-4">
          <p className="mb-3 text-sm font-bold text-ink">This week's performance</p>
          {perf && perf.total > 0 ? (
            <>
              <div className="mb-3 flex flex-wrap gap-4">
                <Stat label="Decisions" value={perf.total} tone="text-ink" />
                <Stat label="Approved" value={perf.approved} tone="text-emerald-600" />
                <Stat label="Revisions" value={perf.revision} tone="text-amber-600" />
                <Stat label="Rejected" value={perf.rejected} tone="text-rose-600" />
                <Stat label="Per day" value={perf.perDay.toFixed(1)} tone="text-primary" />
              </div>
              <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="bg-emerald-500" style={{ width: `${(perf.approved / perf.total) * 100}%` }} />
                <div className="bg-amber-500" style={{ width: `${(perf.revision / perf.total) * 100}%` }} />
                <div className="bg-rose-500" style={{ width: `${(perf.rejected / perf.total) * 100}%` }} />
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-400">No decisions yet this week — your stats will build up as you review.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* My assigned work */}
        <Card>
          <CardContent className="p-4">
            <p className="mb-3 flex items-center gap-1.5 text-sm font-bold text-ink">
              <ListChecks size={15} /> My work {totalMyWork > 0 ? <span className="text-slate-400">· {totalMyWork}</span> : null}
            </p>
            {totalMyWork === 0 ? (
              <p className="text-sm text-slate-400">Nothing assigned to you right now.</p>
            ) : (
              <div className="space-y-1.5">
                {mywork?.reviews.map((r) => (
                  <button key={"r" + r.id} onClick={() => navigate("/review-queue")} className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left hover:bg-slate-50">
                    <ListChecks size={14} className="shrink-0 text-primary" />
                    <span className="flex-1 truncate text-sm text-slate-700">Review · {r.application?.campaign?.title ?? "Submission"}</span>
                    <AgeBadge iso={r.created_at} />
                  </button>
                ))}
                {mywork?.tickets.map((t) => (
                  <button key={"t" + t.id} onClick={() => navigate("/support")} className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left hover:bg-slate-50">
                    <LifeBuoy size={14} className="shrink-0 text-primary" />
                    <span className="flex-1 truncate text-sm text-slate-700">Support · {t.subject}</span>
                    <AgeBadge iso={t.last_message_at} />
                  </button>
                ))}
                {mywork?.watched.map((w) => (
                  <button key={"w" + w.application_id} onClick={() => navigate(`/applications/${w.application?.id}/review`)} className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left hover:bg-slate-50">
                    <Eye size={14} className="shrink-0 text-slate-400" />
                    <span className="flex-1 truncate text-sm text-slate-700">Watching · {w.application?.campaign?.title ?? "Application"}</span>
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{statusLabel(w.application?.status)}</span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card>
          <CardContent className="p-4">
            <p className="mb-3 flex items-center gap-1.5 text-sm font-bold text-ink">
              <CheckCircle2 size={15} /> My recent activity
            </p>
            {recent.length === 0 ? (
              <p className="text-sm text-slate-400">Nothing yet. Your actions will appear here.</p>
            ) : (
              <div className="space-y-2">
                {recent.map((r) => (
                  <div key={r.id} className="flex items-start justify-between gap-3 border-b border-slate-50 pb-2 last:border-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-700">{r.text}</p>
                      {r.ref != null && <span className="font-mono text-[10px] text-slate-400">{orderRef(r.ref, "order")}</span>}
                    </div>
                    <span className="whitespace-nowrap text-[10px] text-slate-400">{formatDate(r.time)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Team leaderboard */}
        <Card>
          <CardContent className="p-4">
            <p className="mb-3 flex items-center gap-1.5 text-sm font-bold text-ink">
              <Trophy size={15} /> Team this week
            </p>
            {leaderboard.length === 0 ? (
              <p className="text-sm text-slate-400">No team activity yet.</p>
            ) : (
              <div className="space-y-1.5">
                {leaderboard.map((p, i) => (
                  <div key={p.reviewer_id} className="flex items-center gap-2 rounded-lg px-1 py-1.5">
                    <span className="w-5 text-center text-xs font-bold text-slate-400">{i + 1}</span>
                    <span className={"h-2 w-2 shrink-0 rounded-full " + (p.available ? "bg-emerald-500" : "bg-slate-300")} title={p.available ? "Available" : "Away"} />
                    <span className="flex-1 truncate text-sm font-medium text-ink">
                      {p.full_name ?? "Staff"}
                      {p.reviewer_id === uid ? <span className="ml-1 text-[10px] text-primary">(you)</span> : null}
                    </span>
                    <span className="text-xs text-slate-400">{p.open_claimed} open</span>
                    <span className="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-bold text-primary-700">{p.reviews_week}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick links */}
        <Card>
          <CardContent className="p-4">
            <p className="mb-3 text-sm font-bold text-ink">Go to</p>
            <div className="grid grid-cols-2 gap-2">
              {quickLinks.map((l) => (
                <button key={l.to + l.label} onClick={() => navigate(l.to)} className="flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2.5 text-left text-sm font-medium text-slate-600 hover:bg-slate-50">
                  <l.icon size={16} className="text-slate-400" />
                  {l.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone: string }) {
  return (
    <div>
      <p className={`text-xl font-black ${tone}`}>{value}</p>
      <p className="text-[11px] text-slate-400">{label}</p>
    </div>
  );
}

function AgeBadge({ iso }: { iso: string | null | undefined }) {
  const label = ageLabel(iso);
  const old = iso ? Date.now() - new Date(iso).getTime() > 2 * 24 * 3_600_000 : false;
  return (
    <span className={"rounded-full px-1.5 py-0.5 text-[10px] font-semibold " + (old ? "bg-rose-100 text-rose-600" : "bg-slate-100 text-slate-500")}>
      {label}
    </span>
  );
}

export default EmployeeHome;
