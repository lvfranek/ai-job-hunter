import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

export async function extractCvText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());

  if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return result.text;
  }

  if (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.name.endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (file.type === "text/plain" || file.name.endsWith(".txt")) {
    return buffer.toString("utf-8");
  }

  throw new Error(`Unsupported file type: ${file.type || file.name}`);
}

const MAX_CV_SIZE = 10 * 1024 * 1024;
const ALLOWED_CV_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

/**
 * The text of a CV uploaded as multipart "file", or the problem with it as a
 * message for the user. Shared by every route that reads a CV.
 */
export async function readCvUpload(
  request: Request,
): Promise<{ text: string } | { error: string; status: number }> {
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "No file provided", status: 400 };
  if (file.size > MAX_CV_SIZE) return { error: "File too large (max 10MB)", status: 400 };
  const allowed = ALLOWED_CV_TYPES.includes(file.type) || /\.(pdf|docx|txt)$/i.test(file.name);
  if (!allowed) return { error: "Unsupported file type", status: 400 };
  return { text: await extractCvText(file) };
}
