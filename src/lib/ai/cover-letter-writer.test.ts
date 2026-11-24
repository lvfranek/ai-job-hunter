import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DbJob, Profile } from "@/lib/types";
import { checkLetter, replaceDashes, writeCoverLetter } from "./cover-letter-writer";

const generateJson = vi.hoisted(() => vi.fn());
vi.mock("@/lib/openrouter", () => ({ generateJson }));

/** A paragraph of `words` plain words. */
const para = (words: number) => Array.from({ length: words }, (_, i) => `word${i}`).join(" ");
const goodLetter = [para(60), para(60), para(60), para(60)];

describe("checkLetter", () => {
  it("passes four paragraphs of the right length", () => {
    expect(checkLetter(goodLetter, "en")).toEqual([]);
  });

  it("counts paragraphs and words", () => {
    expect(checkLetter([para(60), para(60), para(60)], "en")).toEqual([
      "Write exactly 4 paragraphs, not 3.",
      "The letter has 180 words; it must have 200-300.",
    ]);
    expect(checkLetter([para(80), para(80), para(80), para(80)], "en")).toEqual([
      "The letter has 320 words; it must have 200-300.",
    ]);
  });

  it("finds stock phrases in English and German", () => {
    const english = [
      `I am excited to apply for this role. ${para(53)}`,
      para(60),
      para(60),
      para(60),
    ];
    expect(checkLetter(english, "en")).toEqual([
      'Remove the stock phrase "I am excited to apply".',
    ]);
    const german = [
      `Hiermit bewerbe ich mich als Entwickler. ${para(54)}`,
      `Ich bin der ideale Kandidat für die Stelle. ${para(52)}`,
      para(60),
      para(60),
    ];
    expect(checkLetter(german, "de")).toEqual([
      'Remove the stock phrase "Hiermit bewerbe ich mich".',
      'Remove the stock phrase "ideale Kandidat".',
    ]);
  });

  it("replaces dashes between words with commas, but keeps ranges", () => {
    expect(replaceDashes("Fast and simple — that is my goal.")).toBe(
      "Fast and simple, that is my goal.",
    );
    expect(replaceDashes("Schnell – und einfach.")).toBe("Schnell, und einfach.");
    expect(replaceDashes("I have 2–3 years of it.")).toBe("I have 2–3 years of it.");
  });

  it("notices a letter in the wrong language", () => {
    const german = [
      `Ich habe mit React und TypeScript bei einer Agentur gearbeitet. ${para(51)}`,
      para(60),
      para(60),
      para(60),
    ];
    expect(checkLetter(german, "en")).toEqual(["Write the letter in English."]);
    expect(checkLetter(german, "de")).toEqual([]);
  });
});

describe("writeCoverLetter", () => {
  const input = {
    profile: {
      name: "Ada Muster",
      personal_story: "Built a booking app for my parents' guesthouse.",
      key_achievements: ["Cut page load time by 40 %"],
      motivation: "I want to build products people use daily.",
    } as Profile,
    job: { title: "Frontend Developer", company: "Acme", description: "React" } as DbJob,
    language: "en" as const,
    met: [
      {
        text: "React",
        kind: "skill" as const,
        status: "met" as const,
        evidence: "React",
        core: true,
      },
    ],
  };
  const prompts = () => generateJson.mock.calls.map((call) => String(call[0]));

  beforeEach(() => {
    generateJson.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("returns a letter that passes both checks without a rewrite", async () => {
    generateJson
      .mockResolvedValueOnce({ paragraphs: goodLetter })
      .mockResolvedValueOnce({ invented: [] });
    const letter = await writeCoverLetter(input);
    expect(letter).toEqual({ paragraphs: goodLetter, problems: [], rewrites: 0 });
    // Writer and reviewer both get the verified requirements as facts.
    expect(prompts()[0]).toContain('- React (their profile: "React")');
    expect(prompts()[1]).toContain('- React (their profile: "React")');
  });

  it("sends the letter back with the reviewer's and the code's problems", async () => {
    const invented = [...goodLetter.slice(0, 3), `I led a team of ten. ${para(50)}`];
    generateJson
      .mockResolvedValueOnce({ paragraphs: invented.slice(0, 3) })
      .mockResolvedValueOnce({ invented: ["I led a team of ten"] })
      .mockResolvedValueOnce({ paragraphs: goodLetter })
      .mockResolvedValueOnce({ invented: [] });
    const letter = await writeCoverLetter(input);
    expect(letter.rewrites).toBe(1);
    expect(letter.problems).toEqual([]);
    const rewrite = prompts()[2];
    expect(rewrite).toContain("## Your previous letter");
    expect(rewrite).toContain('"I led a team of ten" goes beyond the candidate facts');
    expect(rewrite).toContain("Write exactly 4 paragraphs, not 3.");
  });

  it("stops after two rewrites and reports what is left", async () => {
    for (let i = 0; i < 3; i++) {
      generateJson
        .mockResolvedValueOnce({ paragraphs: [para(10)] })
        .mockResolvedValueOnce({ invented: [] });
    }
    const letter = await writeCoverLetter(input);
    expect(letter.rewrites).toBe(2);
    expect(letter.problems).toContain("Write exactly 4 paragraphs, not 1.");
    expect(generateJson).toHaveBeenCalledTimes(6);
  });

  it("keeps the letter with the fewest problems, not the last one", async () => {
    generateJson
      .mockResolvedValueOnce({ paragraphs: goodLetter })
      .mockResolvedValueOnce({ invented: ["claim A"] })
      .mockResolvedValueOnce({ paragraphs: [para(10)] })
      .mockResolvedValueOnce({ invented: ["claim A", "claim B"] })
      .mockResolvedValueOnce({ paragraphs: [para(20)] })
      .mockResolvedValueOnce({ invented: ["claim C"] });
    const letter = await writeCoverLetter(input);
    expect(letter.paragraphs).toEqual(goodLetter);
    expect(letter.rewrites).toBe(0);
    expect(letter.problems).toHaveLength(1);
  });

  it("keeps the earlier letter when a rewrite fails", async () => {
    generateJson
      .mockResolvedValueOnce({ paragraphs: goodLetter })
      .mockResolvedValueOnce({ invented: ["claim A"] })
      .mockRejectedValueOnce(new Error("provider down"));
    const letter = await writeCoverLetter(input);
    expect(letter.paragraphs).toEqual(goodLetter);
    expect(letter.problems).toEqual([
      '"claim A" goes beyond the candidate facts: say only what they say, or drop it.',
    ]);
  });

  it("fails when even the first draft fails", async () => {
    generateJson.mockRejectedValueOnce(new Error("provider down"));
    await expect(writeCoverLetter(input)).rejects.toThrow("provider down");
  });

  it("still delivers the letter when the reviewer fails", async () => {
    generateJson
      .mockResolvedValueOnce({ paragraphs: goodLetter })
      .mockRejectedValueOnce(new Error("provider down"));
    const letter = await writeCoverLetter(input);
    expect(letter.paragraphs).toEqual(goodLetter);
    expect(letter.problems).toEqual([]);
  });
});
