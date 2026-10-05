"use client";

import { createContext, useContext, useEffect, useEffectEvent, useRef, useState } from "react";

// Scrapes and scoring runs execute on the server (`after` in /api/scrape and
// /api/score) and never cared what the browser did — but the polling, progress
// and outcome used to live in the dashboard and died with it on every page
// change. This provider sits in the root layout, so following a run survives
// navigation, and on a fresh load it picks up any run that is still going.

const POLL_MS = 1500;
// Stop following after this many failed status requests in a row.
const MAX_POLL_ERRORS = 5;
// Wall-clock caps — the server's stale-run reaper is the real stop signal,
// these only keep a client from polling forever if that somehow never fires.
const SCRAPE_MAX_POLL_MS = 40 * 60 * 1000;
const SCORE_MAX_POLL_MS = 30 * 60 * 1000;
// Pull fresh scores into the list while a run is going so the ranking reorders
// live. Throttled — chunks land in bursts and a full refetch per poll would be
// wasteful.
const SCORE_REFRESH_MS = 3000;
// How long a finished run's outcome stays on screen.
const OUTCOME_MS = 8000;

export type ScrapeProgress = { found: number; completedRuns: number; totalRuns: number };

export type ScoreReport = {
  scored: number;
  failed: number;
  total: number;
  errorSummary: Record<string, number>;
};

type ScrapeStatus = {
  status: string;
  jobsFound?: number;
  jobsStored?: number;
  portalCounts?: Record<string, number>;
  totalRuns?: number;
  completedRuns?: number;
  stalled?: boolean;
};

type ScoreStatus = {
  status: string;
  scored?: number;
  failed?: number;
  total?: number;
  totalChunks?: number;
  completedChunks?: number;
  model?: string | null;
  errorSummary?: Record<string, number>;
};

type BackgroundRuns = {
  isScraping: boolean;
  scrapeProgress: ScrapeProgress;
  /** Jobs per board from the last scrape followed in this session. */
  lastPortalCounts: Record<string, number> | null;
  /** How the last scrape ended; cleared after a few seconds. */
  scrapeOutcome: string | null;
  startScrape: () => void;

  isScoring: boolean;
  /** What the scoring run is doing right now, then how it ended (cleared after a few seconds). */
  scoreStatus: string | null;
  /** Post-run summary: what got scored, what didn't, and why. */
  scoreReport: ScoreReport | null;
  dismissScoreReport: () => void;
  startScore: () => void;
  cancelScore: () => void;

  /** Bumped whenever the job list may have changed — refetch when it does. */
  jobsVersion: number;
};

const BackgroundRunsContext = createContext<BackgroundRuns | null>(null);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function formatEta(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Poll a status endpoint until `onStatus` reports the run is done — but never
 * forever: a run of failed requests or the wall-clock cap ends it too.
 */
async function pollRun<T>(
  url: string,
  maxMs: number,
  onStatus: (status: T) => boolean,
): Promise<{ last: T | null; reason: "done" | "error" | "timeout" }> {
  const startedAt = Date.now();
  let last: T | null = null;
  let consecutiveErrors = 0;
  for (;;) {
    await sleep(POLL_MS);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`status ${res.status}`);
      last = (await res.json()) as T;
      consecutiveErrors = 0;
      if (onStatus(last)) return { last, reason: "done" };
    } catch (err) {
      console.error(`Polling ${url} failed:`, err);
      if (++consecutiveErrors >= MAX_POLL_ERRORS) return { last, reason: "error" };
    }
    if (Date.now() - startedAt > maxMs) return { last, reason: "timeout" };
  }
}

async function findActiveRun(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.activeRunId === "string" ? data.activeRunId : null;
  } catch {
    return null;
  }
}

export function BackgroundRunsProvider({ children }: { children: React.ReactNode }) {
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeProgress, setScrapeProgress] = useState<ScrapeProgress>({
    found: 0,
    completedRuns: 0,
    totalRuns: 0,
  });
  const [lastPortalCounts, setLastPortalCounts] = useState<Record<string, number> | null>(null);
  const [scrapeOutcome, setScrapeOutcome] = useState<string | null>(null);
  const [isScoring, setIsScoring] = useState(false);
  const [scoreStatus, setScoreStatus] = useState<string | null>(null);
  const [scoreReport, setScoreReport] = useState<ScoreReport | null>(null);
  const [jobsVersion, setJobsVersion] = useState(0);
  // Refs, not state: the start functions and the resume check race each other
  // across awaits and must see the latest value synchronously.
  const scrapeBusy = useRef(false);
  const scoreBusy = useRef(false);
  const scoreRunId = useRef<string | null>(null);

  const refreshJobs = () => setJobsVersion((v) => v + 1);

  useEffect(() => {
    if (!scrapeOutcome) return;
    const t = setTimeout(() => setScrapeOutcome(null), OUTCOME_MS);
    return () => clearTimeout(t);
  }, [scrapeOutcome]);

  useEffect(() => {
    if (isScoring || !scoreStatus) return;
    const t = setTimeout(() => setScoreStatus(null), OUTCOME_MS);
    return () => clearTimeout(t);
  }, [isScoring, scoreStatus]);

  /** Start a scrape, or with `resumeRunId` follow one that is already running. */
  async function runScrape(resumeRunId?: string) {
    if (scrapeBusy.current) return;
    scrapeBusy.current = true;
    setIsScraping(true);
    setScrapeOutcome(null);
    setScrapeProgress({ found: 0, completedRuns: 0, totalRuns: 0 });
    let outcome: string | null = null;

    try {
      let runId = resumeRunId;
      if (!runId) {
        const res = await fetch("/api/scrape", { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Scrape failed");
        runId = data.runId as string;
      }

      const { last, reason } = await pollRun<ScrapeStatus>(
        `/api/scrape/status?runId=${runId}`,
        SCRAPE_MAX_POLL_MS,
        (s) => {
          setScrapeProgress({
            found: s.jobsFound ?? 0,
            completedRuns: s.completedRuns ?? 0,
            totalRuns: s.totalRuns ?? 0,
          });
          return s.status !== "running" || s.stalled === true;
        },
      );

      if (last) setLastPortalCounts(last.portalCounts ?? null);
      if (reason !== "done") outcome = "Lost track of the scrape — reload to check on it";
      else if (last?.status === "completed")
        outcome = `Scrape finished · ${last.jobsFound ?? 0} found, ${last.jobsStored ?? 0} new`;
      else outcome = "Scrape failed";
    } catch (error) {
      console.error("Scrape failed:", error);
      outcome = error instanceof Error ? error.message : "Scrape failed";
    } finally {
      scrapeBusy.current = false;
      setIsScraping(false);
      setScrapeOutcome(outcome);
      refreshJobs();
    }
  }

  /** Start scoring, or with `resumeRunId` follow a run that is already going. */
  async function runScore(resumeRunId?: string) {
    if (scoreBusy.current) return;
    scoreBusy.current = true;
    setIsScoring(true);
    setScoreStatus(resumeRunId ? "Working…" : "Starting…");
    setScoreReport(null);
    let outcome: string | null = null;

    try {
      let runId = resumeRunId;
      if (!runId) {
        const res = await fetch("/api/score", { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Scoring failed");
        if (!data.runId) {
          outcome = "Scores already up to date";
          return;
        }
        runId = data.runId as string;
      }
      scoreRunId.current = runId;

      // ETA baseline: when we started watching and how many batches were done
      // by then — a resumed run may already be halfway through.
      let baseline: { at: number; chunks: number } | null = resumeRunId
        ? null
        : { at: Date.now(), chunks: 0 };
      let lastRefreshAt = 0;
      let lastRefreshedScored = 0;

      const { last, reason } = await pollRun<ScoreStatus>(
        `/api/score/status?runId=${runId}`,
        SCORE_MAX_POLL_MS,
        (s) => {
          const scored = s.scored ?? 0;
          const total = s.total ?? 0;
          const failed = s.failed ?? 0;
          const totalChunks = s.totalChunks ?? 0;
          const completedChunks = s.completedChunks ?? 0;
          baseline ??= { at: Date.now(), chunks: completedChunks };

          // Live detail: what the run is chewing on right now, how much is
          // done, what it has already lost, and roughly how long is left.
          const parts: string[] = [];
          if (totalChunks > 0) parts.push(`Batch ${completedChunks}/${totalChunks}`);
          parts.push(total > 0 ? `${scored}/${total} scored` : "Preparing…");
          if (failed > 0) parts.push(`${failed} failed`);
          const chunksSeen = completedChunks - baseline.chunks;
          if (chunksSeen > 0 && completedChunks < totalChunks) {
            const perChunk = (Date.now() - baseline.at) / chunksSeen;
            parts.push(`~${formatEta(perChunk * (totalChunks - completedChunks))} left`);
          }
          if (s.model) parts.push(s.model.split("/").pop() as string);
          setScoreStatus(parts.join(" · "));

          if (scored > lastRefreshedScored && Date.now() - lastRefreshAt > SCORE_REFRESH_MS) {
            lastRefreshedScored = scored;
            lastRefreshAt = Date.now();
            refreshJobs();
          }

          return s.status !== "running";
        },
      );

      const final = {
        status: reason === "done" ? (last?.status ?? "unknown") : "unknown",
        scored: last?.scored ?? 0,
        failed: last?.failed ?? 0,
        total: last?.total ?? 0,
      };
      setScoreReport({ ...final, errorSummary: last?.errorSummary ?? {} });

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
      scoreBusy.current = false;
      setIsScoring(false);
      setScoreStatus(outcome);
      refreshJobs();
    }
  }

  async function cancelScore() {
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

  // After a reload (or a run kicked off by the cron endpoint), reattach to
  // whatever the server is still working on.
  const resumeActiveRuns = useEffectEvent(
    (scrapeRunId: string | null, scoreRunIdToResume: string | null) => {
      if (scrapeRunId) runScrape(scrapeRunId);
      if (scoreRunIdToResume) runScore(scoreRunIdToResume);
    },
  );

  useEffect(() => {
    let ignore = false;
    Promise.all([findActiveRun("/api/scrape/status"), findActiveRun("/api/score/status")]).then(
      ([scrapeRunId, scoreRunIdToResume]) => {
        if (!ignore) resumeActiveRuns(scrapeRunId, scoreRunIdToResume);
      },
    );
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <BackgroundRunsContext.Provider
      value={{
        isScraping,
        scrapeProgress,
        lastPortalCounts,
        scrapeOutcome,
        startScrape: () => void runScrape(),
        isScoring,
        scoreStatus,
        scoreReport,
        dismissScoreReport: () => setScoreReport(null),
        startScore: () => void runScore(),
        cancelScore: () => void cancelScore(),
        jobsVersion,
      }}
    >
      {children}
    </BackgroundRunsContext.Provider>
  );
}

export function useBackgroundRuns() {
  const ctx = useContext(BackgroundRunsContext);
  if (!ctx) throw new Error("useBackgroundRuns must be used within BackgroundRunsProvider");
  return ctx;
}
