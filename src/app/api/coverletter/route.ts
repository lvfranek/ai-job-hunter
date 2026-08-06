import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId } = body;

    if (!jobId) {
      return NextResponse.json({ error: "No job ID provided" }, { status: 400 });
    }

    // TODO: Generate cover letter with Gemini based on job + profile (Phase 2+)

    return NextResponse.json({ message: "Cover letter generation initiated" });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
