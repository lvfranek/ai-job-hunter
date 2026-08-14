import { NextResponse } from "next/server";
import { getSupabaseServerClient, CURRENT_USER_ID } from "@/lib/supabase";
import { getJobsNeedingScoring, runScorePipeline } from "@/lib/pipeline/run-score";

export async function POST() {
  const supabase = getSupabaseServerClient();
  const { jobs: needsScoring, preferences } = await getJobsNeedingScoring(supabase);

  if (!preferences) {
    return NextResponse.json({ error: "Complete your preferences first" }, { status: 400 });
  }

  if (needsScoring.length === 0) {
    return NextResponse.json({ jobsScored: 0 });
  }

  const { data: runData, error: runError } = await supabase
    .from("score_runs")
    .insert({ user_id: CURRENT_USER_ID, status: "running", total: needsScoring.length })
    .select()
    .single();

  if (runError) {
    return NextResponse.json({ error: String(runError) }, { status: 500 });
  }

  // ponytail: fire-and-forget background run, same pattern as the scrape pipeline.
  runScorePipeline(runData.id, needsScoring, preferences).catch((err) =>
    console.error("Score pipeline failed:", err)
  );

  return NextResponse.json({ runId: runData.id });
}
