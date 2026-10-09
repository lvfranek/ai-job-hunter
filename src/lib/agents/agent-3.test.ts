import { describe, expect, it } from "vitest";
import { toCandidate, type CandidatePreferences } from "@/lib/scoring-rules";
import {
  chunk,
  condenseDescription,
  isCompleteEntry,
  parseScoringResponse,
  toChanceResult,
} from "./agent-3";

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

describe("parseScoringResponse", () => {
  it("parses a bare JSON array", () => {
    const raw = '[{"job_id":"1"},{"job_id":"2"}]';
    expect(parseScoringResponse(raw)).toEqual([{ job_id: "1" }, { job_id: "2" }]);
  });

  it("unwraps a { scores: [...] } wrapper", () => {
    const raw = '{"scores":[{"job_id":"1"}]}';
    expect(parseScoringResponse(raw)).toEqual([{ job_id: "1" }]);
  });

  it("strips a markdown code fence around the JSON", () => {
    const raw = '```json\n[{"job_id":"1"}]\n```';
    expect(parseScoringResponse(raw)).toEqual([{ job_id: "1" }]);
  });

  it("salvages whole job entries, checklist included, from truncated JSON", () => {
    const raw =
      '[{"job_id":"1","requirements":[{"text":"React","kind":"skill","status":"met"}],"task_fit":"same"},' +
      '{"job_id":"2","requirements":[{"text":"Vue","kind":"sk';
    expect(parseScoringResponse(raw)).toEqual([
      {
        job_id: "1",
        requirements: [{ text: "React", kind: "skill", status: "met" }],
        task_fit: "same",
      },
    ]);
  });

  it("returns an empty array when nothing can be salvaged", () => {
    expect(parseScoringResponse("not json at all")).toEqual([]);
  });
});

describe("isCompleteEntry", () => {
  it("needs a checklist and a task fit", () => {
    expect(isCompleteEntry({ job_id: "1", requirements: [], task_fit: "Same" })).toBe(true);
    expect(isCompleteEntry({ job_id: "1", task_fit: "same" })).toBe(false);
    expect(isCompleteEntry({ job_id: "1", requirements: [], task_fit: "unsure" })).toBe(false);
  });
});

describe("toChanceResult", () => {
  const prefs: CandidatePreferences = {
    job_type: ["remote"],
    excluded_employment_types: [],
    work_time_models: [],
    experience_years: 1,
    target_levels: ["junior"],
    max_required_years: null,
    dealbreakers: "",
    own_skills: "React, TypeScript",
    basic_skills: "",
  };
  const job = { id: "1", title: "Frontend Developer", description: "x".repeat(1000) };
  const entry = {
    job_id: "1",
    requirements: [
      { text: "React", kind: "skill", status: "met" },
      { text: "TypeScript", kind: "skill", status: "met" },
      { text: "CSS", kind: "skill", status: "met" },
    ],
    required_years: null,
    posting_level: "junior",
    task_fit: "same",
    work_arrangement: "remote",
    contract_form: "regular",
    work_time: "fulltime",
    core_languages: ["TypeScript"],
    dealbreaker: null,
    reasoning: "  React and TypeScript fit.  ",
  };

  it("decides the tier in code from the checklist", () => {
    expect(toChanceResult(entry, job, toCandidate(prefs))).toEqual({
      job_id: "1",
      chance: "very_good",
      requirements: entry.requirements,
      downgrades: [],
      distance_km: null,
      work_location: "Remote",
      blocker: null,
      reasoning: "React and TypeScript fit.",
    });
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

  it("hands the model's cities to locate and measures the distance", () => {
    const seen: string[][] = [];
    const out = toChanceResult(
      { ...entry, work_arrangement: "hybrid", work_locations: ["München"] },
      job,
      toCandidate({ ...prefs, job_type: ["remote", "hybrid"] }, [
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
      job,
      toCandidate(prefs),
    );
    expect(out.chance).toBe("low");
    expect(out.blocker).toBe(
      "Hybrid with office days – you only want 100% remote; 5 years of experience required – you have 1 year",
    );
  });
});
