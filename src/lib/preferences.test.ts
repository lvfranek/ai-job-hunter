import { describe, expect, it } from "vitest";
import {
  acceptsOfficeWork,
  DEFAULT_PREFERENCES,
  isReadyForScoring,
  MAX_BACKGROUND_CHARS,
  normalizePreferences,
} from "./preferences";

describe("normalizePreferences", () => {
  it("falls back to the defaults for an empty or malformed body", () => {
    expect(normalizePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(normalizePreferences("nope")).toEqual(DEFAULT_PREFERENCES);
  });

  it("cleans the commute cities", () => {
    const out = normalizePreferences({
      work_locations: [
        { place: " Hamburg ", radius_km: "10" },
        { place: "hamburg", radius_km: 5 },
        { place: "", radius_km: 5 },
        { place: "Berlin", radius_km: 999 },
        { place: "Köln", radius_km: 0 },
        { place: "Bonn" },
        "Leipzig",
      ],
    });
    expect(out.work_locations).toEqual([
      { place: "Hamburg", radius_km: 10 },
      { place: "Berlin", radius_km: 200 },
      { place: "Köln", radius_km: 1 },
      { place: "Bonn", radius_km: 25 },
    ]);
    expect(normalizePreferences({ work_locations: "Hamburg" }).work_locations).toEqual([]);
    const many = Array.from({ length: 12 }, (_, i) => ({ place: `City ${i}`, radius_km: 5 }));
    expect(normalizePreferences({ work_locations: many }).work_locations).toHaveLength(10);
  });

  it("drops unknown keys such as removed fields", () => {
    const out = normalizePreferences({
      own_skills: "Wundversorgung",
      preferred_languages: "Go",
      target_roles: "Nurse",
      preferred_location: "Hamburg",
      id: 1,
    });
    expect(out).not.toHaveProperty("preferred_location");
    expect(out).not.toHaveProperty("preferred_languages");
    expect(out).not.toHaveProperty("target_roles");
    expect(out).not.toHaveProperty("id");
    expect(out.own_skills).toBe("Wundversorgung");
  });

  it('parses years: "" is not given, 0 stays 0, nonsense is dropped', () => {
    expect(normalizePreferences({ experience_years: "" }).experience_years).toBeNull();
    expect(normalizePreferences({ experience_years: 0 }).experience_years).toBe(0);
    expect(normalizePreferences({ experience_years: "1.5" }).experience_years).toBe(1.5);
    expect(normalizePreferences({ experience_years: -2 }).experience_years).toBeNull();
    expect(normalizePreferences({ max_required_years: "abc" }).max_required_years).toBeNull();
    expect(normalizePreferences({ max_required_years: 99 }).max_required_years).toBe(50);
  });

  it("keeps only known options", () => {
    const out = normalizePreferences({
      target_levels: ["senior", "intern", "junior"],
      job_type: ["remote", "moon"],
      excluded_employment_types: ["praktikum", "regular"],
      work_time_models: "vollzeit",
    });
    expect(out.target_levels).toEqual(["junior", "senior"]);
    expect(out.job_type).toEqual(["remote"]);
    expect(out.excluded_employment_types).toEqual(["praktikum"]);
    expect(out.work_time_models).toEqual([]);
  });

  it("trims text and caps the CV", () => {
    const out = normalizePreferences({
      notes: "  hello  ",
      background: "x".repeat(MAX_BACKGROUND_CHARS + 100),
    });
    expect(out.notes).toBe("hello");
    expect(out.background).toHaveLength(MAX_BACKGROUND_CHARS);
  });
});

describe("acceptsOfficeWork", () => {
  it("is true unless only remote is ticked", () => {
    expect(acceptsOfficeWork([])).toBe(true);
    expect(acceptsOfficeWork(["remote", "hybrid"])).toBe(true);
    expect(acceptsOfficeWork(["on-site"])).toBe(true);
    expect(acceptsOfficeWork(["remote"])).toBe(false);
  });
});

describe("isReadyForScoring", () => {
  it("needs skills or a CV to compare postings with", () => {
    expect(isReadyForScoring(null)).toBe(false);
    expect(isReadyForScoring({ own_skills: "  ", background: "" })).toBe(false);
    expect(isReadyForScoring({ own_skills: "Excel", background: "" })).toBe(true);
    expect(isReadyForScoring({ own_skills: "", background: "2020–2024 Pflegefachkraft" })).toBe(
      true,
    );
  });
});
