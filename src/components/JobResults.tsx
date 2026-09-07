"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  CaretDown,
  Lightning,
  Sparkle,
  Trash,
  X,
} from "@phosphor-icons/react";
import type { Job, JobStatus } from "@/lib/mock-data";
import { jobStatusLabels } from "@/lib/mock-data";
import { JobCard } from "@/components/JobCard";
import { AgentStatus } from "@/components/AgentStatus";
import { CoverLetterModal } from "@/components/CoverLetterModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Toast } from "@/components/Toast";

type SortKey = "score" | "date";

const sortLabels: Record<SortKey, string> = {
  score: "Match score",
  date: "Posted date",
};

type StatusFilter = JobStatus | "all";

const statusFilterLabels: Record<StatusFilter, string> = {
  all: "All statuses",
  ...jobStatusLabels,
};

const PAGE_SIZE = 25;

type ScrapeState = "idle" | "scraping";

export function JobResults({
  jobs,
  lastScraped,
  onScraped,
  onRefresh,
  onStatusChange,
}: {
  jobs: Job[];
  lastScraped: string;
  onScraped: () => void;
  onRefresh: () => void;
  onStatusChange: (jobId: string, status: JobStatus | null) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [minScore, setMinScore] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [scrapeState, setScrapeState] = useState<ScrapeState>("idle");
  const [progress, setProgress] = useState({ found: 0, completedRuns: 0, totalRuns: 0 });
  const [lastPortalCounts, setLastPortalCounts] = useState<Record<string, number> | null>(null);
  // Set when "Scrape Now" is clicked — holds the run/job estimate for the
  // confirm dialog; scraping starts only once the user confirms.
  const [scrapeConfirm, setScrapeConfirm] = useState<{ runs: number; maxJobs: number } | null>(
    null
  );
  const [isScoring, setIsScoring] = useState(false);
  // Always-on status line shown next to the Adjust-score button: what the run is
  // doing right now, then how it ended. Never left blank while a run is live.
  const [scoreStatus, setScoreStatus] = useState<string | null>(null);
  const scoreRunId = useRef<string | null>(null);
  const [coverLetterJob, setCoverLetterJob] = useState<Job | null>(null);
  const [pruneDays, setPruneDays] = useState(30);
  const [confirmingPrune, setConfirmingPrune] = useState(false);
  const [pruning, setPruning] = useState(false);
  const [pruneMessage, setPruneMessage] = useState<string | null>(null);

  const oldJobCount = useMemo(
    () => jobs.filter((job) => job.daysAgo >= pruneDays).length,
    [jobs, pruneDays]
  );

  useEffect(() => {
    if (!pruneMessage) return;
    const t = setTimeout(() => setPruneMessage(null), 3000);
    return () => clearTimeout(t);
  }, [pruneMessage]);

  // Keep the final outcome on screen briefly after a run ends, then clear it.
  useEffect(() => {
    if (isScoring || !scoreStatus) return;
    const t = setTimeout(() => setScoreStatus(null), 8000);
    return () => clearTimeout(t);
  }, [isScoring, scoreStatus]);

  async function handlePrune() {
    setPruning(true);
    try {
      const res = await fetch(`/api/jobs?olderThanDays=${pruneDays}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to remove old jobs");
      const n = data.deleted ?? 0;
      setPruneMessage(
        n === 0
          ? "No jobs older than that"
          : `Removed ${n} job${n === 1 ? "" : "s"} older than ${pruneDays} days`
      );
      onRefresh();
    } catch (error) {
      console.error("Prune failed:", error);
      setPruneMessage("Failed to remove old jobs");
    } finally {
      setPruning(false);
      setConfirmingPrune(false);
    }
  }

  // "Needs scoring" covers both never-scored jobs and ones whose score went
  // stale (preferences changed) — one button handles both.
  const needsScoreCount = jobs.filter((job) => !job.isScored || job.isStale).length;

  async function handleAdjustScore() {
    setIsScoring(true);
    setScoreStatus("Starting…");
    let outcome: string | null = null;

    try {
      const res = await fetch("/api/score", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scoring failed");
      if (!data.runId) {
        outcome = "Scores already up to date";
        return;
      }

      scoreRunId.current = data.runId;

      // Poll until the run leaves "running" — but never poll forever. Any of
      // these ends it: a terminal status from the server, the server's own stall
      // detector flipping the run to failed, a run of failed status requests, or
      // an absolute wall-clock cap.
      const startedAt = Date.now();
      const MAX_POLL_MS = 30 * 60 * 1000;
      let consecutiveErrors = 0;
      let last = { status: "running", scored: 0, total: 0, stalled: false };

      const final = await new Promise<typeof last>((resolve) => {
        const interval = setInterval(async () => {
          try {
            const statusRes = await fetch(`/api/score/status?runId=${data.runId}`);
            if (!statusRes.ok) throw new Error(`status ${statusRes.status}`);
            const s = await statusRes.json();
            consecutiveErrors = 0;
            last = {
              status: s.status ?? "running",
              scored: s.scored ?? 0,
              total: s.total ?? 0,
              stalled: Boolean(s.stalled),
            };
            setScoreStatus(
              last.total > 0 ? `${last.scored}/${last.total} scored` : "Preparing…"
            );

            if (last.status !== "running" || Date.now() - startedAt > MAX_POLL_MS) {
              clearInterval(interval);
              resolve(last);
            }
          } catch (err) {
            console.error("Score status poll failed:", err);
            if (++consecutiveErrors >= 5) {
              clearInterval(interval);
              resolve({ ...last, status: "unknown" });
            }
          }
        }, 1500);
      });

      if (final.status === "completed") {
        outcome = `Scored ${final.total} job${final.total === 1 ? "" : "s"}`;
      } else if (final.status === "cancelled") {
        outcome = `Cancelled at ${final.scored}/${final.total}`;
      } else {
        // failed, stalled, unknown, or hit the wall-clock cap — successful chunks
        // are already saved, so one more click picks up where it left off.
        outcome = `Stopped at ${final.scored}/${final.total} — progress saved, click Adjust score to finish`;
      }
    } catch (error) {
      console.error("Scoring failed:", error);
      outcome = error instanceof Error ? error.message : "Scoring failed";
    } finally {
      scoreRunId.current = null;
      setIsScoring(false);
      setScoreStatus(outcome);
      onScraped();
      onRefresh();
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
    const copy = jobs
      .filter((job) => job.matchScore >= minScore)
      .filter((job) => statusFilter === "all" || job.status === statusFilter);
    if (sortKey === "score") return copy.sort((a, b) => b.matchScore - a.matchScore);
    return copy.sort((a, b) => a.daysAgo - b.daysAgo);
  }, [jobs, sortKey, minScore, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paged = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // "Scrape Now" now fans out to one Apify run per keyword per board — show what
  // that costs (run count + max jobs) before firing it.
  async function requestScrape() {
    try {
      const res = await fetch("/api/settings");
      const s = await res.json();
      const keywords = ((s.scraper_search_keywords as string[]) ?? []).filter(
        (k) => k && k.trim()
      ).length;
      const boards = Object.values(s.portal_toggles ?? {}).filter(Boolean).length;
      const perSearch = Number(s.scraper_results_per_scan) || 0;
      const runs = keywords * boards;
      setScrapeConfirm({ runs, maxJobs: runs * perSearch });
    } catch {
      setScrapeConfirm({ runs: 0, maxJobs: 0 }); // still let them confirm; the API validates
    }
  }

  async function startScrape() {
    setScrapeState("scraping");
    setProgress({ found: 0, completedRuns: 0, totalRuns: 0 });
    try {
      const res = await fetch("/api/scrape", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scrape failed");

      const runId = data.runId;
      const startedAt = Date.now();
      const MAX_POLL_MS = 40 * 60 * 1000;
      let consecutiveErrors = 0;

      await new Promise<void>((resolve) => {
        const interval = setInterval(async () => {
          try {
            const statusRes = await fetch(`/api/scrape/status?runId=${runId}`);
            if (!statusRes.ok) throw new Error(`status ${statusRes.status}`);
            const status = await statusRes.json();
            consecutiveErrors = 0;
            setProgress({
              found: status.jobsFound ?? 0,
              completedRuns: status.completedRuns ?? 0,
              totalRuns: status.totalRuns ?? 0,
            });

            const done =
              status.status === "completed" ||
              status.status === "failed" ||
              status.stalled === true ||
              Date.now() - startedAt > MAX_POLL_MS;
            if (done) {
              setLastPortalCounts(status.portalCounts ?? null);
              clearInterval(interval);
              resolve();
            }
          } catch (err) {
            console.error("Scrape status poll failed:", err);
            if (++consecutiveErrors >= 5) {
              clearInterval(interval);
              resolve();
            }
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
      <Toast message={pruneMessage} />
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D7E4ED] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={requestScrape}
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
          {(isScoring || scoreStatus) && (
            <>
              <span className="max-w-88 text-[12px] tabular-nums text-[#94A3B8]">
                {scoreStatus ?? (isScoring ? "Working…" : "")}
              </span>
              {isScoring && (
                <button
                  type="button"
                  onClick={handleCancelScore}
                  aria-label="Cancel scoring"
                  title="Cancel scoring"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#94A3B8] transition-colors hover:text-[#1E2A3D]"
                >
                  <X size={13} weight="bold" />
                </button>
              )}
            </>
          )}
          {isScraping ? (
            <AgentStatus
              status={{
                state: scrapeState,
                action: "Scraping job boards",
                detail:
                  progress.totalRuns > 0
                    ? `Board ${progress.completedRuns}/${progress.totalRuns} · ${progress.found} found`
                    : `${progress.found} found`,
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
          <span className="text-[12px] text-[#94A3B8]">Status</span>
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as StatusFilter);
                setPage(1);
              }}
              aria-label="Filter by status"
              className="h-8 appearance-none rounded-lg border border-[#B9CCDA] bg-white pl-3 pr-8 text-[13px] text-[#64748B] transition-colors hover:border-[#8FA8BD] hover:text-[#1E2A3D] focus:border-[#101828] focus:outline-none"
            >
              {(Object.keys(statusFilterLabels) as StatusFilter[]).map((key) => (
                <option key={key} value={key}>
                  {statusFilterLabels[key]}
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

      {jobs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[#D7E4ED] px-4 py-2 text-[12px] text-[#94A3B8]">
          {confirmingPrune ? (
            <>
              <span className="text-[#64748B]">
                Remove {oldJobCount} job{oldJobCount === 1 ? "" : "s"} older than {pruneDays}{" "}
                days? This can&apos;t be undone.
              </span>
              <button
                type="button"
                onClick={handlePrune}
                disabled={pruning}
                className="flex h-7 items-center gap-1 rounded-lg border border-rose-300 bg-rose-100 px-2.5 text-[12px] font-semibold text-rose-800 transition-colors hover:bg-rose-200 active:scale-[0.98] disabled:opacity-50"
              >
                {pruning ? "Removing…" : "Remove"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingPrune(false)}
                disabled={pruning}
                className="h-7 rounded-lg border border-[#B9CCDA] bg-white px-2.5 text-[12px] font-semibold text-[#1E2A3D] transition-colors hover:border-[#8FA8BD] hover:bg-[#E4EEF5] active:scale-[0.98] disabled:opacity-50"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <span>Remove posts older than</span>
              <input
                type="number"
                min={1}
                value={pruneDays || ""}
                onChange={(e) =>
                  setPruneDays(Math.max(1, Math.floor(Number(e.target.value) || 0)))
                }
                aria-label="Remove job posts older than this many days"
                className="h-7 w-14 rounded-lg border border-[#B9CCDA] bg-white px-2 text-[12px] text-[#64748B] outline-none transition-colors hover:border-[#8FA8BD] focus:border-[#101828] focus:text-[#1E2A3D]"
              />
              <span>days</span>
              <button
                type="button"
                onClick={() => setConfirmingPrune(true)}
                className="flex h-7 items-center gap-1 rounded-lg border border-[#B9CCDA] bg-white px-2.5 text-[12px] font-semibold text-[#1E2A3D] transition-colors hover:border-[#8FA8BD] hover:bg-[#E4EEF5] active:scale-[0.98]"
              >
                <Trash size={13} weight="bold" />
                Remove old{oldJobCount > 0 ? ` (${oldJobCount})` : ""}
              </button>
            </>
          )}
        </div>
      )}

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
              <JobCard
                key={job.id}
                job={job}
                onGenerateCoverLetter={setCoverLetterJob}
                onStatusChange={onStatusChange}
              />
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

      <ConfirmDialog
        open={scrapeConfirm !== null}
        title="Start scraping?"
        message={
          scrapeConfirm && scrapeConfirm.runs > 0
            ? `This runs ${scrapeConfirm.runs} search${scrapeConfirm.runs === 1 ? "" : "es"} ` +
              `(one per keyword per board) and fetches up to ~${scrapeConfirm.maxJobs} jobs. ` +
              `Lower "Results per search" in Settings to fetch fewer.`
            : "This starts a scrape across your active job boards and keywords."
        }
        confirmLabel="Scrape now"
        cancelLabel="Cancel"
        tone="default"
        onConfirm={() => {
          setScrapeConfirm(null);
          startScrape();
        }}
        onCancel={() => setScrapeConfirm(null)}
      />
    </div>
  );
}
