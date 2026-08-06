import { getGeminiModel } from "@/lib/gemini";

export interface ParsedProfile {
  name: string | null;
  email: string | null;
  skills: string[];
  target_titles: string[];
  target_job_level: string;
  location: string | null;
}

const PROMPT = `You are an expert CV parser. Extract structured information from the CV text below.

Focus on:
1. Full name (if present)
2. Email address (if present)
3. Technical skills (list programming languages, frameworks, tools, databases — be generous, include everything you see)
4. Job titles held or targeted (extract actual job titles from the CV or infer from role descriptions)
5. Seniority level (infer from experience: junior = 0-2 years, mid = 2-5 years, senior = 5-10 years, lead = 10+ years with leadership, principal = strategic leadership)
6. Location (city/country if mentioned)

Return ONLY valid JSON, no markdown, no explanations:
{
  "name": "John Doe",
  "email": "john@example.com",
  "skills": ["React", "Node.js", "Python", "AWS"],
  "target_titles": ["Senior React Developer", "Full Stack Engineer"],
  "target_job_level": "senior",
  "location": "Berlin, Germany"
}

CV Text:
`;

export async function parseProfileFromCV(
  cvText: string,
  modelName?: string
): Promise<ParsedProfile> {
  const model = getGeminiModel(modelName);
  const result = await model.generateContent(PROMPT + cvText);
  const raw = result.response.text().trim();
  const json = raw.replace(/^```(?:json)?\s*|\s*```$/g, "");
  return JSON.parse(json);
}
