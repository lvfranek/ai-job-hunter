import { getGeminiModel } from "@/lib/gemini";

export interface ParsedProfile {
  name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  languages: string[];
  current_situation: string | null;
  skills_frontend: string[];
  skills_backend: string[];
  skills_devops: string[];
  skills_soft: string[];
  skills_tools: string[];
}

const PROMPT = `You are an expert CV parser. Extract structured information from the CV text below.

Focus on:
1. Full name (if present)
2. Email address (if present)
3. Phone number (if present)
4. Location (city/country if mentioned)
5. Languages spoken (e.g. German, English)
6. Current situation: a short one-line summary of their current role and experience (e.g. "Senior Product Manager, 8 years experience"). The candidate may edit this later if the CV doesn't reflect their actual current situation (e.g. between jobs, studying).
7. Technical skills, split into categories — be generous, include everything you see:
   - frontend (React, Vue, CSS, TypeScript, ...)
   - backend (Node.js, Python, PostgreSQL, ...)
   - devops (Docker, AWS, Kubernetes, CI/CD, ...)
   - tools (Jira, Figma, Excel, or anything else that doesn't fit the categories above)
   - soft (Leadership, Communication, ...)

Return ONLY valid JSON, no markdown, no explanations:
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+49 123 4567890",
  "location": "Berlin, Germany",
  "languages": ["German", "English"],
  "current_situation": "Senior Product Manager, 8 years experience",
  "skills_frontend": ["React", "TypeScript"],
  "skills_backend": ["Node.js", "PostgreSQL"],
  "skills_devops": ["Docker", "AWS"],
  "skills_tools": ["Jira", "Figma"],
  "skills_soft": ["Leadership", "Communication"]
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
