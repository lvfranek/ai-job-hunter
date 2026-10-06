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
