"use client";

import { Fragment, useRef, useState } from "react";
import { CaretDown, CaretUp, Warning } from "@phosphor-icons/react/dist/ssr";
import type { KeywordRunPoint, KeywordStat } from "@/lib/keyword-stats";
import { SwapKeywordMenu } from "@/components/stats/SwapKeywordMenu";
import {
  chart,
  ChartTooltip,
  fmtDate,
  fmtNumber,
  fmtPercent,
  fmtRelative,
  niceTicks,
  portalLabel,
  StatusPill,
  useElementWidth,
  verdictInfo,
  VerdictPill,
} from "@/components/stats/ui";

type SortKey =
  | "keyword"
  | "jobs"
  | "newPerSearch"
  | "exclusive"
  | "avgScore"
  | "goodMatches"
  | "applied"
  | "lastSearchedAt";

const columns: { key: SortKey; label: string; title: string; numeric: boolean }[] = [
  { key: "keyword", label: "Keyword", title: "Search keyword", numeric: false },
  { key: "jobs", label: "Jobs", title: "Distinct jobs this keyword ever found", numeric: true },
  {
    key: "newPerSearch",
    label: "New / search",
    title: "Jobs new to your list per search — falls when a keyword is exhausted",
    numeric: true,
  },
  {
    key: "exclusive",
    label: "Only here",
    title: "Share of its jobs no other keyword found — low means redundant",
    numeric: true,
  },
  { key: "avgScore", label: "Avg score", title: "Average match score of its jobs", numeric: true },
  { key: "goodMatches", label: "80+", title: "Jobs that scored 80 or more", numeric: true },
  {
    key: "applied",
    label: "Applied",
    title: "Jobs you applied to (incl. interviews)",
    numeric: true,
  },
  {
    key: "lastSearchedAt",
    label: "Last searched",
    title: "Last scrape that ran it",
    numeric: true,
  },
];

function sortValue(k: KeywordStat, key: SortKey): number | string {
  switch (key) {
    case "keyword":
      return k.keyword;
    case "exclusive":
      return k.jobs ? k.exclusive / k.jobs : -1;
    case "lastSearchedAt":
      return k.lastSearchedAt ?? "";
    default:
      return k[key] ?? -1;
  }
}

/** New jobs per run as a tiny line — the shape of a keyword drying up. */
function Sparkline({ points }: { points: KeywordRunPoint[] }) {
  if (points.length < 2) return <span className="text-text-faint">–</span>;
  const w = 88;
  const h = 26;
  const max = Math.max(1, ...points.map((p) => p.newJobs));
  const step = (w - 8) / (points.length - 1);
  const coords = points.map((p, i) => [4 + i * step, h - 4 - (p.newJobs / max) * (h - 8)]);
  const last = coords.at(-1) as number[];
  return (
    <svg
      width={w}
      height={h}
      role="img"
      aria-label={`New jobs per run, oldest to newest: ${points.map((p) => p.newJobs).join(", ")}`}
    >
      <polyline
        points={coords.map((c) => c.join(",")).join(" ")}
        fill="none"
        stroke={chart.accent}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={last[0]}
        cy={last[1]}
        r={4}
        fill={chart.accent}
        stroke="#ffffff"
        strokeWidth={2}
      />
    </svg>
  );
}

/** Per run: new jobs (accent) stacked under already-known ones (context gray). */
function RunChart({ points }: { points: KeywordRunPoint[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(wrapRef);
  const [hovered, setHovered] = useState<number | null>(null);
  const height = 150;
  const pad = { top: 8, right: 4, bottom: 22, left: 30 };

  const ticks = niceTicks(Math.max(1, ...points.map((p) => p.returned)), 3);
  const yMax = ticks.at(-1) as number;
  const plotW = Math.max(0, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const band = plotW / Math.max(1, points.length);
  const barW = Math.min(24, Math.max(4, band * 0.6));
  const sy = (v: number) => pad.top + plotH - (v / yMax) * plotH;
  const hov = hovered === null ? null : points[hovered];

  return (
    <div>
      <div ref={wrapRef} className="relative" style={{ height }}>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label="New and already known jobs per scrape run"
          >
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={pad.left}
                  x2={pad.left + plotW}
                  y1={sy(t)}
                  y2={sy(t)}
                  stroke={t === 0 ? chart.axis : chart.grid}
                />
                <text
                  x={pad.left - 6}
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
            {points.map((p, i) => {
              const x = pad.left + i * band + (band - barW) / 2;
              const known = Math.max(0, p.returned - p.newJobs);
              const newTop = sy(p.newJobs);
              // 2px surface gap between the two stacked segments.
              const knownBottom = newTop - (p.newJobs > 0 ? 2 : 0);
              const knownTop = sy(p.newJobs + known);
              const dim = hovered !== null && hovered !== i ? 0.45 : 1;
              return (
                <g
                  key={`${p.runAt}-${i}`}
                  tabIndex={0}
                  role="button"
                  aria-label={`${fmtDate(p.runAt)}: ${p.newJobs} new, ${known} already known`}
                  onPointerEnter={() => setHovered(i)}
                  onPointerLeave={() => setHovered(null)}
                  onFocus={() => setHovered(i)}
                  onBlur={() => setHovered(null)}
                  className="outline-none"
                  opacity={dim}
                >
                  <rect
                    x={pad.left + i * band}
                    y={pad.top}
                    width={band}
                    height={plotH}
                    fill="transparent"
                  />
                  {known > 0 && knownBottom > knownTop && (
                    <path
                      d={roundedTop(x, knownTop, barW, knownBottom - knownTop)}
                      fill={chart.context}
                    />
                  )}
                  {p.newJobs > 0 && (
                    <path
                      d={
                        known > 0
                          ? `M${x},${newTop}h${barW}V${sy(0)}H${x}Z`
                          : roundedTop(x, newTop, barW, sy(0) - newTop)
                      }
                      fill={chart.accent}
                    />
                  )}
                </g>
              );
            })}
            {points.length > 0 && (
              <>
                <text x={pad.left} y={height - 4} fontSize={11} fill={chart.inkMuted}>
                  {fmtDate(points[0].runAt)}
                </text>
                <text
                  x={pad.left + plotW}
                  y={height - 4}
                  textAnchor="end"
                  fontSize={11}
                  fill={chart.inkMuted}
                >
                  {fmtDate(points.at(-1)!.runAt)}
                </text>
              </>
            )}
          </svg>
        )}
        {hov && hovered !== null && (
          <ChartTooltip
            x={Math.min(Math.max(pad.left + hovered * band + band / 2, 90), width - 90)}
            y={sy(hov.returned)}
            title={`Run on ${fmtDate(hov.runAt)}`}
            rows={[
              { label: "New", value: String(hov.newJobs) },
              { label: "Already known", value: String(Math.max(0, hov.returned - hov.newJobs)) },
            ]}
          />
        )}
      </div>
      <div className="mt-2 flex gap-4 text-[12px] text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: chart.accent }} />
          New to your list
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: chart.context }} />
          Already known
        </span>
      </div>
      {/* Table twin for screen readers — the light gray segment is below 3:1. */}
      <table className="sr-only">
        <caption>Jobs per scrape run</caption>
        <thead>
          <tr>
            <th>Run</th>
            <th>New</th>
            <th>Already known</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p, i) => (
            <tr key={`${p.runAt}-${i}`}>
              <td>{fmtDate(p.runAt)}</td>
              <td>{p.newJobs}</td>
              <td>{Math.max(0, p.returned - p.newJobs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A column with a 4px rounded data end and a square base. */
function roundedTop(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function KeywordDetail({
  k,
  active,
  slots,
  busy,
  onSwap,
}: {
  k: KeywordStat;
  active: KeywordStat[];
  slots: number;
  busy: boolean;
  onSwap: (incoming: string, outgoing: string | null) => void;
}) {
  const { recent, earlier } = k.freshness;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-text-faint">
          Per scrape run
        </h3>
        {k.trend.length > 0 ? (
          <>
            <RunChart points={k.trend} />
            <p className="mt-2 text-[12px] text-text-muted">
              Lately {fmtPercent(recent)} of its results were new
              {earlier !== null && <> (before: {fmtPercent(earlier)})</>}.
              {recent !== null && earlier !== null && recent < earlier * 0.5 && (
                <> It is running dry — most of what it finds you already have.</>
              )}
            </p>
          </>
        ) : (
          <p className="text-[13px] text-text-muted">Not searched since tracking started.</p>
        )}
      </div>

      <div className="min-w-0">
        <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-text-faint">
          By job board
        </h3>
        {k.boards.length > 0 ? (
          <table className="w-full text-[12px]">
            <thead className="text-left text-text-faint">
              <tr>
                <th className="pb-1 font-medium">Board</th>
                <th className="pb-1 text-right font-medium">Jobs</th>
                <th className="pb-1 text-right font-medium">Avg</th>
                <th className="pb-1 text-right font-medium">80+</th>
              </tr>
            </thead>
            <tbody className="tabular-nums text-[#1E2A3D]">
              {k.boards.map((b) => (
                <tr key={b.portal} className="border-t border-[#E6EEF4]">
                  <td className="py-1">
                    {portalLabel(b.portal)}
                    {b.capHits > 0 && (
                      <span
                        className="ml-1.5 text-[11px] text-amber-800"
                        title="Searches that returned as many results as allowed — there was probably more"
                      >
                        limit {b.capHits}/{b.searches}
                      </span>
                    )}
                    {b.failures > 0 && (
                      <span className="ml-1.5 text-[11px] text-rose-800">failed {b.failures}×</span>
                    )}
                  </td>
                  <td className="py-1 text-right">{b.jobs}</td>
                  <td className="py-1 text-right">{fmtNumber(b.avgScore)}</td>
                  <td className="py-1 text-right">{b.goodMatches}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-[13px] text-text-muted">No jobs yet.</p>
        )}
      </div>

      <div className="min-w-0 space-y-2 text-[13px] text-text-muted">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-text-faint">
          At a glance
        </h3>
        <p>
          <VerdictPill verdict={k.verdict} />{" "}
          <span className="align-middle">{verdictInfo[k.verdict].explain}</span>
        </p>
        <p>
          Brought in <b className="font-semibold text-[#1E2A3D]">{k.discovered}</b> of its {k.jobs}{" "}
          jobs first; <b className="font-semibold text-[#1E2A3D]">{k.exclusive}</b> (
          {fmtPercent(k.jobs ? k.exclusive / k.jobs : null)}) no other keyword found.
        </p>
        {k.overlap && (
          <p>
            Most overlap with <span className="text-[#1E2A3D]">“{k.overlap.keyword}”</span>:{" "}
            {k.overlap.shared} shared jobs ({fmtPercent(k.jobs ? k.overlap.shared / k.jobs : null)}
            ).
          </p>
        )}
        <p>
          You marked {k.interested} interested, {k.applied} applied, {k.interviews} interview,{" "}
          {k.notInterested} not interested.
        </p>
        <p>
          Searched {k.searches}× · first {fmtDate(k.firstSearchedAt)} · last{" "}
          {fmtDate(k.lastSearchedAt)}
        </p>
        {!k.active && (
          <div className="pt-1">
            <SwapKeywordMenu
              incoming={k.keyword}
              active={active}
              slots={slots}
              busy={busy}
              onSwap={onSwap}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function KeywordTable({
  keywords,
  slots,
  busy,
  onSwap,
}: {
  keywords: KeywordStat[];
  slots: number;
  busy: boolean;
  onSwap: (incoming: string, outgoing: string | null) => void;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const active = keywords.filter((k) => k.active);

  const rows = sort
    ? [...keywords].sort((a, b) => {
        const av = sortValue(a, sort.key);
        const bv = sortValue(b, sort.key);
        const cmp = typeof av === "string" ? av.localeCompare(bv as string) : av - (bv as number);
        return sort.dir === "asc" ? cmp : -cmp;
      })
    : keywords;

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s?.key === key
        ? { key, dir: s.dir === "desc" ? "asc" : "desc" }
        : { key, dir: key === "keyword" ? "asc" : "desc" },
    );
  }

  return (
    // `relative` makes this the containing block of the sr-only header label —
    // otherwise that absolutely positioned span escapes the scroll container
    // and widens the whole page on phones.
    <div className="relative -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[820px] text-[13px]">
        <thead>
          <tr className="border-b border-[#D7E4ED] text-left text-[12px] text-text-faint">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                aria-sort={
                  sort?.key === c.key
                    ? sort.dir === "asc"
                      ? "ascending"
                      : "descending"
                    : undefined
                }
                className={`pb-2 font-medium ${c.numeric ? "text-right" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => toggleSort(c.key)}
                  title={c.title}
                  className="inline-flex items-center gap-1 rounded-md hover:text-[#1E2A3D] focus-visible:outline-2 focus-visible:outline-[#101828]/30"
                >
                  {c.label}
                  {sort?.key === c.key &&
                    (sort.dir === "asc" ? (
                      <CaretUp size={10} weight="bold" />
                    ) : (
                      <CaretDown size={10} weight="bold" />
                    ))}
                </button>
              </th>
            ))}
            <th scope="col" className="pb-2 pl-4 font-medium">
              New per run
            </th>
            <th scope="col" className="pb-2">
              <span className="sr-only">Details</span>
            </th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((k) => {
            const open = expanded === k.keyword;
            return (
              <Fragment key={k.keyword}>
                <tr
                  className={`border-b border-[#E6EEF4] ${k.active ? "" : "text-text-muted"} ${open ? "bg-[#F3F8FB]" : ""}`}
                >
                  <td className="py-2.5 pr-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`font-medium ${k.active ? "text-[#1E2A3D]" : "text-text-muted"}`}
                      >
                        {k.keyword}
                      </span>
                      <StatusPill active={k.active} />
                      <VerdictPill verdict={k.verdict} />
                    </div>
                  </td>
                  <td className="py-2.5 text-right">{k.jobs}</td>
                  <td className="py-2.5 text-right">{fmtNumber(k.newPerSearch, 1)}</td>
                  <td className="py-2.5 text-right">
                    {fmtPercent(k.jobs ? k.exclusive / k.jobs : null)}
                  </td>
                  <td className="py-2.5 text-right">{fmtNumber(k.avgScore)}</td>
                  <td className="py-2.5 text-right">
                    {k.goodMatches}
                    {k.goodPerSearch !== null && (
                      <span className="ml-1 text-[11px] text-text-faint">
                        ({fmtNumber(k.goodPerSearch, 1)}/search)
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 text-right">{k.applied}</td>
                  <td className="py-2.5 text-right whitespace-nowrap">
                    {fmtRelative(k.lastSearchedAt)}
                  </td>
                  <td className="py-2.5 pl-4">
                    <Sparkline points={k.trend} />
                  </td>
                  <td className="py-2.5 pl-2 text-right">
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : k.keyword)}
                      aria-expanded={open}
                      aria-label={`${open ? "Hide" : "Show"} details for ${k.keyword}`}
                      className="inline-flex size-7 items-center justify-center rounded-lg text-text-faint transition-colors hover:bg-[#E4EEF5] hover:text-[#1E2A3D]"
                    >
                      <CaretDown
                        size={14}
                        weight="bold"
                        className={`transition-transform ${open ? "rotate-180" : ""}`}
                      />
                    </button>
                  </td>
                </tr>
                {open && (
                  <tr className="border-b border-[#D7E4ED] bg-[#F3F8FB]">
                    <td colSpan={columns.length + 2} className="px-3 py-4">
                      <KeywordDetail
                        k={k}
                        active={active}
                        slots={slots}
                        busy={busy}
                        onSwap={onSwap}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {keywords.some((k) => k.boards.some((b) => b.capHits > 0)) && (
        <p className="mt-3 flex items-center gap-1.5 text-[12px] text-text-faint">
          <Warning size={12} weight="fill" className="text-amber-700" />
          Some searches hit the results limit — open a keyword to see where.
        </p>
      )}
    </div>
  );
}
