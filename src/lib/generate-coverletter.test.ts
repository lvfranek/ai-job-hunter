import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateCoverLetterDocx } from "./generate-coverletter";
import type { DbJob, Profile } from "./types";

const profile: Profile = {
  id: "p",
  user_id: "u",
  name: "Max Mustermann",
  email: "max@example.com",
  phone: "+49 170 1234567",
  date_of_birth: null,
  languages: [],
  location: "22765 Hamburg",
  street_address: "Musterstraße 12",
  cv_text: null,
  current_situation: null,
  skills_frontend: [],
  skills_backend: [],
  skills_devops: [],
  skills_tools: [],
  personal_story: "story",
  key_achievements: ["Shipped X", "Grew Y"],
  motivation: "motivation",
  created_at: "",
  updated_at: "",
};

const job: DbJob = {
  id: "j",
  user_id: "u",
  url: "https://example.com/job",
  title: "Junior Frontend Developer",
  company: "Acme GmbH",
  description: "desc",
  platform: "indeed",
  status: null,
  posted_date: null,
  created_at: "",
  deleted_at: null,
};

function readZipEntry(buffer: Buffer, entry: string): string {
  const dir = mkdtempSync(join(tmpdir(), "coverletter-test-"));
  const docxPath = join(dir, "test.docx");
  writeFileSync(docxPath, buffer);
  return execFileSync("unzip", ["-p", docxPath, entry], { encoding: "utf-8" });
}

describe("generateCoverLetterDocx", () => {
  it("produces a real, non-trivial .docx (zip) file", async () => {
    const buffer = await generateCoverLetterDocx(
      profile,
      job,
      ["Paragraph one.", "Paragraph two.", "Paragraph three.", "Paragraph four."],
      "de",
    );

    // .docx is a zip archive — starts with the "PK" magic bytes.
    expect(buffer.subarray(0, 2).toString("ascii")).toBe("PK");
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it("uses Calibri throughout and right-aligns the address/date block", async () => {
    const buffer = await generateCoverLetterDocx(
      profile,
      job,
      ["Paragraph one.", "Paragraph two.", "Paragraph three.", "Paragraph four."],
      "de",
    );
    const documentXml = readZipEntry(buffer, "word/document.xml");

    expect(documentXml).toContain('w:ascii="Calibri"');
    expect(documentXml).toContain('w:val="right"');
  });

  it("puts the name banner in the real Word header as white text on the accent bar", async () => {
    const buffer = await generateCoverLetterDocx(
      profile,
      job,
      ["Paragraph one.", "Paragraph two.", "Paragraph three.", "Paragraph four."],
      "de",
    );
    const headerXml = readZipEntry(buffer, "word/header1.xml");

    expect(headerXml).toContain("Max Mustermann");
    expect(headerXml).toContain("FFFFFF");
    expect(headerXml).toContain('w:fill="262626"');
  });

  it("also generates a valid docx for the English variant", async () => {
    const englishBuffer = await generateCoverLetterDocx(profile, job, ["Hi."], "en");
    expect(englishBuffer.subarray(0, 2).toString("ascii")).toBe("PK");
  });
});
