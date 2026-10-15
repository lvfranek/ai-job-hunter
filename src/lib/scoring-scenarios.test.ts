import { describe, expect, it } from "vitest";
import { toChanceResult } from "./agents/agent-3";
import data from "./geo/places-dach.json";
import { buildPlaceIndex, resolveHomes, resolveJobPlaces } from "./geo/places";
import { toCandidate, type CandidatePreferences } from "./scoring-rules";

// End to end through everything but the model: a model answer goes through
// the evidence check, the remote check, the real place data and the rules.
// The profile is a real one — remote or hybrid near Oldenburg or Bremen,
// main focus TypeScript.

const index = buildPlaceIndex(data);

const prefs: CandidatePreferences = {
  job_type: ["remote", "hybrid"],
  excluded_employment_types: ["werkstudent", "praktikum", "ausbildung"],
  work_time_models: [],
  experience_years: 2,
  target_levels: ["junior"],
  max_required_years: null,
  dealbreakers: "Kundenakquise, Vertrieb",
  own_skills: "React, Next.js, TypeScript, JavaScript, Python, Django, Tailwind, Git, Supabase",
  basic_skills: "n8n, Docker",
  background: "Qualifizierter Full Stack Web Entwickler, Developer Akademie",
  education: "",
  certifications: "Full Stack Entwickler",
  spoken_languages: "Deutsch: Muttersprache C2, Englisch: Verhandlungssicher C1",
  focus_skills: "TypeScript, React",
};

const { homes } = resolveHomes(index, [
  { place: "Oldenburg", radius_km: 25 },
  { place: "Bremen", radius_km: 25 },
]);
const candidate = toCandidate(prefs, homes);

const tsRequirements = [
  { text: "TypeScript", kind: "skill", status: "met", evidence: "TypeScript" },
  { text: "React", kind: "skill", status: "met", evidence: "React" },
  { text: "Next.js", kind: "skill", status: "met", evidence: "Next.js" },
  { text: "Deutsch C1", kind: "language", status: "met", evidence: "Deutsch: Muttersprache" },
];

function score(
  posting: { title: string; description: string; location?: string | null },
  answer: Record<string, unknown>,
) {
  const job = {
    id: "1",
    title: posting.title,
    description: posting.description,
    location: posting.location ?? null,
    postal_code: null,
    country_code: null,
    latitude: null,
    longitude: null,
  };
  const entry = {
    job_id: "1",
    requirements: tsRequirements,
    required_years: 1,
    posting_level: "junior",
    task_fit: "same",
    work_arrangement: "hybrid",
    work_locations: [],
    contract_form: "regular",
    work_time: "fulltime",
    core_languages: ["TypeScript"],
    focus_central: ["TypeScript", "React"],
    dealbreaker: null,
    reasoning: "",
    ...answer,
  };
  return toChanceResult(entry, job, candidate, (cities) => resolveJobPlaces(index, job, cities));
}

const text = (extra: string) => `${extra}\n${"Wir bauen Software für unsere Kunden. ".repeat(20)}`;

describe("hybrid work near your cities", () => {
  it("rates a hybrid job in Bremen Very good", () => {
    const out = score(
      { title: "Frontend Developer", description: text("2 Tage Büro"), location: "Bremen" },
      {},
    );
    expect(out.chance).toBe("very_good");
    expect(out.work_location).toBe("Bremen");
    expect(out.distance_km).toBe(0);
  });

  it("accepts the town next door", () => {
    const out = score(
      {
        title: "Frontend Developer",
        description: text("Hybrid"),
        location: "28755 Bremen-Vegesack",
      },
      {},
    );
    expect(out.chance).toBe("very_good");
    const delmenhorst = score(
      { title: "Frontend Developer", description: text("Hybrid"), location: "Delmenhorst" },
      {},
    );
    expect(delmenhorst.chance).toBe("very_good");
    expect(delmenhorst.distance_km).toBeLessThanOrEqual(25);
  });

  it("reads LinkedIn's City, State, Country", () => {
    const out = score(
      {
        title: "Frontend Developer",
        description: text("Hybrid"),
        location: "Oldenburg, Niedersachsen, Deutschland",
      },
      {},
    );
    expect(out.work_location).toBe("Oldenburg");
    expect(out.chance).toBe("very_good");
  });

  it("rates a hybrid job in Hamburg Low and says how far", () => {
    const out = score(
      { title: "Frontend Developer", description: text("Hybrid"), location: "Hamburg" },
      {},
    );
    expect(out.chance).toBe("low");
    expect(out.blocker).toMatch(
      /^Office in Hamburg, \d+ km away – you want within 25 km of Oldenburg or 25 km of Bremen$/,
    );
  });

  it("uses the city the model read when the board gave none", () => {
    const out = score(
      { title: "Frontend Developer", description: text("Hybrid, Standort München") },
      { work_locations: ["München"] },
    );
    expect(out.chance).toBe("low");
    expect(out.work_location).toBe("München");
  });

  it("finds the office from the address in the posting (Regensburg)", () => {
    const out = score(
      {
        title: "Frontend Software Developer (m/w/d) Vollzeit | Vor Ort oder hybrid",
        description: text(
          "Option auf zwei Tage Home-Office pro Woche.\n" +
            "Telefon: +49 (0)941 660 800\n" +
            "Hallo Welt! GmbH Bruderwöhrdstraße 29 93055 Regensburg Germany",
        ),
      },
      // The model once answered "Hamburg" here — a city the posting never names.
      { work_locations: ["Hamburg"] },
    );
    expect(out.work_location).toBe("Regensburg");
    expect(out.chance).toBe("low");
    expect(out.blocker).toMatch(/^Office in Regensburg, \d{3} km away/);
  });

  it("rates a Saarbrücken job Low when only the model knows the city", () => {
    const out = score(
      {
        title: "Frontend-Entwickler:in (m/w/d)",
        description: text(
          "Ansässig im Science Park der Universität des Saarlandes. Bis zu drei Tage Homeoffice.",
        ),
      },
      { work_locations: ["Saarbrücken"] },
    );
    expect(out.work_location).toBe("Saarbrücken");
    expect(out.chance).toBe("low");
    expect(out.blocker).toMatch(/^Office in Saarbrücken, \d{3} km away/);
  });

  it("doesn't hold back a hybrid job whose location is unknown, but says so", () => {
    const out = score({ title: "Frontend Developer", description: text("Hybrid") }, {});
    expect(out.chance).toBe("very_good");
    expect(out.downgrades).toEqual(["Location unknown – check the distance yourself"]);
  });

  it("accepts an on-site job in Bremen too — the place decides", () => {
    const out = score(
      { title: "Frontend Developer", description: text("Vor Ort"), location: "Bremen" },
      { work_arrangement: "onsite" },
    );
    expect(out.chance).toBe("very_good");
  });
});

describe("remote work", () => {
  it("rates a clearly remote job anywhere Very good", () => {
    const out = score(
      {
        title: "Frontend Developer (100% remote)",
        description: text("Komplett remote"),
        location: "München",
      },
      { work_arrangement: "remote" },
    );
    expect(out.chance).toBe("very_good");
    expect(out.work_arrangement).toBe("remote");
    expect(out.distance_km).toBeNull();
  });

  it("doesn't believe remote the posting never states", () => {
    const out = score(
      {
        title: "Frontend Developer",
        description: text("Moderne Büros, Home-Office möglich"),
        location: "München",
      },
      { work_arrangement: "remote" },
    );
    expect(out.work_arrangement).toBeNull();
    // Not remote after all, and München is far outside both radii.
    expect(out.chance).toBe("low");
  });
});

describe("main focus and honest skills", () => {
  it("holds a Python job at Good even with every skill met", () => {
    const out = score(
      {
        title: "Python Backend Developer (remote)",
        description: text("100% remote"),
        location: null,
      },
      {
        work_arrangement: "remote",
        core_languages: ["Python"],
        focus_central: [],
        requirements: [
          { text: "Python", kind: "skill", status: "met", evidence: "Python" },
          { text: "Django", kind: "skill", status: "met", evidence: "Django" },
          { text: "Git", kind: "skill", status: "met", evidence: "Git" },
        ],
      },
    );
    expect(out.chance).toBe("good");
  });

  it("doesn't let invented skills make a project manager job Very good", () => {
    const out = score(
      {
        title: "Projektmanager (m/w/d) – remote",
        description: text("100% remote"),
        location: null,
      },
      {
        work_arrangement: "remote",
        core_languages: [],
        focus_central: [],
        task_fit: "adjacent",
        requirements: [
          {
            text: "Projektmanagement",
            kind: "skill",
            status: "met",
            evidence: "Projektmanagement",
          },
          { text: "Budgetplanung", kind: "skill", status: "met", evidence: "Budgetverantwortung" },
          { text: "MS Project", kind: "skill", status: "met", evidence: null },
          {
            text: "Deutsch C1",
            kind: "language",
            status: "met",
            evidence: "Deutsch: Muttersprache",
          },
        ],
      },
    );
    expect(out.requirements.map((r) => r.status)).toEqual(["missing", "missing", "missing", "met"]);
    expect(out.chance).toBe("low");
  });
});
