import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobIds } = body;

    if (!jobIds || jobIds.length === 0) {
      return NextResponse.json({ error: "No job IDs provided" }, { status: 400 });
    }

    // TODO: Batch score jobs with Gemini (Phase 2+)

    return NextResponse.json({ message: "Scoring initiated" });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
