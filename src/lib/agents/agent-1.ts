import { generateText } from "@/lib/openrouter";

// Reads a candidate's CV (résumé) for the details a cover letter header needs.
// The app never creates a CV — uploading one only fills these fields in.
export interface ParsedProfile {
  name: string | null;
  email: string | null;
  phone: string | null;
  street_address: string | null;
  location: string | null;
}

const PROMPT = `You are an expert CV parser. Extract the candidate's contact details from the
CV text below. The CV may be in English or German.

- name: full name
- email
- phone
- street_address: street and house number only (e.g. "Musterstraße 12")
- location: postcode and city, as in a letter's address line (e.g. "22765 Hamburg");
  just the city if no postcode is given

Use null for anything the CV doesn't contain. Return ONLY valid JSON, no markdown,
no explanations:
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+49 123 4567890",
  "street_address": "Musterstraße 12",
  "location": "22765 Hamburg"
}

CV Text:
`;

export async function parseProfileFromCV(cvText: string): Promise<ParsedProfile> {
  const raw = (await generateText(PROMPT + cvText)).trim();
  const json = raw.replace(/^```(?:json)?\s*|\s*```$/g, "");
  return JSON.parse(json);
}

// Suggests "What you bring" chips for the scoring preferences. The CV is only
// read once here — it's tailored per application, so scoring never uses it.
export interface ParsedSkills {
  strong: string[];
  basics: string[];
  languages: string;
}

const SKILLS_PROMPT = `You read a CV (in English or German) and list what the candidate brings,
as short chips for a job-matching profile. Any profession, not only IT.

- strong: things they used at work, in an Ausbildung, studies or real projects:
  tools, software, methods, kinds of work ("Customer service", "Wound care",
  "React"), plus completed degrees and Ausbildungen ("B.Sc. Computer Science",
  "Kauffrau für Büromanagement") and licences or certificates
  ("Führerschein B", "Staplerschein"). Each chip 1-5 words, the CV's own term.
- basics: things they only touched: courses, hobby projects, "Grundkenntnisse",
  "basic knowledge".
- languages: spoken languages with their level in one line
  ("German native, English C1"); "" if the CV names none.

No soft skills (teamwork, reliability, motivation), no job titles, no company
names, no duplicates. At most 40 strong and 20 basics chips. Return ONLY valid
JSON, no markdown:
{"strong":["React","Customer service","B.Sc. Media Informatics"],"basics":["Python"],"languages":"German native, English C1"}

CV Text:
`;

const chipList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter((v): v is string => typeof v === "string" && v.trim() !== "")
        .map((v) => v.trim())
    : [];

export async function parseSkillsFromCV(cvText: string): Promise<ParsedSkills> {
  const raw = (await generateText(SKILLS_PROMPT + cvText, { temperature: 0 })).trim();
  const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "")) as Record<
    string,
    unknown
  >;
  return {
    strong: chipList(parsed.strong).slice(0, 40),
    basics: chipList(parsed.basics).slice(0, 20),
    languages: typeof parsed.languages === "string" ? parsed.languages.trim() : "",
  };
}
