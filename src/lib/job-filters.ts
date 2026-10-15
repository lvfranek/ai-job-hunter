// The dashboard's job filters: what can be chosen, how a choice narrows the
// list, and how many jobs each option would show. Pure module — the filter bar
// renders from it and the tests exercise it directly.

import { chanceRank, compareByChance, type Chance } from "@/lib/chance";
import { JOB_STATUSES, jobStatusLabels, type Job, type JobStatus } from "@/lib/mock-data";

export type SortKey = "chance" | "date";

/** The lowest tier to show; unscored jobs only show under "any". */
export type ChanceFilter = "any" | Exclude<Chance, "low">;

/** How a job is worked, as the scorer confirmed it ("remote" only when the posting says so). */
export type Workplace = NonNullable<Job["arrangement"]>;

export type StatusFilter = JobStatus | "all" | "none";

export interface Filters {
  chance: ChanceFilter;
  /** Any of these; empty = every job, including ones whose workplace is unknown. */
  workplaces: Workplace[];
  sort: SortKey;
  status: StatusFilter;
  /** "Not interested" jobs are hidden unless this is on (or the status filter asks for them). */
  showHidden: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  chance: "any",
  workplaces: [],
  sort: "chance",
  status: "all",
  showHidden: false,
};

export const CHANCE_OPTIONS: ChanceFilter[] = ["any", "fair", "good", "very_good"];

export const chanceOptionLabels: Record<ChanceFilter, string> = {
  any: "All",
  fair: "Fair+",
  good: "Good+",
  very_good: "Very good",
};

export const WORKPLACES: Workplace[] = ["remote", "hybrid", "onsite"];

export const workplaceLabels: Record<Workplace, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
};

export const sortLabels: Record<SortKey, string> = {
  chance: "Best chance first",
  date: "Newest first",
};

export const statusFilterLabels: Record<StatusFilter, string> = {
  all: "Any status",
  none: "No status",
  ...jobStatusLabels,
};

// The single-choice workplace filter of an earlier version, as stored in browsers.
const LEGACY_WORKPLACE: Record<string, Workplace[]> = {
  remote: ["remote"],
  hybrid: ["hybrid"],
  onsite: ["onsite"],
  remote_or_hybrid: ["remote", "hybrid"],
};

/** Whatever a browser stored, as valid filters — field by field, falling back to the defaults. */
export function parseFilters(stored: unknown): Filters {
  const f = (stored && typeof stored === "object" ? stored : {}) as Record<string, unknown>;
  const workplaces = Array.isArray(f.workplaces)
    ? WORKPLACES.filter((w) => (f.workplaces as unknown[]).includes(w))
    : (LEGACY_WORKPLACE[String(f.workplace)] ?? DEFAULT_FILTERS.workplaces);
  return {
    chance: CHANCE_OPTIONS.includes(f.chance as ChanceFilter)
      ? (f.chance as ChanceFilter)
      : DEFAULT_FILTERS.chance,
    workplaces,
    sort: f.sort === "chance" || f.sort === "date" ? f.sort : DEFAULT_FILTERS.sort,
    status:
      f.status === "all" || f.status === "none" || JOB_STATUSES.includes(f.status as JobStatus)
        ? (f.status as StatusFilter)
        : DEFAULT_FILTERS.status,
    showHidden: f.showHidden === true,
  };
}

/** Whether anything that narrows the list is set (sorting doesn't count). */
export function isFiltered(filters: Filters): boolean {
  return (
    filters.chance !== "any" ||
    filters.workplaces.length > 0 ||
    filters.status !== "all" ||
    filters.showHidden
  );
}

type Facet = "chance" | "workplaces";

/**
 * The jobs the filters let through. `skip` leaves one facet out, so each
 * option can show how many jobs it would give with everything else unchanged.
 */
export function filterJobs(jobs: Job[], filters: Filters, skip?: Facet): Job[] {
  const { chance, workplaces, status, showHidden } = filters;
  return jobs.filter(
    (job) =>
      (job.status !== "not_interested" || showHidden || status === "not_interested") &&
      (skip === "chance" ||
        chance === "any" ||
        (job.chance !== null && chanceRank(job.chance) >= chanceRank(chance))) &&
      (skip === "workplaces" ||
        workplaces.length === 0 ||
        (job.arrangement !== null && workplaces.includes(job.arrangement))) &&
      (status === "all" || (status === "none" ? job.status === null : job.status === status)),
  );
}

export function sortJobs(jobs: Job[], sort: SortKey): Job[] {
  const copy = [...jobs];
  return sort === "chance"
    ? copy.sort(compareByChance)
    : copy.sort((a, b) => a.daysAgo - b.daysAgo);
}

/** How many jobs each chance option would show. */
export function chanceCounts(jobs: Job[], filters: Filters): Record<ChanceFilter, number> {
  const base = filterJobs(jobs, filters, "chance");
  return Object.fromEntries(
    CHANCE_OPTIONS.map((option) => [
      option,
      option === "any"
        ? base.length
        : base.filter((j) => j.chance !== null && chanceRank(j.chance) >= chanceRank(option))
            .length,
    ]),
  ) as Record<ChanceFilter, number>;
}

/** How many jobs are worked each way, given the other filters. */
export function workplaceCounts(jobs: Job[], filters: Filters): Record<Workplace, number> {
  const base = filterJobs(jobs, filters, "workplaces");
  return Object.fromEntries(
    WORKPLACES.map((w) => [w, base.filter((j) => j.arrangement === w).length]),
  ) as Record<Workplace, number>;
}
