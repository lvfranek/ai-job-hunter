import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient, CURRENT_USER_ID } from "@/lib/supabase";
import { generateCoverLetterBody, type CoverLetterLanguage } from "@/lib/agents/agent-4";
import { generateCoverLetterDocx } from "@/lib/generate-coverletter";
import type { DbJob, Profile } from "@/lib/types";

function sanitizeFilenamePart(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "").trim();
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const jobId = body.jobId as string | undefined;
  const language: CoverLetterLanguage = body.language === "en" ? "en" : "de";

  if (!jobId) {
    return NextResponse.json({ error: "No job ID provided" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const [{ data: job }, { data: profile }] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", jobId).eq("user_id", CURRENT_USER_ID).single(),
    supabase.from("profiles").select("*").eq("user_id", CURRENT_USER_ID).single(),
  ]);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (!profile) {
    return NextResponse.json(
      { error: "Complete your Cover Letter Profile first" },
      { status: 400 }
    );
  }

  try {
    const bodyParagraphs = await generateCoverLetterBody(
      profile as Profile,
      job as DbJob,
      language
    );
    const docxBuffer = await generateCoverLetterDocx(
      profile as Profile,
      job as DbJob,
      bodyParagraphs,
      language
    );

    const filename = `${language === "de" ? "Anschreiben" : "Cover Letter"} ${sanitizeFilenamePart(
      job.company
    )}.docx`;

    return new NextResponse(new Uint8Array(docxBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
