import { describe, expect, it } from "vitest";
import type { Job } from "./mock-data";
import {
  chanceCounts,
  DEFAULT_FILTERS,
  filterJobs,
  isFiltered,
  parseFilters,
  sortJobs,
  workplaceCounts,
  type Filters,
} from "./job-filters";

const job = (id: string, fields: Partial<Job> = {}): Job => ({
  id,
  title: id,
  company: "Acme",
  chance: "good",
  coverage: 0.8,
  postedDate: "",
  daysAgo: 1,
  platform: "indeed",
  url: "",
  description: null,
  location: null,
  distanceKm: null,
  arrangement: "remote",
  status: null,
  isScored: true,
  ...fields,
});

const jobs = [
  job("remote-very-good", { chance: "very_good", arrangement: "remote", daysAgo: 5 }),
  job("hybrid-good", { chance: "good", arrangement: "hybrid", daysAgo: 1 }),
  job("onsite-fair", { chance: "fair", arrangement: "onsite" }),
  job("unknown-low", { chance: "low", arrangement: null }),
  job("unscored", { chance: null, arrangement: null, isScored: false }),
  job("hidden-remote", { chance: "very_good", status: "not_interested" }),
];

const ids = (list: Job[]) => list.map((j) => j.id);
const filters = (changes: Partial<Filters> = {}) => ({ ...DEFAULT_FILTERS, ...changes });

describe("filterJobs", () => {
  it("shows everything but hidden jobs by default", () => {
    expect(ids(filterJobs(jobs, filters()))).toEqual([
      "remote-very-good",
      "hybrid-good",
      "onsite-fair",
      "unknown-low",
      "unscored",
    ]);
  });

  it("shows a chance and everything above it", () => {
    expect(ids(filterJobs(jobs, filters({ chance: "good" })))).toEqual([
      "remote-very-good",
      "hybrid-good",
    ]);
  });

  it("shows any of the chosen workplaces, never unknown ones", () => {
    expect(ids(filterJobs(jobs, filters({ workplaces: ["remote", "hybrid"] })))).toEqual([
      "remote-very-good",
      "hybrid-good",
    ]);
    expect(ids(filterJobs(jobs, filters({ workplaces: ["onsite"] })))).toEqual(["onsite-fair"]);
  });

  it("brings hidden jobs back on request", () => {
    expect(ids(filterJobs(jobs, filters({ showHidden: true })))).toContain("hidden-remote");
    expect(ids(filterJobs(jobs, filters({ status: "not_interested" })))).toEqual(["hidden-remote"]);
  });
});

describe("counts per option", () => {
  it("counts each chance with the other filters applied", () => {
    expect(chanceCounts(jobs, filters({ workplaces: ["remote", "hybrid"] }))).toEqual({
      any: 2,
      fair: 2,
      good: 2,
      very_good: 1,
    });
  });

  it("counts each workplace with the other filters applied", () => {
    expect(workplaceCounts(jobs, filters({ chance: "good" }))).toEqual({
      remote: 1,
      hybrid: 1,
      onsite: 0,
    });
  });
});

describe("sorting", () => {
  it("sorts by chance or by date", () => {
    const shown = filterJobs(jobs, filters());
    expect(ids(sortJobs(shown, "chance")).slice(0, 2)).toEqual(["remote-very-good", "hybrid-good"]);
    expect(ids(sortJobs(shown, "date"))[4]).toBe("remote-very-good");
  });
});

describe("parseFilters", () => {
  it("falls back to the defaults for anything invalid", () => {
    expect(parseFilters(null)).toEqual(DEFAULT_FILTERS);
    expect(parseFilters({ chance: "great", workplaces: ["moon"], status: "x" })).toEqual(
      DEFAULT_FILTERS,
    );
  });

  it("reads the single workplace choice of the earlier filter", () => {
    expect(parseFilters({ workplace: "remote_or_hybrid" }).workplaces).toEqual([
      "remote",
      "hybrid",
    ]);
    expect(parseFilters({ workplace: "any" }).workplaces).toEqual([]);
  });

  it("knows when anything narrows the list", () => {
    expect(isFiltered(DEFAULT_FILTERS)).toBe(false);
    expect(isFiltered(filters({ sort: "date" }))).toBe(false);
    expect(isFiltered(filters({ workplaces: ["remote"] }))).toBe(true);
  });
});
