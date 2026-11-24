import { describe, expect, it } from "vitest";
import { toCandidate, type CandidatePreferences } from "@/lib/scoring-rules";
import { chunk, condenseDescription, toChanceResult } from "./job-scorer";

describe("condenseDescription", () => {
  it("returns a placeholder for null input", () => {
    expect(condenseDescription(null)).toBe("(no description available)");
  });

  it("returns short text unchanged", () => {
    expect(condenseDescription("Kurze Beschreibung")).toBe("Kurze Beschreibung");
  });

  it("keeps workplace details from the cut-off part", () => {
    const long = `${"x".repeat(3500)} Benefits: 2 Tage Home-Office pro Woche, Rest im Büro. ${"y".repeat(500)}`;
    const result = condenseDescription(long);
    expect(result).toContain("…[truncated]");
    expect(result).toContain("Workplace details from the truncated part");
    expect(result).toContain("2 Tage Home-Office pro Woche, Rest im Büro.");
    expect(result.length).toBeLessThan(3000 + 1000);
  });

  it("truncates long text and marks it as shortened", () => {
    const long = "x".repeat(4000);
    const result = condenseDescription(long);
    expect(result.endsWith("…[truncated]")).toBe(true);
    expect(result.length).toBeLessThan(long.length);
  });
});

describe("chunk", () => {
  it("splits items into groups of the given size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns an empty array for empty input", () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it("returns a single chunk when size exceeds the item count", () => {
    expect(chunk([1, 2], 10)).toEqual([[1, 2]]);
  });
});

describe("toChanceResult", () => {
  const prefs: CandidatePreferences = {
    remote_ok: true,
    office_ok: false,
    excluded_employment_types: [],
    work_time_models: [],
    experience_years: 1,
    level: "junior",
    dealbreakers: "",
    own_skills: "React, TypeScript, CSS",
    basic_skills: "",
    spoken_languages: "",
  };
  const job = {
    id: "1",
    title: "Frontend Developer",
    description: `Wir arbeiten 100% remote. ${"x".repeat(1000)}`,
  };
  const entry = {
    job_id: "1",
    requirements: [
      { text: "React", kind: "skill", status: "met", evidence: "React" },
      { text: "TypeScript", kind: "skill", status: "met", evidence: "TypeScript" },
      { text: "CSS", kind: "skill", status: "met", evidence: "CSS" },
    ],
    required_years: null,
    posting_level: "junior",
    task_fit: "same",
    work_arrangement: "remote",
    contract_form: "regular",
    work_time: "fulltime",
    dealbreaker: null,
    reasoning: "  React and TypeScript fit.  ",
  };

  it("decides the tier in code from the checklist", () => {
    expect(toChanceResult(entry, job, toCandidate(prefs))).toEqual({
      job_id: "1",
      chance: "very_good",
      requirements: entry.requirements.map((r) => ({ ...r, core: false, specific: true })),
      downgrades: [],
      distance_km: null,
      work_location: "Remote",
      work_arrangement: "remote",
      blocker: null,
      reasoning: "React and TypeScript fit.",
    });
  });

  it("doesn't believe a skill the profile doesn't show", () => {
    const out = toChanceResult(
      {
        ...entry,
        requirements: [
          ...entry.requirements,
          { text: "Kubernetes", kind: "skill", status: "met", evidence: "Kubernetes" },
          { text: "Power BI", kind: "skill", status: "met", evidence: null },
        ],
      },
      job,
      toCandidate(prefs),
    );
    expect(out.requirements.slice(3).map((r) => r.status)).toEqual(["missing", "missing"]);
    // 3 of 5 must-haves are real: no longer a Very good on the strength of invented skills.
    expect(out.chance).toBe("good");
  });

  it("doesn't believe remote when the posting never says it", () => {
    const out = toChanceResult(
      entry,
      { ...job, description: "x".repeat(1000) },
      toCandidate(prefs),
    );
    expect(out.work_arrangement).toBeNull();
    expect(out.chance).toBe("low");
    expect(out.blocker).toBe("Not clearly remote – the posting never says it's remote");
  });

  it("reads a board location of Home Office as remote, never as a place", () => {
    const out = toChanceResult(
      { ...entry, work_arrangement: "unknown" },
      { ...job, description: "x".repeat(1000), location: "Home Office" },
      toCandidate({ ...prefs, office_ok: true }, [
        { label: "Hamburg", points: [[53.55, 9.99]], radiusKm: 10 },
      ]),
    );
    expect(out.work_arrangement).toBe("remote");
    expect(out.distance_km).toBeNull();
    expect(out.blocker).toBeNull();
    expect(out.work_location).toBe("Remote");
  });

  it("lets the posting overrule a Home Office location", () => {
    const out = toChanceResult(
      { ...entry, work_arrangement: "unknown" },
      { ...job, description: `3 Tage im Büro. ${"x".repeat(1000)}`, location: "Home Office" },
      toCandidate(prefs),
    );
    expect(out.work_arrangement).toBe("hybrid");
  });

  it("names where the job is even without a distance", () => {
    const candidate = toCandidate(prefs);
    const located = toChanceResult(
      { ...entry, work_locations: ["Hamburg"] },
      job,
      candidate,
      () => [{ label: "Hamburg", points: [[53.55, 9.99]] }],
    );
    expect(located.work_location).toBe("Hamburg");
    expect(located.distance_km).toBeNull();
    // The model's own words when the place data doesn't know the city.
    expect(
      toChanceResult({ ...entry, work_locations: ["Amsterdam"] }, job, candidate).work_location,
    ).toBe("Amsterdam");
    expect(toChanceResult(entry, job, candidate).work_location).toBe("Remote");
  });

  const hybridJob = { ...job, description: `2 Tage pro Woche im Büro. ${"x".repeat(1000)}` };

  it("hands the model's cities to locate and measures the distance", () => {
    const seen: string[][] = [];
    const out = toChanceResult(
      { ...entry, work_arrangement: "hybrid", work_locations: ["München"] },
      hybridJob,
      toCandidate({ ...prefs, office_ok: true }, [
        { label: "Hamburg", points: [[53.55, 9.99]], radiusKm: 10 },
      ]),
      (cities) => {
        seen.push(cities);
        return [{ label: "München", points: [[48.14, 11.58]] }];
      },
    );
    expect(seen).toEqual([["München"]]);
    expect(out.chance).toBe("low");
    expect(out.distance_km).toBe(612);
    expect(out.work_location).toBe("München");
  });

  it("names every broken rule as the blocker", () => {
    const out = toChanceResult(
      { ...entry, work_arrangement: "hybrid", required_years: 5 },
      hybridJob,
      toCandidate(prefs),
    );
    expect(out.chance).toBe("low");
    expect(out.blocker).toBe(
      "Hybrid with office days – you only want 100% remote; 5 years of experience required – you have 1 year",
    );
  });
});
