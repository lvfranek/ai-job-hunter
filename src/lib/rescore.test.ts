import { describe, expect, it } from "vitest";
import { DEFAULT_SCORE_OPTIONS, parseScoreOptions, scoreFilterIncludes } from "@/lib/rescore";

describe("parseScoreOptions", () => {
  it("falls back to new/outdated scores for every job", () => {
    expect(parseScoreOptions(null)).toEqual(DEFAULT_SCORE_OPTIONS);
    expect(parseScoreOptions({ scope: "everything", maxAgeDays: -3 })).toEqual(
      DEFAULT_SCORE_OPTIONS,
    );
  });

  it("keeps valid options and drops unknown statuses", () => {
    expect(
      parseScoreOptions({ scope: "all", skipStatuses: ["applied", "bogus"], maxAgeDays: 30 }),
    ).toEqual({ scope: "all", skipStatuses: ["applied"], maxAgeDays: 30 });
  });
});

describe("scoreFilterIncludes", () => {
  const options = {
    scope: "all" as const,
    skipStatuses: ["not_interested" as const],
    maxAgeDays: 14,
  };

  it("skips the chosen statuses and jobs older than the limit", () => {
    expect(scoreFilterIncludes({ status: "not_interested", ageDays: 1 }, options)).toBe(false);
    expect(scoreFilterIncludes({ status: null, ageDays: 15 }, options)).toBe(false);
  });

  it("keeps everything else, including jobs without a status", () => {
    expect(scoreFilterIncludes({ status: null, ageDays: 14 }, options)).toBe(true);
    expect(scoreFilterIncludes({ status: "interested", ageDays: 0 }, options)).toBe(true);
  });
});
