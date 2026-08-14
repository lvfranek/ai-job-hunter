import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

async function main() {
  const buffer = await generateCoverLetterDocx(
    profile,
    job,
    ["Paragraph one.", "Paragraph two.", "Paragraph three.", "Paragraph four."],
    "de"
  );

  // .docx is a zip archive — starts with the "PK" magic bytes.
  assert.strictEqual(buffer.subarray(0, 2).toString("ascii"), "PK");
  assert.ok(buffer.length > 1000, "docx buffer should be a real, non-trivial file");

  const dir = mkdtempSync(join(tmpdir(), "coverletter-test-"));
  const docxPath = join(dir, "test.docx");
  writeFileSync(docxPath, buffer);
  const documentXml = execFileSync("unzip", ["-p", docxPath, "word/document.xml"], {
    encoding: "utf-8",
  });
  const headerXml = execFileSync("unzip", ["-p", docxPath, "word/header1.xml"], {
    encoding: "utf-8",
  });
  assert.ok(documentXml.includes('w:ascii="Calibri"'), "should use Calibri throughout");
  assert.ok(documentXml.includes('w:val="right"'), "address/date block should be right-aligned");
  assert.ok(headerXml.includes("Max Mustermann"), "name banner should live in the real Word header");
  assert.ok(headerXml.includes("FFFFFF"), "banner name should be white text");
  assert.ok(headerXml.includes(`w:fill="${"262626"}"`), "accent bar should use the grayscale palette");

  const englishBuffer = await generateCoverLetterDocx(profile, job, ["Hi."], "en");
  assert.strictEqual(englishBuffer.subarray(0, 2).toString("ascii"), "PK");

  console.log("generate-coverletter.test.ts: all assertions passed");
}

main();
