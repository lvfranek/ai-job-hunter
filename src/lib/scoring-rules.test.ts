import { describe, expect, it } from "vitest";
import type { Requirement } from "./chance";
import type { Home, PlacePoints } from "./geo/distance";
import {
  candidateLanguages,
  checklistChance,
  computeChance,
  missingCoreLanguages,
  normalizeRequirements,
  readPostingFacts,
  titleLanguageRequirement,
  toCandidate,
  type CandidatePreferences,
  type PostingFacts,
} from "./scoring-rules";

const prefs = (overrides: Partial<CandidatePreferences> = {}): CandidatePreferences => ({
  job_type: ["remote"],
  excluded_employment_types: [],
  work_time_models: [],
  experience_years: null,
  target_levels: [],
  max_required_years: null,
  dealbreakers: "",
  own_skills: "Git, React, Next.js, TypeScript, JavaScript, Python, Django, HTML, CSS",
  basic_skills: "",
  ...overrides,
});

const met = (text: string): Requirement => ({ text, kind: "skill", status: "met" });
const partial = (text: string): Requirement => ({ text, kind: "skill", status: "partial" });
const missing = (text: string): Requirement => ({ text, kind: "skill", status: "missing" });

const ALL_MET = [met("React"), met("TypeScript"), met("Node.js"), met("REST APIs")];

const facts = (overrides: Partial<PostingFacts> = {}): PostingFacts => ({
  title: "Full Stack Developer (m/w/d)",
  level: "junior",
  requiredYears: null,
  arrangement: "remote",
  coreLanguages: ["TypeScript"],
  contractForm: "regular",
  workTime: "fulltime",
  taskFit: "same",
  requirements: ALL_MET,
  dealbreaker: null,
  descriptionChars: 2000,
  workLocations: [],
  places: [],
  ...overrides,
});

const judge = (
  f: Partial<PostingFacts> = {},
  p: Partial<CandidatePreferences> = {},
  homes: Home[] = [],
) => computeChance(facts(f), toCandidate(prefs(p), homes));

describe("readPostingFacts", () => {
  const job = { title: "Dev", description: "x".repeat(500) };

  it("reads valid facts and drops unknown values", () => {
    expect(
      readPostingFacts(
        {
          work_arrangement: "Hybrid",
          posting_level: "unknown",
          required_years: "3",
          core_languages: ["Java", "", 4],
          contract_form: "Werkstudent",
          work_time: "sometimes",
          task_fit: "adjacent",
          requirements: [{ text: "Java", kind: "skill", status: "missing" }],
          dealbreaker: "null",
          work_locations: ["Hamburg", 4, "", "Kiel"],
        },
        job,
      ),
    ).toEqual({
      title: "Dev",
      level: null,
      requiredYears: 3,
      arrangement: "hybrid",
      coreLanguages: ["Java"],
      contractForm: "werkstudent",
      workTime: null,
      taskFit: "adjacent",
      requirements: [{ text: "Java", kind: "skill", status: "missing" }],
      dealbreaker: null,
      descriptionChars: 500,
      workLocations: ["Hamburg", "Kiel"],
      places: [],
    });
  });

  it('treats "unknown" arrangement and null years as not stated', () => {
    const read = readPostingFacts({ work_arrangement: "unknown", required_years: null }, job);
    expect(read.arrangement).toBeNull();
    expect(read.requiredYears).toBeNull();
  });

  it("maps level synonyms and counts a missing description as empty", () => {
    const read = readPostingFacts({ posting_level: "Entry" }, { title: "Dev", description: null });
    expect(read.level).toBe("junior");
    expect(read.descriptionChars).toBe(0);
  });
});

describe("normalizeRequirements", () => {
  it("drops years-of-experience entries, invalid statuses and duplicates", () => {
    expect(
      normalizeRequirements([
        { text: "3+ Jahre Berufserfahrung", kind: "skill", status: "missing" },
        { text: "Mehrjährige Erfahrung im Vertrieb", kind: "skill", status: "partial" },
        { text: "React", kind: "skill", status: "maybe" },
        { text: "SAP", kind: "tool", status: "met" },
        { text: "sap", kind: "skill", status: "missing" },
        { text: "  ", kind: "skill", status: "met" },
        "React",
      ]),
    ).toEqual([{ text: "SAP", kind: "skill", status: "met" }]);
  });

  it("keeps the first eight in posting order and shortens long text", () => {
    const raw = Array.from({ length: 10 }, (_, i) => ({
      text: i === 0 ? "x".repeat(80) : `Skill ${i}`,
      kind: "skill",
      status: "met",
    }));
    const out = normalizeRequirements(raw);
    expect(out).toHaveLength(8);
    expect(out[0].text).toHaveLength(60);
    expect(out[7].text).toBe("Skill 7");
  });

  it("returns an empty list for anything that isn't an array", () => {
    expect(normalizeRequirements(null)).toEqual([]);
    expect(normalizeRequirements({ text: "React" })).toEqual([]);
  });
});

describe("toCandidate", () => {
  it('reads "" as not given but keeps 0 years', () => {
    const c = toCandidate(
      prefs({
        experience_years: 0,
        max_required_years: "" as unknown as null,
      }),
    );
    expect(c.experienceYears).toBe(0);
    expect(c.maxRequiredYears).toBeNull();
  });

  it("maps the preferences page's on-site value", () => {
    expect(toCandidate(prefs({ job_type: ["on-site", "hybrid"] })).arrangements).toEqual([
      "onsite",
      "hybrid",
    ]);
  });

  it("derives target levels from experience when none are picked", () => {
    expect(toCandidate(prefs({ experience_years: 1 })).targetLevels).toEqual(["junior"]);
    expect(toCandidate(prefs({ experience_years: 3 })).targetLevels).toEqual(["junior", "mid"]);
    expect(toCandidate(prefs({ experience_years: 6 })).targetLevels).toEqual([
      "junior",
      "mid",
      "senior",
    ]);
    expect(toCandidate(prefs()).targetLevels).toEqual([]);
  });

  it("prefers the levels the candidate picked", () => {
    const c = toCandidate(prefs({ experience_years: 1, target_levels: ["mid", "bogus"] }));
    expect(c.targetLevels).toEqual(["mid"]);
    expect(c.levelsDerived).toBe(false);
  });

  it("reads programming languages from basic skills too", () => {
    const c = toCandidate(prefs({ own_skills: "Excel", basic_skills: "Java" }));
    expect(c.languages).toEqual(new Set(["java"]));
  });
});

describe("checklistChance", () => {
  it("rates a fully covered checklist Very good", () => {
    expect(checklistChance(ALL_MET)).toBe("very_good");
  });

  it("allows one partial for Very good, not two", () => {
    expect(checklistChance([met("A"), met("B"), met("C"), partial("D")])).toBe("very_good");
    expect(checklistChance([met("A"), met("B"), partial("C"), partial("D")])).toBe("good");
  });

  it("never rates a checklist with a missing must-have Very good", () => {
    expect(checklistChance([met("A"), met("B"), met("C"), missing("D")])).toBe("good");
  });

  it("drops to Fair and Low as coverage falls", () => {
    expect(checklistChance([met("A"), met("B"), met("C"), missing("D"), missing("E")])).toBe(
      "fair",
    );
    expect(
      checklistChance([
        met("A"),
        met("B"),
        met("C"),
        missing("D"),
        missing("E"),
        missing("F"),
        missing("G"),
        missing("H"),
      ]),
    ).toBe("low");
  });

  it("needs at least three must-haves for Very good", () => {
    expect(checklistChance([met("A"), met("B")])).toBe("good");
    expect(checklistChance([])).toBe("good");
  });
});

describe("computeChance — the complaint that started this", () => {
  // Posting asks for 3-4 years, every skill matches. Candidate has 1 year and
  // wants junior roles. This used to score 95.
  const posting = { requiredYears: 3, level: "mid" as const };

  it("is Fair with 1 year of experience", () => {
    const out = judge(posting, { experience_years: 1, target_levels: ["junior"] });
    expect(out.chance).toBe("fair");
    expect(out.downgrades).toEqual(["Asks 3 years, you have 1 year – at most Fair"]);
  });

  it("is Good with 2 years of experience", () => {
    expect(judge(posting, { experience_years: 2, target_levels: ["junior"] }).chance).toBe("good");
  });

  it("is Low when the posting asks for 4 years", () => {
    const out = judge({ requiredYears: 4 }, { experience_years: 1 });
    expect(out.chance).toBe("low");
    expect(out.blockers).toEqual(["4 years of experience required – you have 1 year"]);
  });

  it("is Low above the candidate's own limit", () => {
    const out = judge({ requiredYears: 3 }, { experience_years: 2, max_required_years: 2 });
    expect(out.chance).toBe("low");
    expect(out.blockers).toEqual(["3 years of experience required – you accept up to 2"]);
  });

  it("is Low for a senior role when the candidate never picked levels", () => {
    const out = judge({ level: "senior" }, { experience_years: 1 });
    expect(out.chance).toBe("low");
    expect(out.blockers).toEqual(["Senior role – you have 1 year of experience"]);
  });
});

describe("computeChance — blockers", () => {
  it("rates a fitting job Very good", () => {
    expect(judge()).toEqual({
      chance: "very_good",
      blockers: [],
      downgrades: [],
      distanceKm: null,
      workLocation: null,
    });
  });

  it("blocks a hybrid job for a remote-only candidate", () => {
    const out = judge({ arrangement: "hybrid" });
    expect(out.chance).toBe("low");
    expect(out.blockers).toEqual(["Hybrid with office days – you only want 100% remote"]);
  });

  it("does not block when the posting doesn't say where the work happens", () => {
    expect(judge({ arrangement: null }).chance).toBe("very_good");
  });

  it("does not block on arrangement when the candidate set no preference", () => {
    expect(judge({ arrangement: "onsite" }, { job_type: [] }).chance).toBe("very_good");
  });

  it("blocks an excluded contract form the title names", () => {
    const out = judge(
      { title: "Werkstudent Frontend (m/w/d)", contractForm: "werkstudent" },
      { excluded_employment_types: ["werkstudent"] },
    );
    expect(out.chance).toBe("low");
    expect(out.blockers).toEqual(["Working student position – you excluded this contract form"]);
  });

  it("blocks on the title even when the model read it as regular", () => {
    const out = judge(
      { title: "Praktikum Marketing", contractForm: "regular" },
      { excluded_employment_types: ["praktikum"] },
    );
    expect(out.blockers).toEqual(["Internship – you excluded this contract form"]);
  });

  it("only caps an excluded contract form the model alone reports", () => {
    const out = judge(
      { contractForm: "werkstudent" },
      { excluded_employment_types: ["werkstudent"] },
    );
    expect(out.chance).toBe("fair");
    expect(out.downgrades).toEqual([
      "May be a working student position, which you excluded – at most Fair",
    ]);
  });

  it("blocks a senior title when senior is not a target level", () => {
    const out = judge(
      { title: "Senior Fullstack-Entwickler (m/w/d)", level: "mid" },
      { target_levels: ["junior", "mid"] },
    );
    expect(out.blockers).toEqual(["Senior role – you're not looking for senior positions"]);
  });

  it('leaves "(Senior)" titles to the model\'s level', () => {
    const out = judge(
      { title: "(Senior) Python Developer", level: "mid", coreLanguages: [] },
      { target_levels: ["junior", "mid"] },
    );
    expect(out.chance).toBe("very_good");
  });

  it("allows senior roles when the candidate targets them", () => {
    expect(judge({ level: "senior" }, { target_levels: ["senior"] }).chance).toBe("very_good");
  });

  it("ignores seniority without levels or experience", () => {
    expect(judge({ level: "senior" }).chance).toBe("very_good");
  });

  it("blocks a Java role when Java isn't in the skills", () => {
    const out = judge({ coreLanguages: ["Java"] });
    expect(out.blockers).toEqual(["Java as core language – not in your skills"]);
  });

  it("skips the language rule when the skills list names no language", () => {
    expect(judge({ coreLanguages: ["Java"] }, { own_skills: "Git, Scrum" }).chance).toBe(
      "very_good",
    );
  });

  it("blocks a language named in the title even when the model missed it", () => {
    const out = judge({ title: "Java Fullstack Developer (all genders)" });
    expect(out.blockers).toEqual(["Java as core language – not in your skills"]);
  });

  it("treats several languages in a title as alternatives", () => {
    expect(
      judge({ title: "Fullstack-Entwickler – Java & Angular", coreLanguages: [] }).chance,
    ).toBe("very_good");
  });

  it("blocks a missing mandatory qualification or language", () => {
    const out = judge({
      requirements: [
        ...ALL_MET,
        { text: "Pflegeexamen", kind: "qualification", status: "missing" },
        { text: "German C1", kind: "language", status: "missing" },
      ],
    });
    expect(out.blockers).toEqual([
      "Missing qualification: Pflegeexamen",
      "Missing language: German C1",
    ]);
  });

  it("does not block a partly met language", () => {
    const out = judge({
      requirements: [...ALL_MET, { text: "German C1", kind: "language", status: "partial" }],
    });
    expect(out.chance).toBe("very_good");
  });

  it("blocks a dealbreaker only when the candidate wrote some", () => {
    expect(judge({ dealbreaker: "Shift work" }).chance).toBe("very_good");
    const out = judge({ dealbreaker: "Shift work" }, { dealbreakers: "No shift work" });
    expect(out.blockers).toEqual(["Dealbreaker: Shift work"]);
  });

  it("lists every broken rule", () => {
    const out = judge({ arrangement: "onsite", coreLanguages: ["Java"] });
    expect(out.blockers).toEqual([
      "On-site, no home office – you only want 100% remote",
      "Java as core language – not in your skills",
    ]);
  });
});

describe("computeChance — distance", () => {
  // Tiny stand-ins for the place data: a city is a few points, one per postcode.
  const hamburg: Home = {
    label: "Hamburg",
    points: [
      [53.55, 9.99],
      [53.65, 10.02],
    ],
    radiusKm: 10,
  };
  const berlin: Home = { label: "Berlin", points: [[52.52, 13.4]], radiusKm: 30 };
  const norderstedt: PlacePoints = { label: "Norderstedt", points: [[53.7, 10.0]] };
  const munich: PlacePoints = { label: "München", points: [[48.14, 11.58]] };
  const potsdam: PlacePoints = { label: "Potsdam", points: [[52.4, 13.06]] };
  const hybrid = { job_type: ["remote", "hybrid"] };
  const office = { job_type: ["on-site", "hybrid"] };

  it("blocks an office job outside every radius and says how far", () => {
    const out = judge({ arrangement: "hybrid", places: [munich] }, hybrid, [hamburg, berlin]);
    expect(out.chance).toBe("low");
    expect(out.blockers).toEqual([
      "Office in München, 504 km away – you want within 10 km of Hamburg or 30 km of Berlin",
    ]);
    expect(out.distanceKm).toBe(504);
    expect(out.workLocation).toBe("München");
  });

  it("measures from the edge of the city's area", () => {
    const out = judge({ arrangement: "onsite", places: [norderstedt] }, office, [hamburg]);
    expect(out.chance).toBe("very_good");
    expect(out.distanceKm).toBe(6);
  });

  it("passes when any of several places is within any radius", () => {
    const out = judge({ arrangement: "hybrid", places: [munich, potsdam] }, hybrid, [
      hamburg,
      berlin,
    ]);
    expect(out.blockers).toEqual([]);
    expect(out.workLocation).toBe("Potsdam");
  });

  it("counts a job right on the radius as inside it", () => {
    const edge: PlacePoints = { label: "Edge", points: [[53.65 + 10 / 111.2, 10.02]] };
    const km = judge({ arrangement: "onsite", places: [edge] }, office, [hamburg]).distanceKm;
    expect(km).toBe(10);
    const tight = { ...hamburg, radiusKm: Math.ceil(10.01) };
    expect(judge({ arrangement: "onsite", places: [edge] }, office, [tight]).chance).toBe(
      "very_good",
    );
  });

  it("caps a far job at Fair when the posting doesn't say where it's worked", () => {
    const out = judge({ arrangement: null, places: [munich] }, hybrid, [hamburg]);
    expect(out.chance).toBe("fair");
    expect(out.downgrades).toEqual([
      "Based in München, 612 km away, remote not mentioned – at most Fair",
    ]);
  });

  it("leaves remote jobs alone and doesn't show a distance for them", () => {
    const out = judge({ arrangement: "remote", places: [munich] }, hybrid, [hamburg]);
    expect(out.chance).toBe("very_good");
    expect(out.distanceKm).toBeNull();
  });

  it("ignores the cities of a remote-only candidate", () => {
    const out = judge({ arrangement: "remote", places: [munich] }, { job_type: ["remote"] }, [
      hamburg,
    ]);
    expect(toCandidate(prefs({ job_type: ["remote"] }), [hamburg]).homes).toEqual([]);
    expect(out.distanceKm).toBeNull();
  });

  it("treats no ticked arrangement as office work accepted", () => {
    const out = judge({ arrangement: "onsite", places: [munich] }, { job_type: [] }, [hamburg]);
    expect(out.chance).toBe("low");
  });

  it("has nothing to measure without places or cities", () => {
    expect(judge({ arrangement: "onsite", places: [] }, office, [hamburg]).distanceKm).toBeNull();
    expect(judge({ arrangement: "onsite", places: [munich] }, office, []).chance).toBe("very_good");
  });

  it("doesn't add a distance blocker on top of the arrangement blocker", () => {
    const out = judge({ arrangement: "onsite", places: [munich] }, hybrid, [hamburg]);
    expect(out.blockers).toEqual(["On-site, no home office – you only want 100% remote or hybrid"]);
    expect(out.distanceKm).toBeNull();
  });
});

describe("computeChance — caps", () => {
  it("caps a one-year gap at Good and leaves no gap alone", () => {
    expect(judge({ requiredYears: 2 }, { experience_years: 1 }).chance).toBe("good");
    expect(judge({ requiredYears: 1 }, { experience_years: 0 }).chance).toBe("good");
    expect(judge({ requiredYears: 2 }, { experience_years: 2 }).chance).toBe("very_good");
  });

  it("rounds a partial year of gap up", () => {
    expect(judge({ requiredYears: 2 }, { experience_years: 0.5 }).chance).toBe("fair");
  });

  it("skips the gap rule without the candidate's experience", () => {
    expect(judge({ requiredYears: 5, level: "mid" }).chance).toBe("very_good");
  });

  it("caps by level only when the posting states no years", () => {
    const juniorOnly = { target_levels: ["junior"] };
    expect(judge({ level: "mid" }, juniorOnly).chance).toBe("fair");
    expect(
      judge({ level: "mid", requiredYears: 2 }, { ...juniorOnly, experience_years: 1 }).chance,
    ).toBe("good");
  });

  it("caps a role below every target level at Good", () => {
    const out = judge({ level: "junior" }, { target_levels: ["mid", "senior"] });
    expect(out.chance).toBe("good");
    expect(out.downgrades).toEqual(["Junior role, below the level you target – at most Good"]);
  });

  it("does not cap below-level roles for derived levels", () => {
    expect(judge({ level: "junior" }, { experience_years: 6 }).chance).toBe("very_good");
  });

  it("caps tasks that only partly match or differ, whatever the title", () => {
    const adjacent = judge({ taskFit: "adjacent" });
    expect(adjacent.chance).toBe("good");
    expect(adjacent.downgrades).toEqual(["Tasks only partly match your experience – at most Good"]);
    expect(judge({ taskFit: "different" }).chance).toBe("fair");
    expect(judge({ taskFit: null }).chance).toBe("very_good");
  });

  it("does not let a few met requirements carry a different line of work", () => {
    // "Lagerhelfer, Führerschein B" — the one requirement is met, the work isn't yours.
    const out = judge({ requirements: [met("Führerschein B")], taskFit: "different" });
    expect(out.chance).toBe("fair");
  });

  it("caps a working time the candidate doesn't want", () => {
    const fullTime = { work_time_models: ["vollzeit"] };
    expect(judge({ workTime: "parttime" }, fullTime).chance).toBe("fair");
    expect(judge({ workTime: "both" }, fullTime).chance).toBe("very_good");
    expect(judge({ workTime: null }, fullTime).chance).toBe("very_good");
  });

  it("caps vague postings", () => {
    const few = judge({ requirements: [met("React"), met("TypeScript")] });
    expect(few.chance).toBe("good");
    expect(few.downgrades).toEqual(["Posting names few concrete requirements – at most Good"]);
    expect(judge({ descriptionChars: 120 }).chance).toBe("fair");
  });

  it("never raises a tier and lists every cap that applies", () => {
    const out = judge(
      {
        requirements: [met("A"), met("B"), met("C"), missing("D"), missing("E")],
        taskFit: "adjacent",
        requiredYears: 2,
      },
      { experience_years: 1 },
    );
    expect(out.chance).toBe("fair");
    expect(out.downgrades).toEqual([
      "Asks 2 years, you have 1 year – at most Good",
      "Tasks only partly match your experience – at most Good",
    ]);
  });
});

describe("languages", () => {
  it("maps frameworks to their language and TypeScript onto JavaScript", () => {
    expect(candidateLanguages("Django, Next.js", "Typescript")).toEqual(
      new Set(["python", "javascript"]),
    );
  });

  it("does not confuse Java with JavaScript", () => {
    expect(missingCoreLanguages(["Java"], candidateLanguages("JavaScript"))).toEqual(["Java"]);
  });

  it("accepts a requirement when any alternative is known", () => {
    expect(missingCoreLanguages(["Java oder Python"], candidateLanguages("Python"))).toEqual([]);
    expect(missingCoreLanguages(["Java or Python"], candidateLanguages("Python"))).toEqual([]);
  });

  it("ignores names that aren't programming languages", () => {
    expect(missingCoreLanguages(["SQL", "HTML/CSS"], candidateLanguages("Python"))).toEqual([]);
  });

  it("treats Spring Boot as Java", () => {
    expect(missingCoreLanguages(["Spring Boot"], candidateLanguages("Python"))).toEqual([
      "Spring Boot",
    ]);
  });
});

describe("titleLanguageRequirement", () => {
  it("ignores ambiguous words and titles without languages", () => {
    expect(titleLanguageRequirement("Go-Live Manager (m/w/d)")).toBeNull();
    expect(titleLanguageRequirement("Full Stack Developer (m/w/d)")).toBeNull();
  });
});
