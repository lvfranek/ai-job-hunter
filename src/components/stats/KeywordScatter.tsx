"use client";

import { useRef, useState } from "react";
import type { KeywordStat } from "@/lib/keyword-stats";
import { chart, ChartTooltip, fmtNumber, niceTicks, useElementWidth } from "@/components/stats/ui";

const HEIGHT = 300;
const PAD = { top: 16, right: 16, bottom: 40, left: 44 };
const LABEL_FONT = 12;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Volume (jobs found per search) against quality (average score), one dot per
 * keyword. The median lines split it into four quadrants: top right is what
 * you want more of, bottom left is what to rotate out.
 */
export function KeywordScatter({ keywords }: { keywords: KeywordStat[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(wrapRef);
  const [hovered, setHovered] = useState<string | null>(null);

  const points = keywords.filter((k) => k.jobsPerSearch !== null && k.avgScore !== null);
  const skipped = keywords.filter((k) => !points.includes(k));

  if (points.length === 0) {
    return (
      <p className="text-[13px] text-text-muted">
        Nothing to plot yet — keywords show up here after their first scored search.
      </p>
    );
  }

  const xs = points.map((p) => p.jobsPerSearch as number);
  const ys = points.map((p) => p.avgScore as number);
  const xTicks = niceTicks(Math.max(...xs) * 1.1);
  const xMax = xTicks.at(-1) as number;
  const yMin = Math.max(0, Math.floor((Math.min(...ys) - 8) / 10) * 10);
  const yMax = Math.min(100, Math.ceil((Math.max(...ys) + 8) / 10) * 10);
  const yTicks = niceTicks(yMax - yMin, 4)
    .map((t) => t + yMin)
    .filter((t) => t <= yMax);
  const maxGood = Math.max(1, ...points.map((p) => p.goodMatches));

  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const sx = (v: number) => PAD.left + (v / xMax) * plotW;
  const sy = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;
  // 8–16px across: big enough to hit and to compare, small enough not to crowd.
  const radius = (good: number) => 4 + 4 * Math.sqrt(good / maxGood);

  const midX = sx(median(xs));
  const midY = sy(median(ys));
  // Each quadrant says literally what it means, relative to the median lines.
  // Two short lines so the top pair still fits side by side on a phone.
  const QUADRANT_LINE = 13;
  const top = PAD.top + 12;
  const bottom = PAD.top + plotH - 6 - QUADRANT_LINE;
  const quadrants = [
    { lines: ["Fewer jobs,", "better scores"], x: PAD.left + 6, y: top, anchor: "start" as const },
    {
      lines: ["More jobs,", "better scores"],
      x: PAD.left + plotW - 6,
      y: top,
      anchor: "end" as const,
    },
    {
      lines: ["Fewer jobs,", "worse scores"],
      x: PAD.left + 6,
      y: bottom,
      anchor: "start" as const,
    },
    {
      lines: ["More jobs,", "worse scores"],
      x: PAD.left + plotW - 6,
      y: bottom,
      anchor: "end" as const,
    },
  ];

  // Direct labels: right of the dot, else left, above or below — the first spot
  // that stays inside the plot and clears other labels and dots. A label with no
  // free spot is left off; the tooltip and the keyword table still carry it.
  type Box = { x1: number; x2: number; y1: number; y2: number };
  const overlaps = (a: Box, b: Box) => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
  const dots: (Box & { keyword: string })[] = points.map((p) => {
    const cx = sx(p.jobsPerSearch as number);
    const cy = sy(p.avgScore as number);
    const r = radius(p.goodMatches);
    return { keyword: p.keyword, x1: cx - r, x2: cx + r, y1: cy - r, y2: cy + r };
  });
  const textBox = (x: number, baseline: number, w: number, anchor: "start" | "end" | "middle") => {
    const x1 = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
    return { x1, x2: x1 + w, y1: baseline - LABEL_FONT, y2: baseline + 3 };
  };
  const textWidth = (text: string) => text.length * LABEL_FONT * 0.56;
  const placed: Box[] = quadrants.map((q) => {
    const box = textBox(q.x, q.y, Math.max(...q.lines.map(textWidth)), q.anchor);
    return { ...box, y2: box.y2 + QUADRANT_LINE };
  });
  const labels = [...points]
    .sort((a, b) => b.goodMatches - a.goodMatches)
    .flatMap((p) => {
      const cx = sx(p.jobsPerSearch as number);
      const cy = sy(p.avgScore as number);
      const r = radius(p.goodMatches);
      const w = textWidth(p.keyword);
      const spots = (
        [
          { x: cx + r + 6, y: cy + 4, anchor: "start" },
          { x: cx - r - 6, y: cy + 4, anchor: "end" },
          { x: cx, y: cy - r - 6, anchor: "middle" },
          { x: cx, y: cy + r + LABEL_FONT + 4, anchor: "middle" },
        ] as const
      ).map((spot) => ({ ...spot, box: textBox(spot.x, spot.y, w, spot.anchor) }));
      const spot = spots.find(
        ({ box }) =>
          box.x1 >= PAD.left &&
          box.x2 <= PAD.left + plotW &&
          box.y1 >= PAD.top &&
          box.y2 <= PAD.top + plotH &&
          !placed.some((b) => overlaps(b, box)) &&
          !dots.some((d) => d.keyword !== p.keyword && overlaps(d, box)),
      );
      if (!spot) return [];
      placed.push(spot.box);
      return [{ keyword: p.keyword, x: spot.x, y: spot.y, anchor: spot.anchor }];
    });

  const active = points.find((p) => p.keyword === hovered);
  const hasPaused = points.some((p) => !p.active);

  return (
    <div>
      <div ref={wrapRef} className="relative" style={{ height: HEIGHT }}>
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label="Keywords by jobs found per search and average score"
          >
            {/* Quadrant guides: medians of the plotted keywords. */}
            <line x1={midX} x2={midX} y1={PAD.top} y2={PAD.top + plotH} stroke={chart.axis} />
            <line x1={PAD.left} x2={PAD.left + plotW} y1={midY} y2={midY} stroke={chart.axis} />
            {quadrants.map((q) => (
              <text
                key={q.lines.join(" ")}
                x={q.x}
                y={q.y}
                textAnchor={q.anchor}
                fontSize={11}
                fill={chart.inkMuted}
              >
                {q.lines.map((line, i) => (
                  <tspan key={line} x={q.x} dy={i === 0 ? 0 : QUADRANT_LINE}>
                    {line}
                  </tspan>
                ))}
              </text>
            ))}

            {yTicks.map((t) => (
              <g key={`y${t}`}>
                <line
                  x1={PAD.left}
                  x2={PAD.left + plotW}
                  y1={sy(t)}
                  y2={sy(t)}
                  stroke={chart.grid}
                />
                <text
                  x={PAD.left - 8}
                  y={sy(t) + 4}
                  textAnchor="end"
                  fontSize={11}
                  fill={chart.inkMuted}
                  className="tabular-nums"
                >
                  {t}
                </text>
              </g>
            ))}
            {xTicks.map((t) => (
              <text
                key={`x${t}`}
                x={sx(t)}
                y={PAD.top + plotH + 18}
                textAnchor="middle"
                fontSize={11}
                fill={chart.inkMuted}
                className="tabular-nums"
              >
                {fmtNumber(t, t % 1 ? 1 : 0)}
              </text>
            ))}
            <line
              x1={PAD.left}
              x2={PAD.left + plotW}
              y1={PAD.top + plotH}
              y2={PAD.top + plotH}
              stroke={chart.axis}
            />
            <text
              x={PAD.left + plotW / 2}
              y={HEIGHT - 4}
              textAnchor="middle"
              fontSize={11}
              fill={chart.inkMuted}
            >
              Jobs found per search →
            </text>
            <text
              transform={`translate(12 ${PAD.top + plotH / 2}) rotate(-90)`}
              textAnchor="middle"
              fontSize={11}
              fill={chart.inkMuted}
            >
              Average score →
            </text>

            {points.map((p) => {
              const cx = sx(p.jobsPerSearch as number);
              const cy = sy(p.avgScore as number);
              const r = radius(p.goodMatches);
              return (
                <g
                  key={p.keyword}
                  tabIndex={0}
                  role="button"
                  aria-label={`${p.keyword}: ${fmtNumber(p.jobsPerSearch, 1)} jobs per search, average score ${fmtNumber(p.avgScore)}, ${p.goodMatches} matches of 80 or more`}
                  onPointerEnter={() => setHovered(p.keyword)}
                  onPointerLeave={() => setHovered(null)}
                  onFocus={() => setHovered(p.keyword)}
                  onBlur={() => setHovered(null)}
                  className="cursor-default outline-none"
                >
                  {/* Hit area bigger than the mark (≥ 24px). */}
                  <circle cx={cx} cy={cy} r={Math.max(r + 4, 12)} fill="transparent" />
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill={p.active ? chart.accent : "#ffffff"}
                    stroke={p.active ? "#ffffff" : chart.muted}
                    strokeWidth={2}
                    opacity={hovered && hovered !== p.keyword ? 0.45 : 1}
                  />
                </g>
              );
            })}
            {labels.map((l) => (
              <text
                key={`label-${l.keyword}`}
                x={l.x}
                y={l.y}
                textAnchor={l.anchor}
                fontSize={LABEL_FONT}
                fill={chart.ink}
                pointerEvents="none"
                stroke="#ffffff"
                strokeWidth={3}
                paintOrder="stroke"
              >
                {l.keyword}
              </text>
            ))}
          </svg>
        )}
        {active && (
          <ChartTooltip
            x={Math.min(Math.max(sx(active.jobsPerSearch as number), 110), width - 110)}
            y={sy(active.avgScore as number) - radius(active.goodMatches)}
            title={active.keyword}
            rows={[
              { label: "Jobs per search", value: fmtNumber(active.jobsPerSearch, 1) },
              { label: "Average score", value: fmtNumber(active.avgScore) },
              { label: "80+ matches", value: fmtNumber(active.goodMatches) },
              { label: "Searches", value: fmtNumber(active.searches) },
            ]}
          />
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <svg width="12" height="12" aria-hidden="true">
            <circle cx="6" cy="6" r="5" fill={chart.accent} />
          </svg>
          Active keyword
        </span>
        {hasPaused && (
          <span className="inline-flex items-center gap-1.5">
            <svg width="12" height="12" aria-hidden="true">
              <circle cx="6" cy="6" r="4.5" fill="#ffffff" stroke={chart.muted} strokeWidth="2" />
            </svg>
            Paused keyword
          </span>
        )}
        <span>Dot size = 80+ matches · lines = your median keyword</span>
        {skipped.length > 0 && (
          <span>Not plotted yet: {skipped.map((k) => k.keyword).join(", ")}</span>
        )}
      </div>
    </div>
  );
}
