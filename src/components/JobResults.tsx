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
import type { ScoreOptions } from "@/lib/rescore";
import { jobStatusLabels } from "@/lib/mock-data";
import { JobCard } from "@/components/JobCard";
import { AgentStatus } from "@/components/AgentStatus";
import { CoverLetterModal } from "@/components/CoverLetterModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ScoreDialog } from "@/components/ScoreDialog";
import { Toast } from "@/components/Toast";
import { useBackgroundRuns } from "@/lib/background-runs";
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

type StatusFilter = JobStatus | "all" | "none";

const statusFilterLabels: Record<StatusFilter, string> = {
  all: "Any status",
  none: "No status",
  ...jobStatusLabels,
};

const PAGE_SIZE = 25;

export function JobResults({
  jobs,
  lastScraped,
  onRefresh,
  onStatusChange,
}: {
  jobs: Job[];
  lastScraped: string;
  onRefresh: () => void;
  onStatusChange: (jobId: string, status: JobStatus | null) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [minScore, setMinScore] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  // Scrape and scoring runs are owned by the app-wide provider, not this
  // component, so they keep going (and keep reporting) across page changes.
  // scoreStatus is the always-on line next to the Adjust-score button: what the
  // run is doing right now, then how it ended.
  const {
    isScraping,
    scrapeProgress: progress,
    lastPortalCounts,
    startScrape,
    isScoring,
    scoreStatus,
    scoreReport,
    dismissScoreReport,
    startScore,
    cancelScore,
  } = useBackgroundRuns();
  // Set when "Scrape Now" is clicked — holds the run/job estimate for the
  // confirm dialog; scraping starts only once the user confirms.
  const [scrapeConfirm, setScrapeConfirm] = useState<{ runs: number; maxJobs: number } | null>(
    null,
  );
  const [reportOpen, setReportOpen] = useState(false);
  const [scoreDialogOpen, setScoreDialogOpen] = useState(false);
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

  // "Needs scoring" covers both never-scored jobs and ones whose score went
  // stale (preferences changed) — one button handles both.
  const needsScoreCount = jobs.filter((job) => !job.isScored || job.isStale).length;

  // Scoring always goes through the dialog: pick the jobs, then confirm twice —
  // every scored job costs AI credits.
  function handleStartScore(options: ScoreOptions) {
    setScoreDialogOpen(false);
    setReportOpen(false);
    startScore(options);
  }

  const sorted = useMemo(() => {
    const copy = jobs
      .filter((job) => job.matchScore >= minScore)
      .filter(
        (job) =>
          statusFilter === "all" ||
          (statusFilter === "none" ? job.status === null : job.status === statusFilter),
      );
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
          onClick={() => setScoreDialogOpen(true)}
          disabled={isScraping || isScoring || jobs.length === 0}
          className={buttonSecondary}
        >
          <Sparkle size={14} weight="fill" />
          {isScoring ? (
            "Adjusting…"
          ) : needsScoreCount > 0 ? (
            <>
              {/* Shorter label on very narrow phones so it stays on one line. */}
              <span className="max-[360px]:hidden">Adjust score ({needsScoreCount})</span>
              <span className="hidden max-[360px]:inline">Adjust ({needsScoreCount})</span>
            </>
          ) : (
            <>
              <span className="max-[360px]:hidden">Rescore jobs</span>
              <span className="hidden max-[360px]:inline">Rescore</span>
            </>
          )}
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
                  onClick={cancelScore}
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
                state: "scraping",
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
          <div className="col-span-2 row-start-3 grid grid-cols-[1fr_auto_1fr] gap-1.5 max-[360px]:grid-cols-2 sm:flex sm:items-center sm:gap-2">
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
              className="max-[360px]:col-span-2"
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
              onClick={dismissScoreReport}
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

      {scoreDialogOpen && (
        <ScoreDialog
          jobs={jobs}
          onClose={() => setScoreDialogOpen(false)}
          onConfirm={handleStartScore}
        />
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
