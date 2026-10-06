import { JOB_STATUSES, type JobStatus } from "@/lib/mock-data";

// Which jobs a scoring run started from the dashboard covers. Pure module: the
// dashboard counts with it before you confirm, the server filters with it.

export type ScoreScope = "pending" | "all";

export interface ScoreOptions {
  /** "pending" = new and outdated scores only; "all" = every job, scored or not. */
  scope: ScoreScope;
  /** Jobs with one of these statuses are left as they are. */
  skipStatuses: JobStatus[];
  /** Jobs posted more than this many days ago are left as they are; null = no limit. */
  maxAgeDays: number | null;
}

export const DEFAULT_SCORE_OPTIONS: ScoreOptions = {
  scope: "pending",
  skipStatuses: [],
  maxAgeDays: null,
};

/** Reads options from a request body; anything malformed falls back to the defaults. */
export function parseScoreOptions(raw: unknown): ScoreOptions {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const days = Number(body.maxAgeDays);
  return {
    scope: body.scope === "all" ? "all" : "pending",
    skipStatuses: Array.isArray(body.skipStatuses)
      ? body.skipStatuses.filter((s): s is JobStatus => JOB_STATUSES.includes(s as JobStatus))
      : [],
    maxAgeDays: body.maxAgeDays != null && Number.isInteger(days) && days > 0 ? days : null,
  };
}

/** Whether a job passes the status and age filters. */
export function scoreFilterIncludes(
  job: { status: string | null; ageDays: number },
  options: ScoreOptions,
): boolean {
  if (job.status && (options.skipStatuses as string[]).includes(job.status)) return false;
  if (options.maxAgeDays !== null && job.ageDays > options.maxAgeDays) return false;
  return true;
}
