"use client";

import type { KeywordStat, KeywordSuggestion } from "@/lib/keyword-stats";
import { SwapKeywordMenu } from "@/components/stats/SwapKeywordMenu";

/** Search phrases from the titles of your good matches that no keyword covers yet. */
export function Suggestions({
  suggestions,
  active,
  slots,
  busy,
  onSwap,
}: {
  suggestions: KeywordSuggestion[];
  active: KeywordStat[];
  slots: number;
  busy: boolean;
  onSwap: (incoming: string, outgoing: string | null) => void;
}) {
  if (suggestions.length === 0) {
    return (
      <p className="text-[13px] text-text-muted">
        No suggestions yet — they appear once a few job titles stand out among your 80+ matches.
      </p>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {suggestions.map((s) => (
        <li
          key={s.phrase}
          className="flex flex-col justify-between gap-3 rounded-2xl border border-[#D7E4ED] bg-white p-3.5"
        >
          <div>
            <p className="text-[14px] font-medium text-[#1E2A3D]">{s.phrase}</p>
            <p className="mt-0.5 text-[12px] text-text-muted">
              In <span className="tabular-nums">{s.goodJobs}</span> good matches —{" "}
              <span className="tabular-nums">{Math.round((s.goodJobs / s.jobs) * 100)}%</span> of
              the <span className="tabular-nums">{s.jobs}</span> jobs with it in the title
            </p>
          </div>
          <SwapKeywordMenu
            incoming={s.phrase}
            active={active}
            slots={slots}
            busy={busy}
            onSwap={onSwap}
          />
        </li>
      ))}
    </ul>
  );
}
