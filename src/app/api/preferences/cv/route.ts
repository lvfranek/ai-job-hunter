import { NextRequest, NextResponse } from "next/server";
import { isDemoRequest } from "@/lib/auth";
import { readCvUpload } from "@/lib/cv-parser";
import { parseSkillsFromCV } from "@/lib/agents/agent-1";

// Suggests skill chips from an uploaded CV. Nothing is stored: the page merges
// the suggestions into its chips, and only a save keeps them.
export async function POST(request: NextRequest) {
  if (isDemoRequest(request)) {
    return NextResponse.json({ error: "Not available in demo" }, { status: 403 });
  }

  try {
    const upload = await readCvUpload(request);
    if ("error" in upload) {
      return NextResponse.json({ error: upload.error }, { status: upload.status });
    }
    return NextResponse.json(await parseSkillsFromCV(upload.text));
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
