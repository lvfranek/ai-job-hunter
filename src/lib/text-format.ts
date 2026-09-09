// Turning scraped job postings into readable text.
//
// The job boards hand us HTML (LinkedIn `descriptionHtml`, Xing `description_html`,
// Stepstone `textSections[].content`). The old approach flattened it with
// `replace(/\s+/g, " ")`, which turned every posting into one unreadable wall of
// text — 68% of stored jobs had literally zero line breaks.
//
// We convert to a deliberately tiny Markdown subset (## headings, **bold**,
// - bullets, blank-line paragraphs) rather than keeping HTML: the content comes
// from third parties, so rendering it as HTML would mean an XSS surface. The
// renderer in JobDescription.tsx understands exactly this subset.

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  euro: "€",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

/**
 * Collapse horizontal whitespace while KEEPING line structure — the opposite of
 * the old `\s+ -> " "`, which is what destroyed every posting's formatting.
 * Runs of blank lines are capped at one so portals that pad with empty
 * paragraphs don't produce huge gaps.
 */
export function normalizeBlockText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ") // any horizontal whitespace (incl. nbsp) -> one space
    .replace(/[^\S\n]*\n[^\S\n]*/g, "\n") // no trailing/leading spaces around breaks
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Convert a job posting's HTML into the Markdown subset the UI renders.
 * Never throws: unbalanced or tag-free input is passed through as plain text.
 */
export function htmlToMarkdown(html: string | null | undefined): string {
  if (!html) return "";
  let out = html;

  // Drop these outright, contents included — they are never posting text.
  out = out.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "");

  // Strip literal "**" from the source BEFORE we introduce our own bold markers.
  // LinkedIn postings carry copy-paste artefacts like "**<strong>PartSpace</strong>"
  // which would otherwise pair up with ours and invert the emphasis. Single
  // asterisks are left alone ("m/w/d*").
  out = out.replace(/\*{2,}/g, "");

  // Inline emphasis first, so the text inside keeps its markers once tags go.
  out = out.replace(/<\/?(?:strong|b)\b[^>]*>/gi, "**");
  out = out.replace(/<\/?(?:em|i)\b[^>]*>/gi, "*");

  // Block structure -> line breaks. Tag matching is case-insensitive on purpose:
  // Xing sends uppercase tags (<DIV>, <H2>, <P>).
  out = out.replace(/<br\s*\/?>/gi, "\n");
  out = out.replace(/<li\b[^>]*>/gi, "\n- ");
  out = out.replace(/<\/li\s*>/gi, "");
  out = out.replace(/<h[1-6]\b[^>]*>/gi, "\n\n## ");
  out = out.replace(/<\/(?:p|div|h[1-6]|ul|ol|tr|table|section)\s*>/gi, "\n\n");
  out = out.replace(/<(?:p|div|ul|ol|tr|table|section)\b[^>]*>/gi, "\n\n");

  // Anything left (span, a, font, …) is removed WITHOUT a separating space, or
  // "<strong>Senior</strong>Engineer" would come apart into word fragments.
  out = out.replace(/<[^>]*>/g, "");

  out = decodeEntities(out);

  // Emphasis markers that ended up wrapping nothing, e.g. an empty <strong> or a
  // <strong> whose content was a block tag we just turned into a newline.
  out = out.replace(/\*\*[^\S\n]*\*\*/g, "");
  // A heading whose text was bold reads "## **Titel**" — the heading already
  // carries the emphasis.
  out = out.replace(/^(##[^\S\n]*)\*\*(.*?)\*\*[^\S\n]*$/gm, "$1$2");

  return normalizeBlockText(out);
}

/**
 * Marker-free, case-insensitive form of a Markdown block — for comparing two
 * renderings of the same text (e.g. a plain-text teaser against the formatted
 * section it repeats, where only one side carries ** and ## markers).
 */
export function markdownFingerprint(text: string): string {
  return text
    .replace(/\*+/g, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^-\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
