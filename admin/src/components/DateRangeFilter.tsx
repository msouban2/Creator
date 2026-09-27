import { useState } from "react";
import { Calendar } from "lucide-react";

export type DateRange = { from: string | null; to: string | null };

const PRESETS: { key: string; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
];

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function presetRange(key: string): DateRange {
  const now = new Date();
  switch (key) {
    case "today":
      return { from: startOfDay(now).toISOString(), to: null };
    case "7d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      return { from: startOfDay(d).toISOString(), to: null };
    }
    case "30d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 29);
      return { from: startOfDay(d).toISOString(), to: null };
    }
    case "month":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to: null };
    case "year":
      return { from: new Date(now.getFullYear(), 0, 1).toISOString(), to: null };
    default:
      return { from: null, to: null };
  }
}

/** True when a timestamp falls inside the (inclusive) range. */
export function inRange(dateStr: string | null | undefined, range: DateRange): boolean {
  if (!range.from && !range.to) return true;
  if (!dateStr) return false;
  const t = new Date(dateStr).getTime();
  if (range.from && t < new Date(range.from).getTime()) return false;
  if (range.to && t > new Date(range.to).getTime()) return false;
  return true;
}

export function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (r: DateRange) => void;
}) {
  const [preset, setPreset] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const pick = (key: string) => {
    setPreset(key);
    setCustomFrom("");
    setCustomTo("");
    onChange(presetRange(key));
  };

  const applyCustom = (from: string, to: string) => {
    setPreset("custom");
    onChange({
      from: from ? new Date(`${from}T00:00:00`).toISOString() : null,
      to: to ? new Date(`${to}T23:59:59`).toISOString() : null,
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <Calendar size={14} /> Period
      </span>
      {PRESETS.map((p) => (
        <button
          key={p.key}
          onClick={() => pick(p.key)}
          className={
            "rounded-full px-3 py-1.5 text-sm font-semibold transition-colors " +
            (preset === p.key ? "bg-ink text-white" : "bg-white text-slate-600 hover:bg-slate-100")
          }
        >
          {p.label}
        </button>
      ))}
      <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1">
        <input
          type="date"
          value={customFrom}
          max={customTo || undefined}
          onChange={(e) => {
            setCustomFrom(e.target.value);
            applyCustom(e.target.value, customTo);
          }}
          className="bg-transparent text-xs text-slate-600 outline-none"
        />
        <span className="text-xs text-slate-400">→</span>
        <input
          type="date"
          value={customTo}
          min={customFrom || undefined}
          onChange={(e) => {
            setCustomTo(e.target.value);
            applyCustom(customFrom, e.target.value);
          }}
          className="bg-transparent text-xs text-slate-600 outline-none"
        />
      </div>
      {(value.from || value.to) && (
        <button
          onClick={() => pick("all")}
          className="rounded-full px-2 py-1 text-xs font-semibold text-primary hover:underline"
        >
          Clear
        </button>
      )}
    </div>
  );
}
