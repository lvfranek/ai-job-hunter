import { getGeminiModel } from "@/lib/gemini";
import type { DbJob, Profile } from "@/lib/types";

export type CoverLetterLanguage = "de" | "en";

function buildPrompt(profile: Profile, job: DbJob, language: CoverLetterLanguage): string {
  const languageInstruction =
    language === "de" ? "German, formal (Sie-Form)" : "English, professional";

  return `You are an expert cover letter writer. Write the body of a professional, tailored cover letter based on the candidate's profile and the job description.

RULES:
- Exactly 4 paragraphs (no more, no less)
- Strict hard limit: 220-280 words total. The letterhead, address blocks, and
  greeting/closing already take up significant space, so the body MUST stay
  short enough that the whole letter fits on exactly one page. When in doubt,
  cut a sentence rather than go over.
- No generic phrases ("I am excited to apply..." or "I believe I am the perfect candidate...")
- Start with a strong hook (a specific achievement, story, or insight)
- Tailor every paragraph to THIS specific job description
- Sound human and personal, not corporate
- Use only the candidate's actual achievements listed below — never invent any
- Pick the most relevant achievements for this job from the list provided
- Language: ${languageInstruction}

CANDIDATE:
Name: ${profile.name ?? "Unknown"}
Personal story: ${profile.personal_story || "none given"}
Key achievements:
${profile.key_achievements.map((a) => `- ${a}`).join("\n") || "none given"}
Motivation: ${profile.motivation || "none given"}

JOB:
Title: ${job.title}
Company: ${job.company}
Description: ${job.description ?? ""}

Return ONLY the 4 body paragraphs as plain text, each separated by a blank line.
No subject line, no greeting, no closing, no signature, no markdown formatting.`;
}

/** Generate the 4 tailored body paragraphs for a cover letter (header/greeting/closing are added separately). */
export async function generateCoverLetterBody(
  profile: Profile,
  job: DbJob,
  language: CoverLetterLanguage
): Promise<string[]> {
  const model = await getGeminiModel();
  const result = await model.generateContent(buildPrompt(profile, job, language));
  const raw = result.response.text().trim();

  return raw
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
