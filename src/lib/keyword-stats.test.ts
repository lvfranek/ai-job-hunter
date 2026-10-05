import { describe, expect, it } from "vitest";
import {
  categorizeBlocker,
  computeStats,
  normalizeKeyword,
  suggestKeywords,
  type StatsJob,
  type StatsJobKeyword,
  type StatsSearch,
} from "./keyword-stats";
import { buildTrackingRows } from "./pipeline/keyword-tracking";

function job(id: string, overrides: Partial<StatsJob> = {}): StatsJob {
  return {
    id,
    title: "Developer",
    platform: "linkedin",
    status: null,
    score: 50,
    blocker: null,
    ...overrides,
  };
}

function search(runId: string, keyword: string, overrides: Partial<StatsSearch> = {}): StatsSearch {
  return {
    scrape_run_id: runId,
    run_at: `2026-10-0${runId.slice(-1)}T10:00:00`,
    keyword,
    portal: "linkedin",
    returned: 10,
    new_jobs: 2,
    result_cap: 20,
    error: null,
    ...overrides,
  };
}

const link = (job_id: string, keyword: string, discovered = false): StatsJobKeyword => ({
  job_id,
  keyword,
  discovered,
});

describe("normalizeKeyword", () => {
  it("trims, lower-cases and collapses whitespace", () => {
    expect(normalizeKeyword("  Full  Stack\tDeveloper ")).toBe("full stack developer");
  });
});

describe("categorizeBlocker", () => {
  it("splits combined rule blockers into their categories", () => {
    expect(
      categorizeBlocker(
        "Hybrid mit Büro-Tagen – du suchst nur 100% Remote; Senior-Stelle – du suchst keine Senior-Positionen; Java, C# als Kernsprache – nicht in deinen Skills",
      ).sort(),
    ).toEqual(["location", "seniority", "stack"]);
  });

  it("files experience limits under seniority and contract forms under contract", () => {
    expect(
      categorizeBlocker("5 Jahre Erfahrung gefordert – du suchst Stellen bis 2 Jahre"),
    ).toEqual(["seniority"]);
    expect(
      categorizeBlocker("Werkstudent – du schließt Ausbildung, duales Studium und Werkstudent aus"),
    ).toEqual(["contract"]);
  });

  it("handles free-text model blockers and empty values", () => {
    expect(categorizeBlocker("Standort München, kein Remote")).toEqual(["location"]);
    expect(categorizeBlocker("Reine Vertriebsrolle")).toEqual(["other"]);
    expect(categorizeBlocker(null)).toEqual([]);
  });
});

describe("computeStats", () => {
  it("counts jobs, exclusives, per-search rates and overlap per keyword", () => {
    const jobs = [
      job("a", { score: 90, status: "applied" }),
      job("b", { score: 85 }),
      job("c", { score: 20, blocker: "Java als Kernsprache – nicht in deinen Skills" }),
      job("d", { score: null }),
      job("old", { score: null }), // scraped before keyword tracking
    ];
    const stats = computeStats({
      jobs,
      jobKeywords: [
        link("a", "ai developer", true),
        link("b", "ai developer", true),
        link("b", "web developer"),
        link("c", "web developer", true),
        link("d", "web developer", true),
      ],
      searches: [
        search("run1", "ai developer"),
        search("run2", "ai developer", { new_jobs: 0 }),
        search("run1", "web developer", { returned: 20 }), // hit the cap
        search("run1", "web developer", { portal: "xing", error: "boom", returned: 0 }),
      ],
      activeKeywords: ["AI Developer", "web developer", "frontend entwickler"],
      scrapeRuns: 2,
    });

    const ai = stats.keywords.find((k) => k.keyword === "ai developer")!;
    expect(ai).toMatchObject({
      active: true,
      searches: 2,
      jobs: 2,
      discovered: 2,
      exclusive: 1,
      overlap: { keyword: "web developer", shared: 1 },
      scored: 2,
      avgScore: 87.5,
      goodMatches: 2,
      applied: 1,
      jobsPerSearch: 1,
      newPerSearch: 1,
      goodPerSearch: 1,
    });
    expect(ai.trend.map((p) => p.newJobs)).toEqual([2, 0]);

    const web = stats.keywords.find((k) => k.keyword === "web developer")!;
    expect(web).toMatchObject({ searches: 1, jobs: 3, exclusive: 2, scored: 2, blocked: 1 });
    expect(web.blockers.stack).toBe(1);
    expect(web.boards.find((b) => b.portal === "linkedin")).toMatchObject({ capHits: 1 });
    expect(web.boards.find((b) => b.portal === "xing")).toMatchObject({ failures: 1 });

    // Active but never searched yet: listed, nothing to judge.
    const fresh = stats.keywords.find((k) => k.keyword === "frontend entwickler")!;
    expect(fresh).toMatchObject({ active: true, searches: 0, jobs: 0, verdict: "new" });

    expect(stats.overview).toMatchObject({
      totalJobs: 5,
      scored: 3,
      goodMatches: 2,
      applied: 1,
      scrapeRuns: 2,
      trackedSince: "2026-10-01T10:00:00",
    });
    expect(stats.funnel.map((s) => s.value)).toEqual([5, 3, 2, 1, 1, 0]);
    expect(stats.overview.avgScore).toBeCloseTo(65);
  });

  it("marks paused keywords and judges only keywords with enough searches", () => {
    const runs = ["run1", "run2", "run3"];
    const jobs = Array.from({ length: 9 }, (_, i) => job(`j${i}`, { score: i < 6 ? 90 : 30 }));
    const stats = computeStats({
      jobs,
      jobKeywords: [
        ...["j0", "j1", "j2", "j3", "j4", "j5"].map((id) => link(id, "strong one")),
        ...["j6", "j7"].map((id) => link(id, "weak one")),
        link("j8", "new one"),
      ],
      searches: [
        ...runs.map((r) => search(r, "strong one")),
        ...runs.map((r) => search(r, "weak one")),
        search("run3", "new one"),
      ],
      activeKeywords: ["strong one", "new one"],
      scrapeRuns: 3,
    });
    const verdict = (k: string) => stats.keywords.find((s) => s.keyword === k)!.verdict;
    expect(verdict("strong one")).toBe("strong");
    expect(verdict("weak one")).toBe("weak");
    expect(verdict("new one")).toBe("new");
    expect(stats.keywords.find((s) => s.keyword === "weak one")!.active).toBe(false);
    // Active keywords sort first.
    expect(stats.keywords.slice(0, 2).every((k) => k.active)).toBe(true);
  });

  it("flags only the weaker keyword of a heavily overlapping pair as redundant", () => {
    const runs = ["run1", "run2", "run3"];
    const jobs = Array.from({ length: 25 }, (_, i) => job(`j${i}`, { score: i < 10 ? 90 : 40 }));
    const stats = computeStats({
      jobs,
      jobKeywords: [
        // "full stack developer" finds all 25; "full stack entwickler" finds 22 of the same
        ...jobs.map((j) => link(j.id, "full stack developer")),
        ...jobs.slice(3).map((j) => link(j.id, "full stack entwickler")),
      ],
      searches: [
        ...runs.map((r) => search(r, "full stack developer")),
        ...runs.map((r) => search(r, "full stack entwickler")),
      ],
      activeKeywords: ["full stack developer", "full stack entwickler"],
      scrapeRuns: 3,
    });
    const verdict = (k: string) => stats.keywords.find((s) => s.keyword === k)!.verdict;
    expect(verdict("full stack entwickler")).toBe("redundant");
    expect(verdict("full stack developer")).not.toBe("redundant");
  });

  it("reports freshness lately vs. before so exhausted keywords stand out", () => {
    const stats = computeStats({
      jobs: [],
      jobKeywords: [],
      searches: [
        search("run1", "x", { returned: 10, new_jobs: 8 }),
        search("run2", "x", { returned: 10, new_jobs: 1 }),
        search("run3", "x", { returned: 10, new_jobs: 1 }),
        search("run4", "x", { returned: 10, new_jobs: 1 }),
      ],
      activeKeywords: ["x"],
      scrapeRuns: 4,
    });
    expect(stats.keywords[0].freshness).toEqual({ recent: 0.1, earlier: 0.8 });
  });
});

describe("suggestKeywords", () => {
  it("suggests role phrases from good job titles that no keyword covers", () => {
    const jobs = [
      job("1", { title: "AI Engineer (m/w/d)", score: 90 }),
      job("2", { title: "AI Engineer (m/f/d) - Full Stack, TypeScript", score: 85 }),
      job("3", { title: "Senior AI Engineer", score: 20 }),
      job("4", { title: "Frontend-Entwickler (m/w/d)", score: 85 }),
      job("5", { title: "Frontend Entwickler*in – React", score: 30, status: "applied" }),
      job("6", { title: "Fullstack Developer (m/w/d)", score: 95 }),
      job("7", { title: "Full-Stack Developer", score: 90 }),
      // Most scraped jobs are poor matches — keeps the base rate realistic.
      ...Array.from({ length: 8 }, (_, i) =>
        job(`bad${i}`, { title: "Java Backend Developer", score: 15 }),
      ),
    ];
    const suggestions = suggestKeywords(jobs, ["Full Stack Developer"]);
    const phrases = suggestions.map((s) => s.phrase);
    expect(phrases).toContain("ai engineer");
    expect(phrases).toContain("frontend entwickler");
    // fullstack developer = the existing keyword, written differently
    expect(phrases).not.toContain("fullstack developer");
    // Bad matches only
    expect(phrases).not.toContain("backend developer");
    expect(suggestions.find((s) => s.phrase === "ai engineer")).toEqual({
      phrase: "ai engineer",
      goodJobs: 2,
      jobs: 3,
    });
  });

  it("strips company prefixes and finds single-word German compounds", () => {
    const jobs = [
      job("1", { title: "ACME GmbH: Softwareentwickler/in (m/w/d)", score: 90 }),
      job("2", { title: "Softwareentwickler (m/w/d)", score: 85 }),
      job("3", { title: "Lagerist", score: 10 }),
    ];
    expect(suggestKeywords(jobs, []).map((s) => s.phrase)).toEqual(["softwareentwickler"]);
  });

  it("returns nothing without good matches", () => {
    expect(suggestKeywords([job("1", { title: "AI Engineer", score: 10 })], [])).toEqual([]);
  });
});

describe("buildTrackingRows", () => {
  it("links every URL with a job row and counts new ones per search", () => {
    const rows = buildTrackingRows({
      runId: "run",
      searches: [
        {
          portal: "linkedin",
          keyword: "AI Developer",
          urls: ["u1", "u2", "u2", "u3"],
          resultCap: 20,
          error: null,
        },
        { portal: "xing", keyword: "web developer", urls: ["u4"], resultCap: 20, error: null },
        { portal: "indeed", keyword: "ai developer", urls: [], resultCap: 20, error: "failed" },
      ],
      jobIdByUrl: new Map([
        ["u1", "j1"],
        ["u2", "j2"],
        ["u4", "j4"],
      ]), // u3 failed to insert
      newUrls: new Set(["u1", "u4"]),
      seenAt: "2026-10-05T10:00:00Z",
    });

    expect(rows.jobKeywords).toEqual([
      expect.objectContaining({ job_id: "j1", keyword: "ai developer", discovered: true }),
      expect.objectContaining({ job_id: "j2", keyword: "ai developer", discovered: false }),
      expect.objectContaining({ job_id: "j4", keyword: "web developer", discovered: true }),
    ]);
    expect(rows.searches).toEqual([
      expect.objectContaining({
        portal: "linkedin",
        keyword: "ai developer",
        returned: 4,
        new_jobs: 1,
      }),
      expect.objectContaining({ portal: "xing", returned: 1, new_jobs: 1 }),
      expect.objectContaining({ portal: "indeed", returned: 0, error: "failed" }),
    ]);
  });
});
