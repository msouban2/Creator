// Small presentational helpers that make the workflow legible at a glance:
//  • TurnPill     — "👉 Your action" vs "⏳ Waiting on creator" vs "✓ Done"
//  • StageTracker — a compact Applied › Ordering › … › Paid progress strip
import { flowStages, currentStageIndex } from "@/lib/workflow";
import type { CampaignType } from "@/lib/types";

export type Turn = "employee" | "creator" | "seller" | "done";

const TURN_STYLES: Record<Turn, { cls: string; icon: string; fallback: string }> = {
  employee: { cls: "bg-amber-100 text-amber-800", icon: "👉", fallback: "Your action" },
  creator: { cls: "bg-slate-100 text-slate-500", icon: "⏳", fallback: "Waiting on creator" },
  seller: { cls: "bg-indigo-100 text-indigo-700", icon: "🏬", fallback: "Waiting on brand" },
  done: { cls: "bg-emerald-100 text-emerald-700", icon: "✓", fallback: "Done" },
};

export function TurnPill({ who, text, className }: { who: Turn; text?: string; className?: string }) {
  const s = TURN_STYLES[who];
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold " +
        s.cls +
        (className ? " " + className : "")
      }
    >
      <span aria-hidden>{s.icon}</span>
      {text ?? s.fallback}
    </span>
  );
}

export function StageTracker({
  type,
  status,
}: {
  type: CampaignType | undefined;
  status: string;
}) {
  const stages = flowStages(type);
  if (stages.length === 0) return null;

  const rejected = status === "rejected";
  const current = rejected ? -1 : currentStageIndex(type, status);

  return (
    <div className="flex flex-wrap items-center gap-1">
      {stages.map((stage, i) => {
        const done = current > i;
        const active = current === i;
        const cls = active
          ? "bg-amber-500 text-white"
          : done
          ? "bg-emerald-500 text-white"
          : "bg-slate-100 text-slate-400";
        return (
          <span key={stage.label} className="flex items-center gap-1">
            <span className={"rounded-full px-2 py-0.5 text-[10px] font-semibold " + cls}>
              {stage.label}
            </span>
            {i < stages.length - 1 && <span className="text-slate-300">›</span>}
          </span>
        );
      })}
      {rejected && (
        <span className="ml-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
          Rejected
        </span>
      )}
    </div>
  );
}
