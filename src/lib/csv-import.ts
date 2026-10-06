import type { JobStatus } from "@/lib/mock-data";
import { validateApplication, type ApplicationInput } from "@/lib/applications";

// CSV import for the application tracker. Built for a spreadsheet exported from
// Excel: German Excel writes ";" as the separator and DD.MM.YYYY dates, English
// Excel "," — both work, as do German or English column names.

export type ImportRow = { line: number } & (
  { ok: true; value: ApplicationInput } | { ok: false; error: string; raw: string[] }
);

export type ImportResult = { error: string } | { rows: ImportRow[]; columns: string[] };

type Field = "applied_at" | "title" | "company" | "status" | "url" | "salary";

// Matched against the normalized header (lowercase, letters only). An exact
// match wins; otherwise the first alias the header contains.
const HEADER_ALIASES: Record<Field, string[]> = {
  applied_at: ["bewerbungsdatum", "datum", "date", "applied", "beworbenam"],
  title: ["titel", "title", "stelle", "position", "jobtitel", "jobtitle", "job", "rolle", "role"],
  company: ["arbeitgeber", "firma", "unternehmen", "company", "employer"],
  status: ["status", "stand"],
  url: ["link", "url", "stellenanzeige", "anzeige"],
  salary: ["gehalt", "salary", "lohn", "verguetung", "vergutung"],
};

export const FIELD_LABELS: Record<Field, string> = {
  applied_at: "Date",
  title: "Job title",
  company: "Employer",
  status: "Status",
  url: "Link",
  salary: "Salary",
};

const STATUS_WORDS: [JobStatus, string[]][] = [
  ["rejected", ["absage", "abgelehnt", "abgesagt", "rejected", "reject", "declined", "nein"]],
  ["offer", ["angebot", "zusage", "offer", "vertrag"]],
  ["interview", ["interview", "gespraech", "gesprach", "vorstellung", "einladung"]],
  ["not_interested", ["notinterested", "keininteresse", "uninteressant"]],
  ["interested", ["interessant", "interested", "geplant", "merken"]],
  ["applied", ["beworben", "applied", "gesendet", "versendet", "offen", "wartend"]],
];

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z]/g, "");
}

/** Splits CSV text into rows of fields, honoring "quoted ""fields""" with separators and newlines. */
export function parseCsv(text: string, separator: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === separator) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** ";" when the header line has more of them than commas — German Excel's default. */
export function detectSeparator(text: string): string {
  const header = text.split(/\r?\n/, 1)[0];
  const count = (sep: string) => header.split(sep).length - 1;
  if (count("\t") > Math.max(count(";"), count(","))) return "\t";
  return count(";") > count(",") ? ";" : ",";
}

/** Which CSV column feeds which application field. */
export function mapHeaders(headers: string[]): Partial<Record<Field, number>> {
  const normalized = headers.map(normalize);
  const mapping: Partial<Record<Field, number>> = {};
  const used = new Set<number>();
  const fields = Object.keys(HEADER_ALIASES) as Field[];
  // Exact matches first, so "Stellenanzeige" (link) isn't grabbed by "stelle" (title).
  for (const exact of [true, false]) {
    for (const field of fields) {
      if (mapping[field] !== undefined) continue;
      const index = normalized.findIndex(
        (h, i) =>
          !used.has(i) &&
          h !== "" &&
          HEADER_ALIASES[field].some((alias) => (exact ? h === alias : h.includes(alias))),
      );
      if (index !== -1) {
        mapping[field] = index;
        used.add(index);
      }
    }
  }
  return mapping;
}

/** DD.MM.YYYY, DD.MM.YY, DD/MM/YYYY or YYYY-MM-DD → YYYY-MM-DD; null if unreadable. */
export function parseDate(value: string): string | null {
  const v = value.trim();
  let y: number, m: number, d: number;
  const iso = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const de = v.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})$/);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (de) [d, m, y] = [Number(de[1]), Number(de[2]), Number(de[3])];
  else return null;
  if (y < 100) y += 2000;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/** Free-text status from a spreadsheet → a tracker status. Empty or unknown means "applied". */
export function parseStatus(value: string): JobStatus {
  const v = normalize(value);
  if (!v) return "applied";
  for (const [status, words] of STATUS_WORDS) {
    if (words.some((w) => v.includes(w))) return status;
  }
  return "applied";
}

export function parseApplicationsCsv(text: string): ImportResult {
  const clean = text.replace(/^﻿/, "");
  const rows = parseCsv(clean, detectSeparator(clean)).filter((r) => r.some((f) => f.trim()));
  if (rows.length < 2) return { error: "The file has no data rows below the header." };

  const headers = rows[0].map((h) => h.trim());
  const mapping = mapHeaders(headers);
  if (mapping.title === undefined || mapping.company === undefined) {
    return {
      error: `Couldn't find a job title and an employer column. Found: ${headers.join(", ")}`,
    };
  }

  const cell = (row: string[], field: Field) => {
    const index = mapping[field];
    return index === undefined ? "" : (row[index] ?? "").trim();
  };

  const parsed = rows.slice(1).map((row, i): ImportRow => {
    const line = i + 2; // 1-based, after the header
    const rawDate = cell(row, "applied_at");
    const date = rawDate ? parseDate(rawDate) : null;
    if (rawDate && !date)
      return { line, ok: false, error: `Unreadable date “${rawDate}”`, raw: row };

    const result = validateApplication({
      title: cell(row, "title"),
      company: cell(row, "company"),
      status: parseStatus(cell(row, "status")),
      applied_at: date,
      url: cell(row, "url"),
      salary: cell(row, "salary"),
    });
    return result.ok
      ? { line, ok: true, value: result.value }
      : { line, ok: false, error: result.error, raw: row };
  });

  const columns = (Object.keys(mapping) as Field[]).map(
    (field) => `${headers[mapping[field] as number]} → ${FIELD_LABELS[field]}`,
  );
  return { rows: parsed, columns };
}

/**
 * A ready-to-fill CSV for the import: German headers, ";" separators and a BOM
 * so Excel opens it with columns and umlauts intact. The example row shows the
 * formats — delete it before importing.
 */
export const CSV_TEMPLATE =
  "\uFEFF" +
  [
    "Bewerbungsdatum;Titel der Stellenanzeige;Arbeitgeber;Status;Link;Gehalt",
    "01.09.2026;Frontend Developer (m/w/d);Beispiel GmbH;Beworben;https://example.com/stellenanzeige;55–60k",
  ].join("\r\n") +
  "\r\n";
