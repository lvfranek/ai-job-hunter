import { describe, expect, it } from "vitest";
import type { Requirement } from "./chance";
import type { Home, PlacePoints } from "./geo/distance";
import {
  confirmRemote,
  evidenceIn,
  normalizeEvidence,
  verifyRequirements,
  checklistChance,
  computeChance,
  normalizeRequirements,
  readPostingFacts,
  toCandidate,
  type CandidatePreferences,
  type PostingFacts,
} from "./scoring-rules";

// A remote-only, mid-level candidate unless a test says otherwise.
const prefs = (overrides: Partial<CandidatePreferences> = {}): CandidatePreferences => ({
  remote_ok: true,
  office_ok: false,
  excluded_employment_types: [],
  work_time_models: [],
  experience_years: null,
  level: "mid",
  dealbreakers: "",
  own_skills: "Git, React, Next.js, TypeScript, JavaScript, Python, Django, HTML, CSS",
  basic_skills: "",
  spoken_languages: "",
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
      contractForm: "werkstudent",
      workTime: null,
      taskFit: "adjacent",
      requirements: [
        { text: "Java", kind: "skill", status: "missing", evidence: null, core: false },
      ],
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
  it("drops soft skills but keeps language requirements", () => {
    expect(
      normalizeRequirements([
        { text: "Teamfähigkeit", kind: "skill", status: "missing" },
        { text: "sicheres Auftreten", kind: "skill", status: "missing" },
        { text: "Hohes Maß an Eigeninitiative", kind: "skill", status: "met" },
        {
          text: "Kommunikationsfähigkeit auf Deutsch und Englisch",
          kind: "language",
          status: "met",
        },
        { text: "React", kind: "skill", status: "met" },
      ]).map((r) => r.text),
    ).toEqual(["Kommunikationsfähigkeit auf Deutsch und Englisch", "React"]);
  });

  it("keeps at most four requirements as core", () => {
    const raw = Array.from({ length: 7 }, (_, i) => ({
      text: `Skill ${i}`,
      kind: "skill",
      status: "met",
      core: true,
    }));
    expect(normalizeRequirements(raw).filter((r) => r.core)).toHaveLength(4);
  });

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
    ).toEqual([{ text: "SAP", kind: "skill", status: "met", evidence: null, core: false }]);
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
    expect(toCandidate(prefs({ experience_years: 0 })).experienceYears).toBe(0);
    expect(
      toCandidate(prefs({ experience_years: "" as unknown as null })).experienceYears,
    ).toBeNull();
  });

  it("falls back to mid-level for an unknown level", () => {
    expect(toCandidate(prefs({ level: "senior" })).level).toBe("senior");
    expect(toCandidate(prefs({ level: "boss" })).level).toBe("mid");
  });

  it("uses only the skill chips and languages as evidence", () => {
    const c = toCandidate(
      prefs({ own_skills: "Excel", basic_skills: "SAP", spoken_languages: "German native" }),
    );
    expect(c.profile).toEqual({ strong: "excel german native", basic: "sap" });
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

  const core = (r: Requirement): Requirement => ({ ...r, core: true });

  it("weighs the core requirements most", () => {
    // Every core requirement met, one side requirement missing: still Very good.
    expect(
      checklistChance([
        core(met("TypeScript")),
        core(met("React or OpenUI5")),
        core(met("JavaScript")),
        met("PostgreSQL"),
        met("Code review"),
        met("Documentation"),
        partial("Prompting"),
        missing("Automated tests"),
      ]),
    ).toBe("very_good");
    // One key requirement missing: never Very good, Good only when nearly all else fits.
    const oneKeyGap = [
      core(missing("Accessibility")),
      core(met("HTML")),
      core(met("JavaScript")),
      met("SCSS"),
      met("Tailwind"),
      met("Vue.js"),
      met("Git"),
      met("Figma"),
    ];
    expect(checklistChance(oneKeyGap)).toBe("good");
    expect(
      checklistChance([
        core(missing("TypeScript")),
        core(met("React")),
        met("Git"),
        missing("SQL"),
      ]),
    ).toBe("fair");
    // Two key requirements missing: Fair at best.
    expect(
      checklistChance([
        core(missing("Java")),
        core(missing("Spring")),
        met("Git"),
        met("SQL"),
        met("Docker"),
      ]),
    ).toBe("fair");
    // A core requirement only partly met: Good at most.
    expect(
      checklistChance([core(partial("TypeScript")), core(met("React")), met("Git"), met("CSS")]),
    ).toBe("good");
  });

  it("takes the first requirements as core when the model marks none", () => {
    // A gap in the first (core) requirement keeps it from Very good…
    expect(checklistChance([missing("A"), met("B"), met("C"), met("D"), met("E")])).toBe("good");
    // …and with a second gap elsewhere it's Fair.
    expect(checklistChance([missing("A"), met("B"), met("C"), missing("D"), met("E")])).toBe(
      "fair",
    );
    expect(checklistChance([met("A"), met("B"), met("C"), met("D"), missing("E")])).toBe(
      "very_good",
    );
  });

  it("drops to Fair and Low as coverage falls", () => {
    expect(checklistChance([met("A"), met("B"), met("C"), missing("D"), missing("E")])).toBe(
      "good",
    );
    expect(checklistChance([met("A"), missing("B"), met("C"), met("D"), missing("E")])).toBe(
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
    const out = judge(posting, { experience_years: 1, level: "junior" });
    expect(out.chance).toBe("fair");
    expect(out.downgrades).toEqual(["Asks 3 years, you have 1 year – at most Fair"]);
  });

  it("is Good with 2 years of experience", () => {
    expect(judge(posting, { experience_years: 2, level: "junior" }).chance).toBe("good");
  });

  it("is Low when the posting asks for 4 years", () => {
    const out = judge({ requiredYears: 4 }, { experience_years: 1 });
    expect(out.chance).toBe("low");
    expect(out.blockers).toEqual(["4 years of experience required – you have 1 year"]);
  });

  it("is Low for a senior role below the senior level", () => {
    const out = judge({ level: "senior" }, { experience_years: 1, level: "junior" });
    expect(out.chance).toBe("low");
    expect(out.blockers).toEqual(["Senior role – your level is Junior"]);
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

  it("blocks a posting that never says it's remote for a remote-only candidate", () => {
    const out = judge({ arrangement: null });
    expect(out.chance).toBe("low");
    expect(out.blockers).toEqual(["Not clearly remote – the posting never says it's remote"]);
  });

  it("doesn't hold back a posting that doesn't say how it's worked when office work is fine", () => {
    expect(judge({ arrangement: null }, { office_ok: true }).chance).toBe("very_good");
    expect(judge({ arrangement: "onsite" }, { office_ok: true }).chance).toBe("very_good");
  });

  it("blocks a remote job when remote isn't wanted", () => {
    const out = judge({ arrangement: "remote" }, { remote_ok: false, office_ok: true });
    expect(out.chance).toBe("low");
    expect(out.blockers).toEqual(["Remote – you don't want fully remote jobs"]);
    expect(judge({ arrangement: "hybrid" }, { remote_ok: false, office_ok: true }).chance).toBe(
      "very_good",
    );
  });

  it("blocks an excluded contract form the title names", () => {
    const out = judge(
      { title: "Werkstudent Frontend (m/w/d)", contractForm: "werkstudent" },
      { excluded_employment_types: ["werkstudent"] },
    );
    expect(out.chance).toBe("low");
    expect(out.blockers).toEqual(["Working student position – not a contract form you accept"]);
  });

  it("blocks on the title even when the model read it as regular", () => {
    const out = judge(
      { title: "Praktikum Marketing", contractForm: "regular" },
      { excluded_employment_types: ["praktikum"] },
    );
    expect(out.blockers).toEqual(["Internship – not a contract form you accept"]);
  });

  it("blocks an excluded contract form the model alone reports, too", () => {
    const out = judge(
      { contractForm: "werkstudent" },
      { excluded_employment_types: ["werkstudent"] },
    );
    expect(out.chance).toBe("low");
    expect(out.blockers).toEqual(["Working student position – not a contract form you accept"]);
  });

  it("blocks a senior title below the senior level", () => {
    const out = judge({ title: "Senior Fullstack-Entwickler (m/w/d)", level: "mid" });
    expect(out.blockers).toEqual(["Senior role – your level is Mid-level"]);
  });

  it('leaves "(Senior)" titles to the model\'s level', () => {
    const out = judge({ title: "(Senior) Python Developer", level: "mid" }, { level: "mid" });
    expect(out.chance).toBe("very_good");
  });

  it("allows senior roles at the senior level", () => {
    expect(judge({ level: "senior" }, { level: "senior" }).chance).toBe("very_good");
  });

  it("judges the work, not the title or its programming language", () => {
    // "Solution Architect" can be anything: matching requirements keep it on top.
    expect(judge({ title: "Solution Architect (m/w/d)" }).chance).toBe("very_good");
    // A language you don't have is an ordinary missing requirement, not a blocker.
    const java = judge({
      title: "Java Fullstack Developer (all genders)",
      requirements: [
        { ...missing("Java"), core: true },
        { ...met("React"), core: true },
        met("SQL"),
        met("Git"),
        met("REST APIs"),
      ],
    });
    expect(java.blockers).toEqual([]);
    expect(java.chance).toBe("good");
  });

  it("blocks a missing language, not a missing qualification", () => {
    const out = judge({
      requirements: [
        ...ALL_MET,
        { text: "Pflegeexamen", kind: "qualification", status: "missing" },
        { text: "German C1", kind: "language", status: "missing" },
      ],
    });
    expect(out.blockers).toEqual(["Missing language: German C1"]);
    const degree = judge({
      requirements: [
        ...ALL_MET,
        met("Git"),
        met("SQL"),
        { text: "B.Sc. Informatik", kind: "qualification", status: "missing", core: true },
      ],
    });
    expect(degree.blockers).toEqual([]);
    expect(degree.chance).toBe("good");
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
    const out = judge(
      { arrangement: "onsite", workTime: "minijob" },
      { work_time_models: ["vollzeit"] },
    );
    expect(out.blockers).toEqual([
      "On-site, no home office – you only want 100% remote",
      "Minijob – not a working time you accept",
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
  const hybrid = { remote_ok: true, office_ok: true };
  const office = { remote_ok: false, office_ok: true };

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

  it("rates a far job Low even when the posting doesn't say how it's worked", () => {
    const out = judge({ arrangement: null, places: [munich] }, hybrid, [hamburg]);
    expect(out.chance).toBe("low");
    expect(out.blockers).toEqual([
      "Office in München, 612 km away – you want within 10 km of Hamburg",
    ]);
  });

  it("leaves remote jobs alone and doesn't show a distance for them", () => {
    const out = judge({ arrangement: "remote", places: [munich] }, hybrid, [hamburg]);
    expect(out.chance).toBe("very_good");
    expect(out.distanceKm).toBeNull();
  });

  it("ignores the cities when office jobs aren't wanted", () => {
    const out = judge({ arrangement: "remote", places: [munich] }, {}, [hamburg]);
    expect(toCandidate(prefs(), [hamburg]).homes).toEqual([]);
    expect(out.distanceKm).toBeNull();
  });

  it("only notes an unknown location — just a job that's provably too far is held back", () => {
    const out = judge({ arrangement: "hybrid", places: [] }, hybrid, [hamburg, berlin]);
    expect(out.chance).toBe("very_good");
    expect(out.downgrades).toEqual(["Location unknown – check the distance yourself"]);
  });

  it("has nothing to measure without places or cities", () => {
    expect(judge({ arrangement: "remote", places: [] }, hybrid, [hamburg]).distanceKm).toBeNull();
    expect(judge({ arrangement: "onsite", places: [munich] }, office, []).chance).toBe("very_good");
  });

  it("decides by place, not hybrid or on-site, once cities are set", () => {
    const near = judge({ arrangement: "onsite", places: [norderstedt] }, hybrid, [hamburg]);
    expect(near.chance).toBe("very_good");
    const far = judge({ arrangement: "onsite", places: [munich] }, hybrid, [hamburg]);
    expect(far.blockers).toEqual([
      "Office in München, 612 km away – you want within 10 km of Hamburg",
    ]);
  });

  it("still blocks office jobs when office jobs aren't wanted", () => {
    const out = judge({ arrangement: "hybrid", places: [norderstedt] }, {}, [hamburg]);
    expect(out.blockers).toEqual(["Hybrid with office days – you only want 100% remote"]);
    expect(out.distanceKm).toBeNull();
  });
});

describe("verifyRequirements — the model's claims need proof", () => {
  const candidate = toCandidate(
    prefs({
      own_skills: "React, Next.js, TypeScript, KI-Tools (Claude Code, etc.), Shopify-Agentur",
      basic_skills: "Docker, n8n",
      spoken_languages: "Deutsch: Muttersprache C2, Englisch C1",
    }),
  );
  const claim = (text: string, evidence: string | null, kind: Requirement["kind"] = "skill") =>
    ({ text, kind, status: "met", evidence }) as Requirement;
  const statuses = (reqs: Requirement[]) =>
    verifyRequirements(reqs, candidate).map((r) => r.status);

  it("keeps a claim whose quote is in the profile", () => {
    expect(
      statuses([
        claim("React", "React"),
        claim("Next.js", "next js"),
        claim("Claude Code", "Claude Code"),
        claim("E-Commerce", "Shopify-Agentur"),
        claim("German C1", "Deutsch Muttersprache", "language"),
      ]),
    ).toEqual(["met", "met", "met", "partial", "met"]);
  });

  it("turns an invented or missing quote into missing", () => {
    expect(
      statuses([claim("Kubernetes", "Kubernetes"), claim("Power BI", null), claim("SQL", "")]),
    ).toEqual(["missing", "missing", "missing"]);
  });

  it("counts a quote from the basics list as partly met", () => {
    expect(statuses([claim("Docker", "Docker")])).toEqual(["partial"]);
  });

  it("leaves missing claims and unstated languages alone", () => {
    const quiet = toCandidate(prefs({ spoken_languages: "" }));
    const reqs = [
      claim("German C1", null, "language"),
      { ...claim("Go", null), status: "missing" },
    ];
    expect(verifyRequirements(reqs as Requirement[], quiet).map((r) => r.status)).toEqual([
      "met",
      "missing",
    ]);
  });

  it("counts a neighbouring tool as partly met, not met", () => {
    expect(
      statuses([claim("Microsoft Azure", "React"), claim("Python-Kenntnisse", "React")]),
    ).toEqual(["partial", "partial"]);
    expect(statuses([claim("Sehr gute React-Kenntnisse", "React")])).toEqual(["met"]);
  });

  it("matches whole words, not fragments", () => {
    const profile = normalizeEvidence("Tailwind, Vue.js");
    expect(evidenceIn(profile, "AI")).toBe(false);
    expect(evidenceIn(profile, "Vue")).toBe(true);
  });
});

describe("confirmRemote — remote unless the posting names office presence", () => {
  it.each([
    ["Frontend Developer (100% remote)", "remote"],
    ["Wir arbeiten komplett remote.", "remote"],
    ["Ortsunabhängiges Arbeiten in ganz Deutschland", "remote"],
    ["100% Home-Office möglich", "remote"],
    ["Du arbeitest komplett aus dem Homeoffice", "remote"],
    // A general home-office mention is enough.
    ["Flexible Arbeitszeiten und Homeoffice", "remote"],
    ["Standort Essen (Homeoffice Option)", "remote"],
    ["Home-Office möglich, Büro in Bremen", "remote"],
    ["Mobiles Arbeiten nach Absprache", "remote"],
    ["Benefits: 30 Tage Urlaub, Homeoffice, Jobrad", "remote"],
    ["We offer remote work options.", "remote"],
    // Fixed office presence makes it hybrid.
    ["3 Tage Office, 2 Tage Homeoffice", "hybrid"],
    ["bis zu 50 % Mobile Office", "hybrid"],
    ["1-2 Tage pro Woche ins Büro, sonst Homeoffice", "hybrid"],
    ["Homeoffice möglich, aber regelmäßig vor Ort im Team", "hybrid"],
    ["Wir sind Office-first, Homeoffice nach Absprache", "hybrid"],
    ["Eine reine Remote-Tätigkeit ist nicht vorgesehen.", "hybrid"],
    ["Hybrid role, mostly on-site in Berlin", "hybrid"],
    // Home office ruled out.
    ["Remote-Arbeit nicht möglich", "onsite"],
    ["Remote-Arbeit oder mobiles Arbeiten nicht möglich", "onsite"],
    ["This is an on-site position in Munich.", "onsite"],
    // Nothing about home office at all.
    ["Moderne Büros in der Innenstadt", null],
  ])("%s → %s", (text, expected) => {
    expect(confirmRemote("remote", text)).toBe(expected);
  });

  it("never touches hybrid, on-site or unknown", () => {
    expect(confirmRemote("hybrid", "")).toBe("hybrid");
    expect(confirmRemote("onsite", "remote")).toBe("onsite");
    expect(confirmRemote(null, "Homeoffice möglich")).toBeNull();
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
    const junior = { level: "junior" };
    const out = judge({ level: "mid" }, junior);
    expect(out.chance).toBe("fair");
    expect(out.downgrades).toEqual(["Mid-level role, above your level – at most Fair"]);
    expect(
      judge({ level: "mid", requiredYears: 2 }, { ...junior, experience_years: 1 }).chance,
    ).toBe("good");
  });

  it("never holds back a role below the candidate's level", () => {
    expect(judge({ level: "junior" }, { level: "senior" }).chance).toBe("very_good");
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

  it("blocks a working time the candidate doesn't accept", () => {
    const fullTime = { work_time_models: ["vollzeit"] };
    expect(judge({ workTime: "parttime" }, fullTime).blockers).toEqual([
      "Part-time – not a working time you accept",
    ]);
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
        requirements: [met("A"), missing("B"), met("C"), met("D"), missing("E")],
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
