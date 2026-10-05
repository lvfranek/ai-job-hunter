"use client";

import { ArrowLineUp, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import {
  BLOCKER_CATEGORIES,
  BLOCKER_LABELS,
  type BlockerCategory,
  type BoardStat,
  type KeywordStat,
} from "@/lib/keyword-stats";
import {
  blueRamp,
  fmtNumber,
  fmtPercent,
  orangeRamp,
  portalLabel,
  rampColor,
  rampTextColor,
} from "@/components/stats/ui";

/** Low → high swatch strip under a heatmap. */
function RampLegend({
  ramp,
  low,
  high,
  label,
}: {
  ramp: string[];
  low: string;
  high: string;
  label: string;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-text-muted">
      <span>{label}</span>
      <span className="tabular-nums">{low}</span>
      <span className="flex gap-0.5" aria-hidden="true">
        {ramp.slice(1).map((c) => (
          <span key={c} className="h-2.5 w-5 rounded-[3px]" style={{ background: c }} />
        ))}
      </span>
      <span className="tabular-nums">{high}</span>
    </div>
  );
}

const cellBase =
  "flex h-12 min-w-[76px] flex-col items-center justify-center rounded-lg px-2 text-center leading-tight";

/**
 * Keyword × job board. Color and the big number are 80+ matches; the small line
 * is how many jobs that combination found. Flags searches that hit the results
 * limit (there was more to find) and searches that failed.
 */
export function BoardMatrix({
  keywords,
  boards,
}: {
  keywords: KeywordStat[];
  boards: BoardStat[];
}) {
  const rows = keywords.filter((k) => k.boards.length > 0);
  const portals = boards.map((b) => b.portal);
  const max = Math.max(1, ...rows.flatMap((k) => k.boards.map((b) => b.goodMatches)));
  const hasCapHits = rows.some((k) => k.boards.some((b) => b.capHits > 0));
  const hasFailures = rows.some((k) => k.boards.some((b) => b.failures > 0));

  if (rows.length === 0) {
    return <p className="text-[13px] text-text-muted">No tracked searches yet.</p>;
  }

  return (
    <div>
      <div className="relative -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full border-separate border-spacing-0.5 text-[12px]">
          <thead>
            <tr className="text-text-faint">
              <th scope="col" className="pb-1 text-left font-medium">
                Keyword
              </th>
              {portals.map((p) => (
                <th key={p} scope="col" className="pb-1 font-medium">
                  {portalLabel(p)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((k) => (
              <tr key={k.keyword}>
                <th
                  scope="row"
                  className={`pr-3 text-left text-[13px] font-medium whitespace-nowrap ${k.active ? "text-[#1E2A3D]" : "text-text-muted"}`}
                >
                  {k.keyword}
                </th>
                {portals.map((portal) => {
                  const b = k.boards.find((x) => x.portal === portal);
                  if (!b) {
                    return (
                      <td key={portal}>
                        <div className={`${cellBase} text-text-faint`}>–</div>
                      </td>
                    );
                  }
                  const fill = rampColor(blueRamp, b.goodMatches, max);
                  const color = rampTextColor(blueRamp, fill);
                  const notes = [
                    b.capHits > 0
                      ? `hit the results limit in ${b.capHits} of ${b.searches} searches`
                      : "",
                    b.failures > 0 ? `${b.failures} failed searches` : "",
                  ].filter(Boolean);
                  return (
                    <td key={portal}>
                      <div
                        className={`${cellBase} relative`}
                        style={{ background: fill, color }}
                        title={`${k.keyword} on ${portalLabel(portal)}: ${b.goodMatches} matches 80+, ${b.jobs} jobs, average score ${fmtNumber(b.avgScore)}${notes.length ? ` — ${notes.join(", ")}` : ""}`}
                      >
                        <span className="text-[15px] font-semibold tabular-nums">
                          {b.goodMatches}
                        </span>
                        <span className="tabular-nums opacity-80">of {b.jobs}</span>
                        {(b.capHits > 0 || b.failures > 0) && (
                          <span className="absolute top-1 right-1 flex gap-0.5" aria-hidden="true">
                            {b.capHits > 0 && <ArrowLineUp size={11} weight="bold" />}
                            {b.failures > 0 && <WarningCircle size={11} weight="fill" />}
                          </span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="text-text-muted">
              <th scope="row" className="pt-2 pr-3 text-left text-[12px] font-medium">
                All jobs
              </th>
              {boards.map((b) => (
                <td key={b.portal} className="pt-2 text-center tabular-nums">
                  <div className="font-medium text-[#1E2A3D]">
                    {b.goodMatches} of {b.jobs}
                  </div>
                  <div className="text-[11px]">avg {fmtNumber(b.avgScore)}</div>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <RampLegend ramp={blueRamp} low="0" high={String(max)} label="80+ matches" />
      {(hasCapHits || hasFailures) && (
        <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-text-muted">
          {hasCapHits && (
            <span className="inline-flex items-center gap-1.5">
              <ArrowLineUp size={12} weight="bold" aria-hidden="true" /> Hit the results limit —
              raise “Results per search” in Scraping Settings to see more
            </span>
          )}
          {hasFailures && (
            <span className="inline-flex items-center gap-1.5">
              <WarningCircle size={12} weight="fill" aria-hidden="true" /> Some searches failed
            </span>
          )}
        </p>
      )}
    </div>
  );
}

/**
 * Keyword × blocker category: the share of each keyword's scored jobs that hit
 * a hard blocker of that kind. A keyword whose jobs keep failing on the same
 * thing is searching the wrong market.
 */
export function BlockerMatrix({ keywords }: { keywords: KeywordStat[] }) {
  const rows = keywords.filter((k) => k.scored > 0);
  const categories = BLOCKER_CATEGORIES.filter(
    (c) => c !== "other" || rows.some((k) => k.blockers.other > 0),
  );
  const columns: { key: "any" | BlockerCategory; label: string }[] = [
    { key: "any", label: "Any blocker" },
    ...categories.map((c) => ({ key: c, label: BLOCKER_LABELS[c] })),
  ];
  const count = (k: KeywordStat, key: "any" | BlockerCategory) =>
    key === "any" ? k.blocked : k.blockers[key];
  const maxShare = Math.max(
    0.1,
    ...rows.flatMap((k) => columns.map((c) => count(k, c.key) / k.scored)),
  );

  if (rows.length === 0) {
    return <p className="text-[13px] text-text-muted">No scored jobs with a keyword yet.</p>;
  }

  return (
    <div>
      <div className="relative -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full border-separate border-spacing-0.5 text-[12px]">
          <thead>
            <tr className="text-text-faint">
              <th scope="col" className="pb-1 text-left font-medium">
                Keyword
              </th>
              {columns.map((c) => (
                <th key={c.key} scope="col" className="pb-1 font-medium">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((k) => (
              <tr key={k.keyword}>
                <th
                  scope="row"
                  className={`pr-3 text-left text-[13px] font-medium whitespace-nowrap ${k.active ? "text-[#1E2A3D]" : "text-text-muted"}`}
                >
                  {k.keyword}
                  <span className="ml-1.5 text-[11px] font-normal text-text-faint">
                    {k.scored} scored
                  </span>
                </th>
                {columns.map((c) => {
                  const n = count(k, c.key);
                  const share = n / k.scored;
                  const fill = rampColor(orangeRamp, share, maxShare);
                  return (
                    <td key={c.key}>
                      <div
                        className={`${cellBase} ${c.key === "any" ? "font-semibold" : ""}`}
                        style={{ background: fill, color: rampTextColor(orangeRamp, fill) }}
                        title={`${k.keyword} — ${c.label}: ${n} of ${k.scored} scored jobs`}
                      >
                        <span className="text-[14px] tabular-nums">{fmtPercent(share)}</span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <RampLegend
        ramp={orangeRamp}
        low="0%"
        high={fmtPercent(maxShare)}
        label="Share of scored jobs"
      />
    </div>
  );
}
