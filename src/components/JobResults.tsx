"use client";

import { useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  CaretDown,
  Lightning,
  Sparkle,
  X,
} from "@phosphor-icons/react";
import type { Job } from "@/lib/mock-data";
import { JobCard } from "@/components/JobCard";
import { AgentStatus } from "@/components/AgentStatus";
import { CoverLetterModal } from "@/components/CoverLetterModal";

type SortKey = "score" | "date";

const sortLabels: Record<SortKey, string> = {
  score: "Match score",
  date: "Posted date",
};

const PAGE_SIZE = 25;

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
  const [page, setPage] = useState(1);
  const [scrapeState, setScrapeState] = useState<ScrapeState>("idle");
  const [progress, setProgress] = useState({ found: 0 });
  const [lastPortalCounts, setLastPortalCounts] = useState<Record<string, number> | null>(null);
  const [isScoring, setIsScoring] = useState(false);
  const [scoreProgress, setScoreProgress] = useState({ scored: 0, total: 0 });
  const scoreRunId = useRef<string | null>(null);
  const [coverLetterJob, setCoverLetterJob] = useState<Job | null>(null);

  // "Needs scoring" covers both never-scored jobs and ones whose score went
  // stale (preferences changed) — one button handles both.
  const needsScoreCount = jobs.filter((job) => !job.isScored || job.isStale).length;

  async function handleAdjustScore() {
    setIsScoring(true);
    setScoreProgress({ scored: 0, total: 0 });
    try {
      const res = await fetch("/api/score", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scoring failed");
      if (!data.runId) return; // nothing needed scoring

      scoreRunId.current = data.runId;
      await new Promise<void>((resolve) => {
        const interval = setInterval(async () => {
          const statusRes = await fetch(`/api/score/status?runId=${data.runId}`);
          const status = await statusRes.json();
          setScoreProgress({ scored: status.scored ?? 0, total: status.total ?? 0 });

          if (status.status !== "running") {
            clearInterval(interval);
            resolve();
          }
        }, 1500);
      });
    } catch (error) {
      console.error("Scoring failed:", error);
    } finally {
      scoreRunId.current = null;
      setIsScoring(false);
      onScraped();
    }
  }

  async function handleCancelScore() {
    if (!scoreRunId.current) return;
    try {
      await fetch("/api/score/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: scoreRunId.current }),
      });
    } catch (error) {
      console.error("Cancel failed:", error);
    }
  }

  const sorted = useMemo(() => {
    const copy = jobs.filter((job) => job.matchScore >= minScore);
    if (sortKey === "score") return copy.sort((a, b) => b.matchScore - a.matchScore);
    return copy.sort((a, b) => a.daysAgo - b.daysAgo);
  }, [jobs, sortKey, minScore]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paged = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

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
    <div className="rounded-3xl border border-white bg-linear-to-b from-white to-[#F7FBFD] shadow-[0_16px_40px_-18px_rgba(30,64,120,0.35)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D7E4ED] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={startScrape}
            disabled={isScraping}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-xl bg-[#101828] px-3 text-[13px] font-semibold text-white outline-none transition-colors hover:bg-[#1E293B] focus-visible:ring-2 focus-visible:ring-[#101828]/30 active:scale-[0.98] disabled:opacity-50"
          >
            <Lightning size={14} weight="fill" />
            {isScraping ? "Scraping…" : "Scrape Now"}
          </button>
          <button
            type="button"
            onClick={handleAdjustScore}
            disabled={isScraping || isScoring || needsScoreCount === 0}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-xl border border-[#B9CCDA] bg-white px-3 text-[13px] font-semibold text-[#1E2A3D] shadow-[0_1px_2px_rgba(30,64,120,0.06)] outline-none transition-colors hover:border-[#8FA8BD] hover:bg-[#E4EEF5] focus-visible:ring-2 focus-visible:ring-[#101828]/20 active:scale-[0.98] disabled:opacity-50 disabled:hover:border-[#B9CCDA] disabled:hover:bg-white"
          >
            <Sparkle size={14} weight="fill" />
            {isScoring
              ? "Adjusting…"
              : needsScoreCount > 0
                ? `Adjust score (${needsScoreCount})`
                : "Scores up to date"}
          </button>
          {isScoring && (
            <>
              <span className="text-[12px] tabular-nums text-[#94A3B8]">
                {scoreProgress.total > 0
                  ? `${scoreProgress.scored}/${scoreProgress.total} scored`
                  : "Starting…"}
              </span>
              <button
                type="button"
                onClick={handleCancelScore}
                aria-label="Cancel scoring"
                title="Cancel scoring"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#94A3B8] transition-colors hover:text-[#1E2A3D]"
              >
                <X size={13} weight="bold" />
              </button>
            </>
          )}
          {isScraping ? (
            <AgentStatus
              status={{
                state: scrapeState,
                action: "Scraping job boards",
                detail: `${progress.found} found`,
              }}
            />
          ) : (
            <span className="text-[12px] text-[#94A3B8]">
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
            <span className="text-[12px] text-[#94A3B8]">Min score</span>
            <input
              type="number"
              min={0}
              max={100}
              value={minScore || ""}
              onChange={(e) => {
                setMinScore(Number(e.target.value) || 0);
                setPage(1);
              }}
              placeholder="0"
              className="h-8 w-14 rounded-lg border border-[#B9CCDA] bg-white px-2 text-[13px] text-[#64748B] outline-none transition-colors hover:border-[#8FA8BD] focus:border-[#101828] focus:text-[#1E2A3D]"
            />
          </div>
          <span className="text-[12px] text-[#94A3B8]">Sort</span>
          <div className="relative">
            <select
              value={sortKey}
              onChange={(e) => {
                setSortKey(e.target.value as SortKey);
                setPage(1);
              }}
              aria-label="Sort jobs by"
              className="h-8 appearance-none rounded-lg border border-[#B9CCDA] bg-white pl-3 pr-8 text-[13px] text-[#64748B] transition-colors hover:border-[#8FA8BD] hover:text-[#1E2A3D] focus:border-[#101828] focus:outline-none"
            >
              {(Object.keys(sortLabels) as SortKey[]).map((key) => (
                <option key={key} value={key}>
                  {sortLabels[key]}
                </option>
              ))}
            </select>
            <CaretDown
              size={13}
              weight="bold"
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8]"
            />
          </div>
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
          <Briefcase size={28} weight="regular" className="text-[#B8C4D1]" />
          <p className="text-[14px] text-[#64748B]">
            Click &quot;Scrape Now&quot; to find jobs.
          </p>
        </div>
      ) : (
        <>
          <div className="divide-y divide-[#D7E4ED]">
            {paged.map((job) => (
              <JobCard key={job.id} job={job} onGenerateCoverLetter={setCoverLetterJob} />
            ))}
          </div>

          {pageCount > 1 && (
            <div className="flex items-center justify-between border-t border-[#D7E4ED] px-4 py-3">
              <span className="text-[12px] text-[#94A3B8]">
                {sorted.length} jobs · page {currentPage} of {pageCount}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  aria-label="Previous page"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#B9CCDA] bg-white text-[#1E2A3D] transition-colors hover:border-[#8FA8BD] hover:bg-[#E4EEF5] disabled:opacity-40 disabled:hover:border-[#B9CCDA] disabled:hover:bg-white"
                >
                  <ArrowLeft size={14} weight="bold" />
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={currentPage === pageCount}
                  aria-label="Next page"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#B9CCDA] bg-white text-[#1E2A3D] transition-colors hover:border-[#8FA8BD] hover:bg-[#E4EEF5] disabled:opacity-40 disabled:hover:border-[#B9CCDA] disabled:hover:bg-white"
                >
                  <ArrowRight size={14} weight="bold" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {coverLetterJob && (
        <CoverLetterModal job={coverLetterJob} onClose={() => setCoverLetterJob(null)} />
      )}
    </div>
  );
}
