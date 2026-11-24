import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient, CURRENT_USER_ID } from "@/lib/supabase";
import { isDemoRequest } from "@/lib/auth";
import { writeCoverLetter, type CoverLetterLanguage } from "@/lib/ai/cover-letter-writer";
import { generateCoverLetterDocx } from "@/lib/generate-coverletter";
import type { DbJob, JobMatch, Profile } from "@/lib/types";

// Writing plus checking takes 2 AI calls, and up to 6 when the letter is rewritten.
export const maxDuration = 120;

function sanitizeFilenamePart(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "").trim();
}

export async function POST(request: NextRequest) {
  if (isDemoRequest(request)) {
    return NextResponse.json({ error: "Not available in demo" }, { status: 403 });
  }

  const body = await request.json();
  const jobId = body.jobId as string | undefined;
  const language: CoverLetterLanguage = body.language === "en" ? "en" : "de";

  if (!jobId) {
    return NextResponse.json({ error: "No job ID provided" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const [{ data: job }, { data: profile }, { data: preferences }] = await Promise.all([
    supabase
      .from("jobs")
      .select("*, job_matches(requirements)")
      .eq("id", jobId)
      .eq("user_id", CURRENT_USER_ID)
      .single(),
    supabase.from("profiles").select("*").eq("user_id", CURRENT_USER_ID).single(),
    supabase
      .from("preferences")
      .select("own_skills, basic_skills, spoken_languages")
      .eq("user_id", CURRENT_USER_ID)
      .maybeSingle(),
  ]);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (!profile) {
    return NextResponse.json(
      { error: "Complete your Cover Letter Profile first" },
      { status: 400 },
    );
  }

  try {
    const match = job.job_matches as Pick<JobMatch, "requirements"> | null;
    const letter = await writeCoverLetter({
      profile: profile as Profile,
      job: job as DbJob,
      language,
      met: match?.requirements ?? [],
      skills: {
        strong: preferences?.own_skills ?? "",
        basics: preferences?.basic_skills ?? "",
        languages: preferences?.spoken_languages ?? "",
      },
    });
    if (letter.problems.length > 0) {
      console.warn(`Cover letter for job ${jobId} still has problems:`, letter.problems);
    }
    const docxBuffer = await generateCoverLetterDocx(
      profile as Profile,
      job as DbJob,
      letter.paragraphs,
      language,
    );

    const filename = `${language === "de" ? "Anschreiben" : "Cover Letter"} ${sanitizeFilenamePart(
      job.company,
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
