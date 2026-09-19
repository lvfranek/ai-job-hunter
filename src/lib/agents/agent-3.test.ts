import { describe, expect, it } from "vitest";
import { chunk, condenseDescription, parseScoringResponse } from "./agent-3";

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
