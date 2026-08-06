"use client";

import { useMemo, useState } from "react";
import { Briefcase, CaretDown, Lightning } from "@phosphor-icons/react";
import type { Job } from "@/lib/mock-data";
import { JobCard } from "@/components/JobCard";

type SortKey = "score" | "date" | "company";

const sortLabels: Record<SortKey, string> = {
  score: "Match score",
  date: "Posted date",
  company: "Company name",
};

export function JobResults({ jobs, lastScraped }: { jobs: Job[]; lastScraped: string }) {
  const [sortKey, setSortKey] = useState<SortKey>("score");

  const sorted = useMemo(() => {
    const copy = [...jobs];
    if (sortKey === "score") return copy.sort((a, b) => b.matchScore - a.matchScore);
    if (sortKey === "date") return copy.sort((a, b) => a.daysAgo - b.daysAgo);
    return copy.sort((a, b) => a.company.localeCompare(b.company));
  }, [jobs, sortKey]);

  return (
    <div className="rounded-lg border border-border bg-[#1A1A1D] shadow-lg shadow-black/50">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="flex h-9 shrink-0 items-center gap-2 rounded-md bg-text px-3.5 text-[13px] font-semibold text-bg outline-none transition-colors hover:bg-text/90 focus-visible:ring-2 focus-visible:ring-white/20 active:scale-[0.98]"
          >
            <Lightning size={15} weight="fill" />
            Scrape Now
          </button>
          <span className="text-[12px] text-text-faint">
            Last scraped: {lastScraped}
          </span>
        </div>

        <div className="relative">
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            aria-label="Sort jobs by"
            className="h-9 appearance-none rounded-md border border-border-strong bg-surface-hover pl-3 pr-8 text-[13px] text-text-muted transition-colors hover:text-text focus:border-text-muted focus:outline-none"
          >
            {(Object.keys(sortLabels) as SortKey[]).map((key) => (
              <option key={key} value={key} className="bg-surface">
                Sort: {sortLabels[key]}
              </option>
            ))}
          </select>
          <CaretDown
            size={13}
            weight="bold"
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-faint"
          />
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
          <Briefcase size={28} weight="regular" className="text-text-faint" />
          <p className="text-[14px] text-text-muted">
            Click &quot;Scrape Now&quot; to find jobs.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {sorted.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}
