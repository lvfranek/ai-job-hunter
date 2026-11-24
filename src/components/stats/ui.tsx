"use client";

import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { parseDbTimestamp } from "@/lib/db-time";
import type { Verdict } from "@/lib/keyword-stats";
import { platformLabels, type Platform } from "@/lib/mock-data";

// Shared pieces of the Statistics page: the card shell, stat tiles, the verdict
// pill, number/date formatting and the small helpers the hand-drawn SVG charts use.

// Chart tokens for the dark theme. Green is the app's accent, so the good-match
// charts use it; orange stays a separate magnitude (blocker share).
export const chart = {
  accent: "#2fd472", // active keywords, new jobs, funnel bars
  muted: "#6b6b72", // paused keywords
  context: "#2a2a2f", // "returned" context columns behind "new"
  grid: "#1d1d20",
  axis: "#34343a",
  ink: "#ededee",
  inkMuted: "#a1a1a8",
  surface: "#0c0c0d", // the card behind the charts: hollow points, outlines
};

// Sequential ramps for the heatmaps, dark → bright. Green counts good matches;
// orange is a separate magnitude (blocker share) so the two never read as one scale.
export const greenRamp = [
  "#161618",
  "#0f2a1a",
  "#14402a",
  "#1b5c3a",
  "#23804e",
  "#2fb066",
  "#4ade80",
];
export const orangeRamp = [
  "#161618",
  "#2e1a0f",
  "#4a2614",
  "#6e3518",
  "#9a4a1f",
  "#cf6a2c",
  "#f08a4b",
];

/** Ramp step for value/max — step 0 is reserved for exactly zero. */
export function rampColor(ramp: string[], value: number, max: number): string {
  if (value <= 0 || max <= 0) return ramp[0];
  const t = Math.min(1, value / max);
  return ramp[Math.max(1, Math.ceil(t * (ramp.length - 1)))];
}

/** Dark text on the bright end of a ramp, light ink on the dark end. */
export function rampTextColor(ramp: string[], fill: string): string {
  return ramp.indexOf(fill) >= ramp.length - 2 ? "#04140a" : chart.ink;
}

export function StatsCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <h2 className="text-[15px] font-semibold text-text">{title}</h2>
          {description && (
            <div className="mt-1 text-[12px] leading-relaxed text-text-faint">{description}</div>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3 sm:px-5 sm:py-4">
      <p className="text-[13px] text-text-faint">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-text">{value}</p>
      {hint && <p className="mt-0.5 text-[12px] text-text-faint">{hint}</p>}
    </div>
  );
}

export const verdictInfo: Record<Verdict, { label: string; className: string; explain: string }> = {
  strong: {
    label: "Strong",
    className: "border-emerald-300 bg-emerald-100 text-emerald-800",
    explain: "Brings clearly more good matches per search than your typical keyword.",
  },
  solid: {
    label: "Solid",
    className: "border-sky-300 bg-sky-100 text-sky-900",
    explain: "Brings about as many good matches per search as your typical keyword.",
  },
  weak: {
    label: "Weak",
    className: "border-rose-300 bg-rose-100 text-rose-800",
    explain: "Brings clearly fewer good matches per search than your typical keyword.",
  },
  redundant: {
    label: "Redundant",
    className: "border-amber-300 bg-amber-100 text-amber-900",
    explain:
      "Almost every job it finds is also found by a stronger keyword — dropping it loses little.",
  },
  new: {
    label: "Too new",
    className: "border-border bg-surface-2 text-text-muted",
    explain: "Fewer than 3 searches so far — not enough data to judge.",
  },
};

export function VerdictPill({ verdict }: { verdict: Verdict }) {
  const info = verdictInfo[verdict];
  return (
    <span
      title={info.explain}
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-px text-[11px] font-medium ${info.className}`}
    >
      {info.label}
    </span>
  );
}

export function StatusPill({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex shrink-0 items-center rounded-full bg-primary px-2 py-px text-[11px] font-medium text-on-primary">
      Active
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center rounded-full border border-dashed border-border-hover px-2 py-px text-[11px] font-medium text-text-muted">
      Paused
    </span>
  );
}

export function portalLabel(portal: string): string {
  return platformLabels[portal as Platform] ?? portal;
}

export function fmtNumber(value: number | null, digits = 0): string {
  if (value === null || Number.isNaN(value)) return "–";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtPercent(ratio: number | null): string {
  return ratio === null ? "–" : `${Math.round(ratio * 100)}%`;
}

export function fmtDate(ts: string | null): string {
  if (!ts) return "–";
  return parseDbTimestamp(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function fmtRelative(ts: string | null): string {
  if (!ts) return "Never";
  const days = Math.floor((Date.now() - parseDbTimestamp(ts).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return fmtDate(ts);
}

/** Round, readable axis ticks from 0 to at least `max`. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * magnitude >= rough) ?? 10) * magnitude;
  const ticks: number[] = [];
  for (let v = 0; v < max + step * 0.999; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

/** Live pixel width of an element, so the SVG charts draw at real size (crisp text on phones). */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/** Hover/focus readout for the SVG charts: value first, label second. */
export function ChartTooltip({
  x,
  y,
  title,
  rows,
}: {
  x: number;
  y: number;
  title: string;
  rows: { label: string; value: string }[];
}) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 w-max max-w-60 -translate-x-1/2 -translate-y-full rounded-xl border border-border bg-surface px-3 py-2 text-[12px]"
      style={{ left: x, top: y - 10 }}
    >
      <p className="mb-1 font-medium text-text">{title}</p>
      {rows.map((row) => (
        <p key={row.label} className="flex justify-between gap-4 text-text-muted">
          <span>{row.label}</span>
          <span className="font-semibold tabular-nums text-text">{row.value}</span>
        </p>
      ))}
    </div>
  );
}
