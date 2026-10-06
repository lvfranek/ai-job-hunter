import { describe, expect, it } from "vitest";
import {
  applyHardRules,
  candidateLanguages,
  missingCoreLanguages,
  NO_LIMITS,
  readPostingFacts,
  type PostingFacts,
  type ScoringResult,
  titleLanguageRequirement,
} from "./scoring-rules";

const prefs = {
  job_type: ["remote"],
  own_skills: "Git, React, Next.js, TypeScript, JavaScript, Python, Django, HTML, CSS",
  preferred_languages: "Typescript",
};

const result: ScoringResult = {
  job_id: "1",
  match_score: 95,
  skill_overlap_pct: 90,
  seniority_fit: 80,
  location_fit: 100,
  employment_fit: 100,
  blocker: null,
  reasoning: "Stack passt.",
};

const facts = (overrides: Partial<PostingFacts> = {}): PostingFacts => ({
  title: "Full Stack Developer (m/w/d)",
  level: "junior",
  requiredYears: null,
  arrangement: "remote",
  coreLanguages: ["TypeScript"],
  ...overrides,
});

describe("readPostingFacts", () => {
  it("reads valid facts and drops unknown values", () => {
    expect(
      readPostingFacts(
        {
          work_arrangement: "Hybrid",
          posting_level: "unknown",
          required_years: "3",
          core_languages: ["Java", "", 4],
        },
        "Dev",
      ),
    ).toEqual({
      title: "Dev",
      level: null,
      requiredYears: 3,
      arrangement: "hybrid",
      coreLanguages: ["Java"],
    });
  });

  it('treats "unknown" arrangement and null years as not stated', () => {
    const read = readPostingFacts({ work_arrangement: "unknown", required_years: null }, "Dev");
    expect(read.arrangement).toBeNull();
    expect(read.requiredYears).toBeNull();
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

describe("applyHardRules", () => {
  it("leaves a fitting job alone", () => {
    expect(applyHardRules(result, facts(), prefs, NO_LIMITS)).toEqual(result);
  });

  it("blocks a hybrid job for a remote-only candidate", () => {
    const out = applyHardRules(result, facts({ arrangement: "hybrid" }), prefs, NO_LIMITS);
    expect(out.match_score).toBe(30);
    expect(out.location_fit).toBe(0);
    expect(out.blocker).toBe("Hybrid with office days – you only want 100% remote");
  });

  it("does not block when the posting doesn't say where the work happens", () => {
    expect(applyHardRules(result, facts({ arrangement: null }), prefs, NO_LIMITS)).toEqual(result);
  });

  it("does not block on arrangement when the candidate set no preference", () => {
    const out = applyHardRules(
      result,
      facts({ arrangement: "onsite" }),
      { ...prefs, job_type: [] },
      NO_LIMITS,
    );
    expect(out).toEqual(result);
  });

  it("maps the preferences page's on-site value", () => {
    const out = applyHardRules(
      result,
      facts({ arrangement: "onsite" }),
      { ...prefs, job_type: ["on-site", "hybrid"] },
      NO_LIMITS,
    );
    expect(out).toEqual(result);
  });

  it("blocks a Java role when Java isn't in the skills", () => {
    const out = applyHardRules(result, facts({ coreLanguages: ["Java"] }), prefs, NO_LIMITS);
    expect(out.match_score).toBe(30);
    expect(out.blocker).toBe("Java as core language – not in your skills");
  });

  it("skips the language rule when the skills list names no language", () => {
    const out = applyHardRules(
      result,
      facts({ coreLanguages: ["Java"] }),
      { ...prefs, own_skills: "Git, Scrum", preferred_languages: "" },
      NO_LIMITS,
    );
    expect(out).toEqual(result);
  });

  const noSenior = { excludeSenior: true, maxRequiredYears: null };

  it("blocks a senior title when the candidate excluded senior roles", () => {
    const out = applyHardRules(
      result,
      facts({ title: "Senior Fullstack-Entwickler (m/w/d)", level: "mid" }),
      prefs,
      noSenior,
    );
    expect(out.blocker).toBe("Senior role – you're not looking for senior positions");
    expect(out.seniority_fit).toBe(0);
  });

  it('leaves "(Senior)" titles to the model\'s level', () => {
    const out = applyHardRules(
      result,
      facts({ title: "(Senior) Python Developer", level: "mid", coreLanguages: [] }),
      prefs,
      noSenior,
    );
    expect(out).toEqual(result);
  });

  it("blocks a senior level under a neutral title", () => {
    const out = applyHardRules(result, facts({ level: "senior" }), prefs, noSenior);
    expect(out.match_score).toBe(30);
  });

  it("ignores seniority when the candidate set no senior limit", () => {
    expect(applyHardRules(result, facts({ level: "senior" }), prefs, NO_LIMITS)).toEqual(result);
  });

  it("blocks more required years than the candidate accepts", () => {
    const out = applyHardRules(result, facts({ requiredYears: 3 }), prefs, {
      excludeSenior: false,
      maxRequiredYears: 2,
    });
    expect(out.blocker).toBe("3 years of experience required – you accept up to 2");
  });

  it("lists every broken rule", () => {
    const out = applyHardRules(
      result,
      facts({ arrangement: "onsite", coreLanguages: ["Java"] }),
      prefs,
      NO_LIMITS,
    );
    expect(out.blocker).toBe(
      "On-site, no home office – you only want 100% remote; Java as core language – not in your skills",
    );
  });

  it("leaves the model's own blocker and score alone when no rule breaks", () => {
    const withBlocker = { ...result, blocker: "Studium zwingend" };
    expect(applyHardRules(withBlocker, facts(), prefs, NO_LIMITS)).toEqual(withBlocker);
  });

  it("blocks a language named in the title even when the model missed it", () => {
    const out = applyHardRules(
      result,
      facts({ title: "Java Fullstack Developer (all genders)", coreLanguages: ["TypeScript"] }),
      prefs,
      NO_LIMITS,
    );
    expect(out.blocker).toBe("Java as core language – not in your skills");
  });

  it("names a language only once when model and title both report it", () => {
    const out = applyHardRules(
      result,
      facts({ title: "Java Developer", coreLanguages: ["Java"] }),
      prefs,
      NO_LIMITS,
    );
    expect(out.blocker).toBe("Java as core language – not in your skills");
  });

  it("treats several languages in a title as alternatives", () => {
    const out = applyHardRules(
      result,
      facts({ title: "Fullstack-Entwickler – Java & Angular", coreLanguages: [] }),
      prefs,
      NO_LIMITS,
    );
    expect(out).toEqual(result);
  });
});

describe("titleLanguageRequirement", () => {
  it("ignores ambiguous words and titles without languages", () => {
    expect(titleLanguageRequirement("Go-Live Manager (m/w/d)")).toBeNull();
    expect(titleLanguageRequirement("Full Stack Developer (m/w/d)")).toBeNull();
  });
});
