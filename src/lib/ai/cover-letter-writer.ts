import { z } from "zod";
import type { Requirement } from "@/lib/chance";
import { generateJson } from "@/lib/openrouter";
import type { DbJob, Profile } from "@/lib/types";

// Writes the body of a cover letter, then checks it before anyone sees it:
//
//   write → code checks (length, paragraphs, stock phrases)  ─┐
//         → AI reviewer (claims the profile doesn't support) ─┴→ problems? → rewrite (max 2×)
//
// The rules a letter must follow were in the prompt before, but nothing
// checked them; the writer still invented achievements now and then.

export type CoverLetterLanguage = "de" | "en";

export interface CoverLetterInput {
  profile: Profile;
  job: DbJob;
  language: CoverLetterLanguage;
  /** Must-haves the job scorer found the candidate meets, with the proof from their profile. */
  met?: Requirement[];
  /** "What you bring" from the scoring preferences: strong skills, basics, spoken languages. */
  skills?: { strong: string; basics: string; languages: string };
}

export interface CoverLetter {
  paragraphs: string[];
  /** Problems still left after the last rewrite; empty when the letter passed every check. */
  problems: string[];
  rewrites: number;
}

export const PARAGRAPHS = 4;
// The writer is asked for 220-280 words but can't count; the check allows a
// margin, since anything in it still fits on one page.
const TARGET_WORDS = "220-280";
export const MIN_WORDS = 200;
export const MAX_WORDS = 300;
const MAX_REWRITES = 2;

// Letters go to employers, one at a time, so they get a stronger model than the
// bulk scoring. The scoring model wrote thin letters and its reviewer flagged
// plain translations ("built a Django app" for "Django-App gebaut") as invented.
export const LETTER_MODEL = "anthropic/claude-haiku-5.5";

// Openers and claims every recruiter has read a thousand times.
const STOCK_PHRASES = [
  /I am (?:excited|thrilled|delighted|writing) to apply/i,
  /\b(?:perfect|ideal|great) (?:candidate|fit)\b/i,
  /passionate about/i,
  /team ?player/i,
  /hiermit bewerbe ich mich/i,
  /mit großem Interesse habe ich/i,
  /hat mein Interesse geweckt/i,
  /ideale[rn]? Kandidat/i,
  /perfekte[rn]? Kandidat/i,
];

const wordCount = (paragraphs: string[]) => paragraphs.join(" ").match(/\S+/g)?.length ?? 0;

// The most common short words of each language; whichever shows up more often
// is the language the letter is written in.
const COMMON_WORDS: Record<CoverLetterLanguage, RegExp> = {
  de: /\b(?:und|ich|nicht|mit|der|die|das|ist|für|habe|bei|ein|eine|auf|zu)\b/gi,
  en: /\b(?:and|the|with|for|have|is|my|to|of|in|a|at|on|that)\b/gi,
};

function writtenIn(text: string): CoverLetterLanguage {
  const count = (language: CoverLetterLanguage) => text.match(COMMON_WORDS[language])?.length ?? 0;
  return count("de") > count("en") ? "de" : "en";
}

/**
 * "—", or " – " between words: the dash every AI writer reaches for, and kept
 * using after two rewrites. A comma reads fine in its place, so code fixes it.
 */
export function replaceDashes(paragraph: string): string {
  return paragraph.replace(/\s*—\s*|\s–\s/g, ", ");
}

/** What code can check for free: paragraphs, length, language, stock phrases. */
export function checkLetter(paragraphs: string[], language: CoverLetterLanguage): string[] {
  const problems: string[] = [];
  if (paragraphs.length !== PARAGRAPHS) {
    problems.push(`Write exactly ${PARAGRAPHS} paragraphs, not ${paragraphs.length}.`);
  }
  const words = wordCount(paragraphs);
  if (words < MIN_WORDS || words > MAX_WORDS) {
    problems.push(`The letter has ${words} words; it must have ${MIN_WORDS}-${MAX_WORDS}.`);
  }
  const text = paragraphs.join("\n");
  if (text && writtenIn(text) !== language) {
    problems.push(`Write the letter in ${language === "de" ? "German" : "English"}.`);
  }
  for (const phrase of STOCK_PHRASES) {
    const found = phrase.exec(text);
    if (found) problems.push(`Remove the stock phrase "${found[0]}".`);
  }
  return problems;
}

/** Everything the letter may say about the candidate. */
function candidateFacts({ profile, met = [], skills }: CoverLetterInput): string {
  const matched = met
    .filter((r) => r.status !== "missing")
    .map((r) => `- ${r.text}${r.evidence ? ` (their profile: "${r.evidence}")` : ""}`);
  return `Name: ${profile.name ?? "Unknown"}
Personal story: ${profile.personal_story || "none given"}
Key achievements:
${profile.key_achievements.map((a) => `- ${a}`).join("\n") || "none given"}
Motivation: ${profile.motivation || "none given"}
Skills and experience they listed: ${skills?.strong || "none listed"}
Basic knowledge only: ${skills?.basics || "none listed"}
Spoken languages: ${skills?.languages || "not stated"}
Requirements of this job they meet (checked against their profile):
${matched.join("\n") || "none known"}`;
}

const jobText = (job: DbJob) => `Title: ${job.title}
Company: ${job.company}
Description: ${job.description ?? ""}`;

function writerPrompt(input: CoverLetterInput, previous: string[], problems: string[]): string {
  const language = input.language === "de" ? "German, formal (Sie-Form)" : "English, professional";
  const revision =
    problems.length > 0
      ? `

## Your previous letter
${previous.join("\n\n")}

It has these problems. Rewrite it so none of them is left, and keep what was good:
${problems.map((p) => `- ${p}`).join("\n")}`
      : "";

  return `You are an expert cover letter writer. Write the body of a professional, tailored cover letter for the candidate and job below.

RULES:
- Exactly ${PARAGRAPHS} paragraphs.
- ${TARGET_WORDS} words in total, so the whole letter fits on one page.
- No generic phrases ("I am excited to apply…", "the perfect candidate", "Hiermit bewerbe ich mich…").
- Start with a strong hook: a specific achievement, story or insight.
- Tailor every paragraph to THIS job.
- Sound human and personal, not corporate. Short sentences, no dashes (– or —) between them.
- Say only what the candidate facts below support. Never invent achievements, numbers,
  employers, degrees or skills. Pick the facts that matter most for this job.
- Use each fact as it is. Don't add details to it: not how it was done, not which tools
  or methods were used, not numbers, not results or who uses it today. "Cut load time by
  40 %" stays exactly that, never "by introducing code splitting".
- When there are few facts, still reach the length: connect each fact to a task or
  need named in the job ad, say what draws them to this company and this kind of work,
  and what they want to do there. Never fill it with details added to the facts.
- Write in the language below, even when the facts are in another one.
- Language: ${language}

## Candidate facts
${candidateFacts(input)}

## Job
${jobText(input.job)}${revision}

Return the paragraphs only: no subject line, greeting, closing or signature, no markdown.`;
}

const LetterAnswer = z.object({ paragraphs: z.array(z.string()) });

// A plain list of quotes. With a {claim, why} object per entry the model wanted
// to close the object after "claim", which the schema forbids, and wrote
// whitespace until the token limit.
const ReviewAnswer = z.object({ invented: z.array(z.string()) });

/** An AI reviewer: claims about the candidate that their facts don't support. */
export async function findInventedClaims(paragraphs: string[], input: CoverLetterInput) {
  const review = await generateJson(
    `You check a cover letter for invented claims. Below are the ONLY facts known about the
candidate, the job, and the letter.

List every concrete claim the letter makes about the CANDIDATE that the facts don't
support: employers, roles, durations, numbers, degrees, skills, tools, methods used, and
results or usage of their work. A fact counts in any language: "fließend Deutsch" is
supported by "Deutsch Muttersprache".

Watch for added details. When a fact says "cut load time by 40 %" and the letter says
"cut load time by 40 % by introducing code splitting", the method is invented. When a fact
says "built an app" and the letter says "an app used daily", the usage is invented.

A fact said in other words or in another language is supported: "cut load time by 40 %"
and "dass die Ladezeit um 40 % gesenkt wurde" are both supported by "Ladezeit eines
Kundenshops um 40 % gesenkt".

Don't list: a fair paraphrase of a fact, statements about the company or the job, and
opinions, wishes, motivation or how the candidate likes to work ("I enjoy clear
processes"). Quote each claim exactly as the letter says it. Return an empty list when
everything is supported.

## Candidate facts
${candidateFacts(input)}

## Job
${jobText(input.job)}

## Letter
${paragraphs.join("\n\n")}`,
    ReviewAnswer,
    // A short list; a cap ends a runaway answer fast. No temperature: the
    // letter model doesn't take one.
    { model: LETTER_MODEL, maxTokens: 1500 },
  );
  return review.invented.map(
    (claim) => `"${claim}" goes beyond the candidate facts: say only what they say, or drop it.`,
  );
}

/**
 * Write the body paragraphs and check them; rewrite at most {@link MAX_REWRITES}
 * times. A rewrite can also make a letter worse, so the one with the fewest
 * problems wins.
 */
export async function writeCoverLetter(input: CoverLetterInput): Promise<CoverLetter> {
  let paragraphs: string[] = [];
  let problems: string[] = [];
  let best: CoverLetter | null = null;
  for (let round = 0; ; round++) {
    let letter: z.infer<typeof LetterAnswer>;
    try {
      letter = await generateJson(writerPrompt(input, paragraphs, problems), LetterAnswer, {
        model: LETTER_MODEL,
        // It thinks before it writes, and the thinking counts against this cap.
        maxTokens: 8000,
      });
    } catch (error) {
      // A failed rewrite still leaves the earlier letter; only a failed first draft is fatal.
      if (!best) throw error;
      console.warn("Cover letter rewrite failed:", error);
      return best;
    }
    paragraphs = letter.paragraphs.map((p) => replaceDashes(p.trim())).filter(Boolean);
    // A failed review must not cost the letter: the code checks still count.
    const invented = await findInventedClaims(paragraphs, input).catch((error) => {
      console.warn("Cover letter review failed:", error);
      return [];
    });
    problems = [...invented, ...checkLetter(paragraphs, input.language)];
    if (!best || problems.length <= best.problems.length) {
      best = { paragraphs, problems, rewrites: round };
    }
    if (problems.length === 0 || round === MAX_REWRITES) return best;
  }
}
