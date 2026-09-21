"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Lightning,
  Sparkle,
  Trash,
  Warning,
  X,
} from "@phosphor-icons/react";
import type { Job, JobStatus } from "@/lib/mock-data";
import { jobStatusLabels } from "@/lib/mock-data";
import { JobCard } from "@/components/JobCard";
import { AgentStatus } from "@/components/AgentStatus";
import { CoverLetterModal } from "@/components/CoverLetterModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Toast } from "@/components/Toast";
import {
  buttonDanger,
  buttonPrimary,
  buttonSecondary,
  iconButton,
  inputClass,
  Select,
} from "@/components/controls";

type SortKey = "score" | "date";

const sortLabels: Record<SortKey, string> = {
  score: "Best fit",
  date: "Newest",
};

const minScoreOptions = [
  { value: 0, label: "Any score" },
  { value: 50, label: "50+" },
  { value: 70, label: "70+" },
  { value: 80, label: "80+" },
];

type StatusFilter = JobStatus | "all";

const statusFilterLabels: Record<StatusFilter, string> = {
  all: "Any status",
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
    null,
  );
  const [isScoring, setIsScoring] = useState(false);
  // Always-on status line shown next to the Adjust-score button: what the run is
  // doing right now, then how it ended. Never left blank while a run is live.
  const [scoreStatus, setScoreStatus] = useState<string | null>(null);
  // Post-run summary: what actually got scored, what didn't, and why.
  const [scoreReport, setScoreReport] = useState<{
    scored: number;
    failed: number;
    total: number;
    errorSummary: Record<string, number>;
  } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const scoreRunId = useRef<string | null>(null);
  const [coverLetterJob, setCoverLetterJob] = useState<Job | null>(null);
  const [pruneDays, setPruneDays] = useState(30);
  const [confirmingPrune, setConfirmingPrune] = useState(false);
  const [pruning, setPruning] = useState(false);
  const [pruneMessage, setPruneMessage] = useState<string | null>(null);
  // The ⋯ overflow menu holds the rarely used "remove old posts" action.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function close() {
      setMenuOpen(false);
      setConfirmingPrune(false);
    }
    function onPointerDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) close();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
    setConfirmingPrune(false);
  }

  const oldJobCount = useMemo(
    () => jobs.filter((job) => job.daysAgo >= pruneDays).length,
    [jobs, pruneDays],
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
          : `Removed ${n} job${n === 1 ? "" : "s"} older than ${pruneDays} days`,
      );
      onRefresh();
    } catch (error) {
      console.error("Prune failed:", error);
      setPruneMessage("Failed to remove old jobs");
    } finally {
      setPruning(false);
      closeMenu();
    }
  }

  function formatEta(ms: number): string {
    const total = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  }

  // "Needs scoring" covers both never-scored jobs and ones whose score went
  // stale (preferences changed) — one button handles both.
  const needsScoreCount = jobs.filter((job) => !job.isScored || job.isStale).length;

  async function handleAdjustScore() {
    setIsScoring(true);
    setScoreStatus("Starting…");
    setScoreReport(null);
    setReportOpen(false);
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
      // Pull fresh scores into the list while the run is going so the ranking
      // reorders live. Throttled — chunks land in bursts and a full refetch per
      // poll would be wasteful.
      let lastRefreshAt = 0;
      let lastRefreshedScored = 0;
      const REFRESH_INTERVAL_MS = 3000;
      let last = {
        status: "running",
        scored: 0,
        failed: 0,
        total: 0,
        totalChunks: 0,
        completedChunks: 0,
        model: null as string | null,
        errorSummary: {} as Record<string, number>,
        stalled: false,
      };

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
              failed: s.failed ?? 0,
              total: s.total ?? 0,
              totalChunks: s.totalChunks ?? 0,
              completedChunks: s.completedChunks ?? 0,
              model: s.model ?? null,
              errorSummary: s.errorSummary ?? {},
              stalled: Boolean(s.stalled),
            };

            // Live detail: what the run is chewing on right now, how much is
            // done, what it has already lost, and roughly how long is left.
            const parts: string[] = [];
            if (last.totalChunks > 0) {
              parts.push(`Batch ${last.completedChunks}/${last.totalChunks}`);
            }
            parts.push(last.total > 0 ? `${last.scored}/${last.total} scored` : "Preparing…");
            if (last.failed > 0) parts.push(`${last.failed} failed`);
            if (last.completedChunks > 0 && last.completedChunks < last.totalChunks) {
              const perChunk = (Date.now() - startedAt) / last.completedChunks;
              parts.push(
                `~${formatEta(perChunk * (last.totalChunks - last.completedChunks))} left`,
              );
            }
            if (last.model) parts.push(last.model.split("/").pop() as string);
            setScoreStatus(parts.join(" · "));

            if (
              last.scored > lastRefreshedScored &&
              Date.now() - lastRefreshAt > REFRESH_INTERVAL_MS
            ) {
              lastRefreshedScored = last.scored;
              lastRefreshAt = Date.now();
              onRefresh();
            }

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

      setScoreReport({
        scored: final.scored,
        failed: final.failed,
        total: final.total,
        errorSummary: final.errorSummary,
      });

      if (final.status === "completed") {
        outcome =
          final.failed > 0
            ? `Scored ${final.scored}/${final.total} — ${final.failed} failed`
            : `Scored ${final.scored} job${final.scored === 1 ? "" : "s"}`;
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
        (k) => k && k.trim(),
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
      <div className="grid grid-cols-2 gap-2 border-b border-[#D7E4ED] px-4 py-3 sm:flex sm:flex-wrap sm:items-center">
        {/* Mobile: a grid — two equal buttons, then the status line with the trash
            button at its right end, then the filters. Desktop: one row with the
            filters and trash pushed to the right. */}
        <button
          type="button"
          onClick={requestScrape}
          disabled={isScraping}
          className={buttonPrimary}
        >
          <Lightning size={14} weight="fill" />
          {isScraping ? "Scraping…" : "Scrape now"}
        </button>
        <button
          type="button"
          onClick={handleAdjustScore}
          disabled={isScraping || isScoring || needsScoreCount === 0}
          className={buttonSecondary}
        >
          <Sparkle size={14} weight="fill" />
          {isScoring
            ? "Adjusting…"
            : needsScoreCount > 0
              ? `Adjust score (${needsScoreCount})`
              : "Scores up to date"}
        </button>

        <div
          className={`col-span-2 col-start-1 row-start-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 self-center sm:ml-1 sm:pr-0 ${
            jobs.length > 0 ? "pr-11" : ""
          }`}
        >
          {(isScoring || scoreStatus) && (
            <>
              <span className="max-w-88 text-[12px] tabular-nums text-text-faint">
                {scoreStatus ?? (isScoring ? "Working…" : "")}
              </span>
              {isScoring && (
                <button
                  type="button"
                  onClick={handleCancelScore}
                  aria-label="Cancel scoring"
                  title="Cancel scoring — finished jobs keep their scores"
                  className={buttonDanger}
                >
                  <X size={14} weight="bold" />
                  Cancel
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
            <span className="text-[12px] text-text-faint">
              Last scraped: {lastScraped}
              {lastPortalCounts && Object.keys(lastPortalCounts).length > 0 && (
                <>
                  {" "}
                  (
                  {Object.entries(lastPortalCounts)
                    .map(
                      ([portal, count]) => `${portal[0].toUpperCase()}${portal.slice(1)} ${count}`,
                    )
                    .join(", ")}
                  )
                </>
              )}
            </span>
          )}
        </div>

        <div className="contents sm:ml-auto sm:flex sm:items-center sm:gap-2">
          <div className="col-span-2 row-start-3 grid grid-cols-[1fr_auto_1fr] gap-1.5 sm:flex sm:items-center sm:gap-2">
            <Select
              value={minScore}
              onChange={(e) => {
                setMinScore(Number(e.target.value));
                setPage(1);
              }}
              aria-label="Minimum match score"
            >
              {minScoreOptions.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Select
              value={sortKey}
              onChange={(e) => {
                setSortKey(e.target.value as SortKey);
                setPage(1);
              }}
              aria-label="Sort jobs by"
            >
              {(Object.keys(sortLabels) as SortKey[]).map((key) => (
                <option key={key} value={key}>
                  {sortLabels[key]}
                </option>
              ))}
            </Select>
            <Select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as StatusFilter);
                setPage(1);
              }}
              aria-label="Filter by status"
            >
              {(Object.keys(statusFilterLabels) as StatusFilter[]).map((key) => (
                <option key={key} value={key}>
                  {statusFilterLabels[key]}
                </option>
              ))}
            </Select>
          </div>
          {jobs.length > 0 && (
            <div
              ref={menuRef}
              className="relative z-10 col-start-2 row-start-2 self-center justify-self-end"
            >
              <button
                type="button"
                onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
                aria-label="Remove old jobs"
                aria-haspopup="true"
                aria-expanded={menuOpen}
                className={iconButton}
              >
                <Trash size={16} weight="bold" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full z-30 mt-2 w-64 rounded-2xl border border-white bg-linear-to-b from-white to-[#F7FBFD] p-3 shadow-[0_16px_40px_-12px_rgba(30,64,120,0.45)]">
                  {confirmingPrune ? (
                    <>
                      <p className="text-[13px] text-text-muted">
                        Remove {oldJobCount} job{oldJobCount === 1 ? "" : "s"} older than{" "}
                        {pruneDays} days? This can&apos;t be undone.
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={handlePrune}
                          disabled={pruning}
                          className={buttonDanger}
                        >
                          {pruning ? "Removing…" : "Remove"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingPrune(false)}
                          disabled={pruning}
                          className={buttonSecondary}
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <label
                        htmlFor="prune-days"
                        className="block text-[12px] font-medium text-text-muted"
                      >
                        Remove posts older than
                      </label>
                      <div className="mt-1.5 flex items-center gap-2">
                        <input
                          id="prune-days"
                          type="number"
                          min={1}
                          value={pruneDays || ""}
                          onChange={(e) =>
                            setPruneDays(Math.max(1, Math.floor(Number(e.target.value) || 0)))
                          }
                          className={`${inputClass} w-20`}
                        />
                        <span className="text-[13px] text-text-muted">days</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setConfirmingPrune(true)}
                        className={`${buttonSecondary} mt-3 w-full`}
                      >
                        <Trash size={14} weight="bold" />
                        Remove old jobs{oldJobCount > 0 ? ` (${oldJobCount})` : ""}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {scoreReport && scoreReport.total > 0 && (
        <div className="border-b border-[#D7E4ED] px-4 py-2 text-[12px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className={scoreReport.failed > 0 ? "text-amber-800" : "text-emerald-700"}>
              {scoreReport.failed > 0 ? (
                <>
                  <Warning size={12} weight="fill" className="mr-1 inline align-[-1px]" />
                  {scoreReport.scored}/{scoreReport.total} scored · {scoreReport.failed} could not
                  be scored
                </>
              ) : (
                <>All {scoreReport.scored} jobs scored</>
              )}
            </span>
            {scoreReport.failed > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setReportOpen((o) => !o)}
                  className="rounded-md px-1.5 py-0.5 text-[12px] font-medium text-text-muted underline-offset-2 transition-colors hover:text-[#1E2A3D] hover:underline"
                >
                  {reportOpen ? "Hide details" : "Show details"}
                </button>
                <span className="text-text-faint">
                  Unscored jobs stay in the queue — click Adjust score again to retry them.
                </span>
              </>
            )}
            <button
              type="button"
              onClick={() => setScoreReport(null)}
              aria-label="Dismiss scoring report"
              className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-text-faint transition-colors hover:text-[#1E2A3D]"
            >
              <X size={12} weight="bold" />
            </button>
          </div>
          {reportOpen && Object.keys(scoreReport.errorSummary).length > 0 && (
            <ul className="mt-2 space-y-1 border-t border-[#D7E4ED] pt-2">
              {Object.entries(scoreReport.errorSummary).map(([message, count]) => (
                <li key={message} className="text-[12px] text-text-muted">
                  <span className="tabular-nums text-text-faint">{count}×</span> {message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
          <Briefcase size={28} weight="regular" className="text-[#B8C4D1]" />
          <p className="text-[14px] text-text-muted">Click &quot;Scrape Now&quot; to find jobs.</p>
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
              <span className="text-[12px] text-text-faint">
                {sorted.length} jobs · page {currentPage} of {pageCount}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  aria-label="Previous page"
                  className={iconButton}
                >
                  <ArrowLeft size={14} weight="bold" />
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={currentPage === pageCount}
                  aria-label="Next page"
                  className={iconButton}
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
