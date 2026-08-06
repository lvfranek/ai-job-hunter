import { NextRequest, NextResponse } from "next/server";
import { extractCvText } from "@/lib/cv-parser";
import { parseProfileFromCV } from "@/lib/agents/agent-1";

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
  }

  const isAllowed =
    ALLOWED_TYPES.includes(file.type) || /\.(pdf|docx|txt)$/i.test(file.name);
  if (!isAllowed) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }

  try {
    const cvText = await extractCvText(file);
    const parsed = await parseProfileFromCV(cvText);
    return NextResponse.json({ ...parsed, cv_text: cvText });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
