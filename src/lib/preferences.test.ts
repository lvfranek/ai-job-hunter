import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  fromChips,
  isReadyForScoring,
  normalizePreferences,
  toChips,
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
      background: "My CV",
      focus_skills: "React",
      id: 1,
    });
    expect(out).not.toHaveProperty("preferred_location");
    expect(out).not.toHaveProperty("background");
    expect(out).not.toHaveProperty("focus_skills");
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
    expect(normalizePreferences({ experience_years: "abc" }).experience_years).toBeNull();
    expect(normalizePreferences({ experience_years: 99 }).experience_years).toBe(50);
  });

  it("keeps only known options", () => {
    const out = normalizePreferences({
      level: "intern",
      excluded_employment_types: ["praktikum", "regular"],
      work_time_models: "vollzeit",
    });
    expect(out.level).toBe("mid");
    expect(out.excluded_employment_types).toEqual(["praktikum"]);
    expect(out.work_time_models).toEqual([]);
    expect(normalizePreferences({ level: "senior" }).level).toBe("senior");
  });

  it("keeps the two location switches, on unless turned off", () => {
    expect(normalizePreferences({})).toMatchObject({ remote_ok: true, office_ok: true });
    expect(normalizePreferences({ remote_ok: false, office_ok: "no" })).toMatchObject({
      remote_ok: false,
      office_ok: true,
    });
  });

  it("stores skill chips as one clean comma-separated line", () => {
    const out = normalizePreferences({
      own_skills: [" React ", "react", "Führerschein B", ""],
      basic_skills: "Python;\nSQL,  ",
    });
    expect(out.own_skills).toBe("React, Führerschein B");
    expect(out.basic_skills).toBe("Python, SQL");
  });
});

describe("toChips / fromChips", () => {
  it("round-trips, dropping blanks and case-blind duplicates", () => {
    expect(toChips("React, TypeScript\nreact; Kundenservice,")).toEqual([
      "React",
      "TypeScript",
      "Kundenservice",
    ]);
    expect(fromChips(["React", " SQL ", "sql"])).toBe("React, SQL");
    expect(toChips(fromChips(["B.Sc. Media Informatics", "Excel"]))).toEqual([
      "B.Sc. Media Informatics",
      "Excel",
    ]);
    expect(toChips(null)).toEqual([]);
  });
});

describe("isReadyForScoring", () => {
  it("needs strong skills to compare postings with", () => {
    expect(isReadyForScoring(null)).toBe(false);
    expect(isReadyForScoring({ own_skills: "  " })).toBe(false);
    expect(isReadyForScoring({ own_skills: "Excel" })).toBe(true);
  });
});
