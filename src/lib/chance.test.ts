import { describe, expect, it } from "vitest";
import {
  chancesAtLeast,
  compareByChance,
  coverageOf,
  isChance,
  isGoodChance,
  lowerChance,
} from "./chance";

describe("chance tiers", () => {
  it("recognises only the four tiers", () => {
    expect(isChance("very_good")).toBe(true);
    expect(isChance("great")).toBe(false);
    expect(isChance(null)).toBe(false);
  });

  it("picks the lower of two tiers", () => {
    expect(lowerChance("very_good", "fair")).toBe("fair");
    expect(lowerChance("low", "good")).toBe("low");
  });

  it("lists a tier and everything above it", () => {
    expect(chancesAtLeast("good")).toEqual(["good", "very_good"]);
    expect(chancesAtLeast("low")).toHaveLength(4);
  });

  it("counts Good and Very good as good", () => {
    expect(isGoodChance("good")).toBe(true);
    expect(isGoodChance("very_good")).toBe(true);
    expect(isGoodChance("fair")).toBe(false);
    expect(isGoodChance(null)).toBe(false);
  });
});

describe("coverageOf", () => {
  it("counts a partial as half and has no value without requirements", () => {
    expect(
      coverageOf([
        { text: "A", kind: "skill", status: "met" },
        { text: "B", kind: "skill", status: "partial" },
        { text: "C", kind: "skill", status: "missing" },
        { text: "D", kind: "skill", status: "met" },
      ]),
    ).toBe(0.625);
    expect(coverageOf([])).toBeNull();
  });
});

describe("compareByChance", () => {
  it("sorts by tier, then coverage, then newest, with unscored jobs last", () => {
    const jobs = [
      { id: "unscored", chance: null, coverage: null, daysAgo: 0 },
      { id: "good-old", chance: "good" as const, coverage: 0.8, daysAgo: 9 },
      { id: "good-new", chance: "good" as const, coverage: 0.8, daysAgo: 1 },
      { id: "good-more", chance: "good" as const, coverage: 0.9, daysAgo: 20 },
      { id: "very-good", chance: "very_good" as const, coverage: 0.9, daysAgo: 30 },
      { id: "low", chance: "low" as const, coverage: 1, daysAgo: 0 },
    ];
    expect([...jobs].sort(compareByChance).map((j) => j.id)).toEqual([
      "very-good",
      "good-more",
      "good-new",
      "good-old",
      "low",
      "unscored",
    ]);
  });
});
