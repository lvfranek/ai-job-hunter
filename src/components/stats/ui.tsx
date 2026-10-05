"use client";

import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { parseDbTimestamp } from "@/lib/db-time";
import type { Verdict } from "@/lib/keyword-stats";
import { platformLabels, type Platform } from "@/lib/mock-data";

// Shared pieces of the Statistics page: the card shell, stat tiles, the verdict
// pill, number/date formatting and the small helpers the hand-drawn SVG charts use.

// Chart tokens (the dataviz reference palette, light mode — the app has no dark theme).
export const chart = {
  accent: "#2a78d6", // active keywords, new jobs, funnel bars
  muted: "#898781", // paused keywords
  context: "#d6d9dd", // "returned" context columns behind "new"
  grid: "#e6ebf0",
  axis: "#c3cbd3",
  ink: "#1E2A3D",
  inkMuted: "#586878",
};

// Sequential ramps for the heatmaps, light → dark. Blue counts good matches;
// orange is a separate magnitude (blocker share) so the two never read as one scale.
export const blueRamp = [
  "#eef4fb",
  "#cde2fb",
  "#9ec5f4",
  "#6da7ec",
  "#3987e5",
  "#256abf",
  "#184f95",
];
export const orangeRamp = [
  "#fbf1ec",
  "#fde0d2",
  "#f9bfa3",
  "#f39b72",
  "#eb6834",
  "#c9501f",
  "#a03c12",
];

/** Ramp step for value/max — step 0 is reserved for exactly zero. */
export function rampColor(ramp: string[], value: number, max: number): string {
  if (value <= 0 || max <= 0) return ramp[0];
  const t = Math.min(1, value / max);
  return ramp[Math.max(1, Math.ceil(t * (ramp.length - 1)))];
}

/** White text on the dark end of a ramp, ink on the light end. */
export function rampTextColor(ramp: string[], fill: string): string {
  return ramp.indexOf(fill) >= ramp.length - 3 ? "#ffffff" : chart.ink;
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
    <section className="rounded-3xl border border-white bg-linear-to-b from-white to-[#F7FBFD] p-4 shadow-[0_16px_40px_-18px_rgba(30,64,120,0.35)] sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <h2 className="text-[15px] font-semibold text-[#1E2A3D]">{title}</h2>
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
    <div className="rounded-2xl border border-white bg-linear-to-b from-white to-[#F5FAFD] px-4 py-3 shadow-[0_10px_30px_-14px_rgba(30,64,120,0.3)] sm:px-5 sm:py-4">
      <p className="text-[13px] text-text-faint">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[#1E2A3D]">{value}</p>
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
    className: "border-[#C9D6E2] bg-[#EEF3F7] text-text-muted",
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
    <span className="inline-flex shrink-0 items-center rounded-full bg-[#101828] px-2 py-px text-[11px] font-medium text-white">
      Active
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center rounded-full border border-dashed border-[#9AACBD] px-2 py-px text-[11px] font-medium text-text-muted">
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
      className="pointer-events-none absolute z-10 w-max max-w-60 -translate-x-1/2 -translate-y-full rounded-xl border border-[#D7E4ED] bg-white px-3 py-2 text-[12px] shadow-[0_12px_30px_-12px_rgba(30,64,120,0.45)]"
      style={{ left: x, top: y - 10 }}
    >
      <p className="mb-1 font-medium text-[#1E2A3D]">{title}</p>
      {rows.map((row) => (
        <p key={row.label} className="flex justify-between gap-4 text-text-muted">
          <span>{row.label}</span>
          <span className="font-semibold tabular-nums text-[#1E2A3D]">{row.value}</span>
        </p>
      ))}
    </div>
  );
}
