import { useMemo, useState, type ReactNode } from "react";
import { Instagram, Youtube, RefreshCw } from "lucide-react";
import type { Profile } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

function num(v: number | null | undefined) {
  if (v == null) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return v.toLocaleString("en-IN");
}

type Platform = "instagram" | "youtube";

// Instagram + YouTube engagement snapshot for a creator. Admins/employees can
// switch between the two platforms and refresh the numbers on the creator's
// behalf (e.g. when the creator can't do it themselves).
export function CreatorInsights({ creator }: { creator?: Profile }) {
  // Local overrides applied after an admin refresh, merged over the prop.
  const [override, setOverride] = useState<Partial<Profile>>({});
  const c = useMemo(() => ({ ...(creator ?? {}), ...override }) as Profile, [creator, override]);

  const igConnected = !!c?.instagram_username || c?.ig_insights_synced_at != null;
  const ytConnected = !!c?.youtube_verified || c?.yt_insights_synced_at != null || (c?.youtube_subscribers ?? 0) > 0;

  const [tab, setTab] = useState<Platform>(igConnected || !ytConnected ? "instagram" : "youtube");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!creator) return null;

  const connected = tab === "instagram" ? igConnected : ytConnected;
  const synced = tab === "instagram" ? c.ig_insights_synced_at : c.yt_insights_synced_at;

  const igMetrics = [
    { label: "Followers", value: num(c.instagram_followers) },
    { label: "Engagement", value: c.ig_engagement_rate != null ? `${c.ig_engagement_rate}%` : "—", accent: true },
    { label: "Reach", value: num(c.ig_reach) },
    { label: "Avg views", value: num(c.ig_avg_views) },
    { label: "Avg likes", value: num(c.ig_avg_likes) },
    { label: "Avg comments", value: num(c.ig_avg_comments) },
  ];
  const ytMetrics = [
    { label: "Subscribers", value: num(c.youtube_subscribers) },
    { label: "Engagement", value: c.youtube_engagement_rate != null ? `${c.youtube_engagement_rate}%` : "—", accent: true },
    { label: "Total views", value: num(c.youtube_views) },
    { label: "Videos", value: num(c.youtube_video_count) },
    { label: "Avg views", value: num(c.youtube_avg_views) },
    { label: "Avg likes", value: num(c.youtube_avg_likes) },
  ];
  const metrics = tab === "instagram" ? igMetrics : ytMetrics;

  const title =
    tab === "instagram"
      ? c.instagram_username
        ? `@${c.instagram_username}`
        : "Instagram"
      : c.youtube_channel_title || c.youtube_channel || "YouTube";

  const refresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("admin-refresh-insights", {
        body: { user_id: creator.id, platform: tab },
      });
      if (fnErr) throw fnErr;
      const res = data as { refreshed?: boolean; error?: string; patch?: Partial<Profile> };
      if (res?.refreshed && res.patch) {
        setOverride((prev) => ({ ...prev, ...res.patch }));
      } else {
        setError(res?.error ?? "Couldn't refresh right now.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't refresh right now.");
    } finally {
      setRefreshing(false);
    }
  };

  const TabButton = ({ p, children }: { p: Platform; children: ReactNode }) => {
    const active = tab === p;
    const activeBg =
      p === "instagram" ? "bg-gradient-to-br from-fuchsia-500 to-orange-400 text-white" : "bg-red-600 text-white";
    return (
      <button
        type="button"
        onClick={() => {
          setTab(p);
          setError(null);
        }}
        className={`flex h-6 w-6 items-center justify-center rounded-lg transition ${
          active ? activeBg : "bg-slate-100 text-slate-400 hover:bg-slate-200"
        }`}
        title={p === "instagram" ? "Instagram insights" : "YouTube insights"}
      >
        {children}
      </button>
    );
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span className="flex items-center gap-1.5">
            <TabButton p="instagram">
              <Instagram size={13} />
            </TabButton>
            <TabButton p="youtube">
              <Youtube size={13} />
            </TabButton>
          </span>
          <span className="ml-1">{title}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400">
            {synced ? `Updated ${formatDate(synced)}` : "Not connected yet"}
          </span>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing || !connected}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            title={`Refresh ${tab === "instagram" ? "Instagram" : "YouTube"} insights`}
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
          </button>
        </span>
      </div>

      {connected ? (
        <div className="flex flex-wrap divide-x divide-slate-100 border-t border-slate-100">
          {metrics.map((m) => (
            <div key={m.label} className="flex-1 basis-1/3 px-4 py-3 sm:basis-0">
              <p className={`text-lg font-black leading-none ${m.accent ? "text-primary" : "text-ink"}`}>{m.value}</p>
              <p className="mt-1 text-[11px] font-medium text-slate-400">{m.label}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-400">
          This creator hasn&apos;t {tab === "instagram" ? "connected Instagram" : "verified YouTube"} yet.
        </div>
      )}

      {error ? <div className="border-t border-slate-100 px-4 py-2 text-[11px] text-red-500">{error}</div> : null}
    </div>
  );
}
