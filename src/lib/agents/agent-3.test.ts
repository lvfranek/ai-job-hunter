import { describe, expect, it } from "vitest";
import { chunk, condenseDescription, parseScoringResponse, toScoringResult } from "./agent-3";

describe("condenseDescription", () => {
  it("returns a placeholder for null input", () => {
    expect(condenseDescription(null)).toBe("(keine Beschreibung verfügbar)");
  });

  it("returns short text unchanged", () => {
    expect(condenseDescription("Kurze Beschreibung")).toBe("Kurze Beschreibung");
  });

  it("truncates long text and marks it as shortened", () => {
    const long = "x".repeat(4000);
    const result = condenseDescription(long);
    expect(result.endsWith("…[gekürzt]")).toBe(true);
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

  it("salvages individual score objects from truncated/broken JSON", () => {
    const raw = '[{"job_id":"1","match_score":80},{"job_id":"2","match_sc';
    expect(parseScoringResponse(raw)).toEqual([{ job_id: "1", match_score: 80 }]);
  });

  it("returns an empty array when nothing can be salvaged", () => {
    expect(parseScoringResponse("not json at all")).toEqual([]);
  });
});

describe("toScoringResult", () => {
  const base = {
    job_id: "1",
    match_score: 92,
    skill_overlap_pct: 95,
    seniority_fit: 80,
    location_fit: 100,
    employment_fit: 100,
    reasoning: "Stack passt.",
  };

  it("keeps the model's score when nothing is ruled out", () => {
    const result = toScoringResult({ ...base, ruled_out: null, blocker: null });
    expect(result.match_score).toBe(92);
    expect(result.blocker).toBeNull();
  });

  it("forces a ruled-out posting into the blocked band and names the blocker", () => {
    const result = toScoringResult({ ...base, ruled_out: "Senior-Stelle", blocker: null });
    expect(result.match_score).toBe(30);
    expect(result.blocker).toBe("Senior-Stelle");
  });

  it("prefers the model's own blocker text when both are given", () => {
    const result = toScoringResult({
      ...base,
      match_score: 20,
      ruled_out: "Senior",
      blocker: "Nur Senior",
    });
    expect(result.match_score).toBe(20);
    expect(result.blocker).toBe("Nur Senior");
  });

  it('treats the string "null" as no value', () => {
    const result = toScoringResult({ ...base, ruled_out: "null", blocker: "null" });
    expect(result.match_score).toBe(92);
    expect(result.blocker).toBeNull();
  });
});
