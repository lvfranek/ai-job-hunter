import {
  AlignmentType,
  Document,
  Header,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import type { DbJob, Profile } from "@/lib/types";
import type { CoverLetterLanguage } from "@/lib/agents/agent-4";

const FONT = "Calibri";
const SIZE = 24; // 12pt, in half-points (docx unit)
const NAME_SIZE = 32; // 16pt for the header name — kept modest so the header stays compact

// Grayscale palette from the reference letterhead.
const ACCENT_COLOR = "262626";
const BANNER_COLOR = "000000";
const TEXT_ON_DARK = "FFFFFF";

const COPY: Record<CoverLetterLanguage, { subject: (title: string) => string; greeting: string; closing: string }> = {
  de: {
    subject: (title) => `Bewerbung als ${title}, ab sofort`,
    greeting: "Sehr geehrte Damen und Herren,",
    closing: "Beste Grüße,",
  },
  en: {
    subject: (title) => `Application as ${title}, immediately available`,
    greeting: "Dear Sir or Madam,",
    closing: "Best regards,",
  },
};

// "22765 Hamburg" -> "Hamburg" for the "[City], [Date]" header line.
function cityOnly(location: string | null): string {
  if (!location) return "";
  return location.replace(/^\d+\s*/, "").split(",")[0].trim();
}

function formatDate(language: CoverLetterLanguage): string {
  const locale = language === "de" ? "de-DE" : "en-US";
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date()
  );
}

function run(text: string, extra: { bold?: boolean; size?: number; color?: string } = {}): TextRun {
  return new TextRun({ text, font: FONT, size: SIZE, ...extra });
}

// spacingAfter is a deliberate, tight substitute for a full blank paragraph
// (business-letter "space after" instead of an extra 12pt line) — used only
// where the letter's exact blank-line count isn't dictated by the template.
function paragraph(
  text: string,
  opts: {
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
    bold?: boolean;
    spacingAfter?: number;
  } = {}
): Paragraph {
  return new Paragraph({
    alignment: opts.alignment,
    spacing: opts.spacingAfter != null ? { after: opts.spacingAfter } : undefined,
    children: [run(text, { bold: opts.bold })],
  });
}

const BLANK = new Paragraph({ children: [run("")] });

// True Word header (not a body table) so it doesn't eat into the 1-page body budget
// and repeats correctly if Word ever re-flows the letter across pages.
function buildHeader(name: string): Header {
  const banner = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 6, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, fill: ACCENT_COLOR },
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            children: [new Paragraph({ text: "" })],
          }),
          new TableCell({
            width: { size: 94, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, fill: BANNER_COLOR },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 150, bottom: 150, left: 200, right: 300 },
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [run(name, { bold: true, size: NAME_SIZE, color: TEXT_ON_DARK })],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  return new Header({ children: [banner] });
}

/** Build the fixed-format cover letter DOCX. The AI only supplies the 4 body paragraphs. */
export async function generateCoverLetterDocx(
  profile: Profile,
  job: DbJob,
  bodyParagraphs: string[],
  language: CoverLetterLanguage
): Promise<Buffer> {
  const copy = COPY[language];
  const city = cityOnly(profile.location);
  const dateLine = [city, formatDate(language)].filter(Boolean).join(", ");

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: FONT, size: SIZE },
          paragraph: { spacing: { after: 0, line: 264 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 600, bottom: 600, left: 1000, right: 1000, header: 300 } },
        },
        headers: { default: buildHeader(profile.name ?? "") },
        children: [
          paragraph(profile.street_address ?? "", { alignment: AlignmentType.RIGHT }),
          paragraph(profile.location ?? "", { alignment: AlignmentType.RIGHT }),
          paragraph(profile.phone ? `Tel: ${profile.phone}` : "", { alignment: AlignmentType.RIGHT }),
          paragraph(profile.email ?? "", { alignment: AlignmentType.RIGHT }),
          BLANK,
          BLANK,
          BLANK,
          paragraph(job.company),
          BLANK, // placeholder line: company street (not available from the scraped job)
          BLANK, // placeholder line: company ZIP + city (not available from the scraped job)
          BLANK,
          paragraph(dateLine, { alignment: AlignmentType.RIGHT }),
          BLANK,
          paragraph(copy.subject(job.title), { bold: true, spacingAfter: 200 }),
          paragraph(copy.greeting, { spacingAfter: 200 }),
          ...bodyParagraphs.map((p) => paragraph(p, { spacingAfter: 200 })),
          paragraph(copy.closing),
          paragraph(profile.name ?? ""),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
