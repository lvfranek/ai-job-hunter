"use client";

import { useMemo, useState } from "react";
import { Briefcase, CaretDown, Lightning, Sparkle } from "@phosphor-icons/react";
import type { Job } from "@/lib/mock-data";
import { JobCard } from "@/components/JobCard";
import { AgentStatus } from "@/components/AgentStatus";
import { CoverLetterModal } from "@/components/CoverLetterModal";

type SortKey = "score" | "date";

const sortLabels: Record<SortKey, string> = {
  score: "Match score",
  date: "Posted date",
};

type ScrapeState = "idle" | "scraping";

export function JobResults({
  jobs,
  lastScraped,
  onScraped,
}: {
  jobs: Job[];
  lastScraped: string;
  onScraped: () => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [minScore, setMinScore] = useState(0);
  const [scrapeState, setScrapeState] = useState<ScrapeState>("idle");
  const [progress, setProgress] = useState({ found: 0 });
  const [lastPortalCounts, setLastPortalCounts] = useState<Record<string, number> | null>(null);
  const [isScoring, setIsScoring] = useState(false);
  const [coverLetterJob, setCoverLetterJob] = useState<Job | null>(null);

  // "Needs scoring" covers both never-scored jobs and ones whose score went
  // stale (preferences changed) — one button handles both.
  const needsScoreCount = jobs.filter((job) => !job.isScored || job.isStale).length;

  async function handleAdjustScore() {
    setIsScoring(true);
    try {
      await fetch("/api/score", { method: "POST" });
    } catch (error) {
      console.error("Scoring failed:", error);
    } finally {
      setIsScoring(false);
      onScraped();
    }
  }

  const sorted = useMemo(() => {
    const copy = jobs.filter((job) => job.matchScore >= minScore);
    if (sortKey === "score") return copy.sort((a, b) => b.matchScore - a.matchScore);
    return copy.sort((a, b) => a.daysAgo - b.daysAgo);
  }, [jobs, sortKey, minScore]);

  async function startScrape() {
    setScrapeState("scraping");
    setProgress({ found: 0 });
    try {
      const res = await fetch("/api/scrape", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scrape failed");

      const runId = data.runId;
      await new Promise<void>((resolve) => {
        const interval = setInterval(async () => {
          const statusRes = await fetch(`/api/scrape/status?runId=${runId}`);
          const status = await statusRes.json();
          setProgress({ found: status.jobsFound ?? 0 });

          if (status.status === "completed" || status.status === "failed") {
            setLastPortalCounts(status.portalCounts ?? null);
            clearInterval(interval);
            resolve();
          }
        }, 1500);
      });
    } catch (error) {
      console.error("Scrape failed:", error);
    } finally {
      setScrapeState("idle");
      onScraped();
    }
  }

  const isScraping = scrapeState !== "idle";

  return (
    <div className="rounded-lg border border-border bg-[#1A1A1D] shadow-lg shadow-black/50">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={startScrape}
            disabled={isScraping}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-text px-3 text-[13px] font-semibold text-bg outline-none transition-colors hover:bg-text/90 focus-visible:ring-2 focus-visible:ring-white/20 active:scale-[0.98] disabled:opacity-50"
          >
            <Lightning size={14} weight="fill" />
            {isScraping ? "Scraping…" : "Scrape Now"}
          </button>
          <button
            type="button"
            onClick={handleAdjustScore}
            disabled={isScraping || isScoring || needsScoreCount === 0}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 text-[13px] font-semibold text-text outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-white/20 active:scale-[0.98] disabled:opacity-50"
          >
            <Sparkle size={14} weight="fill" />
            {isScoring
              ? "Adjusting…"
              : needsScoreCount > 0
                ? `Adjust score (${needsScoreCount})`
                : "Scores up to date"}
          </button>
          {isScraping ? (
            <AgentStatus
              status={{
                state: scrapeState,
                action: "Scraping job boards",
                detail: `${progress.found} found`,
              }}
            />
          ) : (
            <span className="text-[12px] text-text-faint">
              Last scraped: {lastScraped}
              {lastPortalCounts && Object.keys(lastPortalCounts).length > 0 && (
                <>
                  {" "}
                  (
                  {Object.entries(lastPortalCounts)
                    .map(([portal, count]) => `${portal[0].toUpperCase()}${portal.slice(1)} ${count}`)
                    .join(", ")}
                  )
                </>
              )}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] text-text-faint">Min score</span>
            <input
              type="number"
              min={0}
              max={100}
              value={minScore || ""}
              onChange={(e) => setMinScore(Number(e.target.value) || 0)}
              placeholder="0"
              className="h-8 w-14 rounded-md border border-border-strong bg-surface-hover px-2 text-[13px] text-text-muted outline-none focus:border-text-muted focus:text-text"
            />
          </div>
          <span className="text-[12px] text-text-faint">Sort</span>
          <div className="relative">
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              aria-label="Sort jobs by"
              className="h-8 appearance-none rounded-md border border-border-strong bg-surface-hover pl-3 pr-8 text-[13px] text-text-muted transition-colors hover:text-text focus:border-text-muted focus:outline-none"
            >
              {(Object.keys(sortLabels) as SortKey[]).map((key) => (
                <option key={key} value={key} className="bg-surface">
                  {sortLabels[key]}
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
            <JobCard key={job.id} job={job} onGenerateCoverLetter={setCoverLetterJob} />
          ))}
        </div>
      )}

      {coverLetterJob && (
        <CoverLetterModal job={coverLetterJob} onClose={() => setCoverLetterJob(null)} />
      )}
    </div>
  );
}
