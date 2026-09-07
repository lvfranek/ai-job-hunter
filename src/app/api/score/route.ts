import { NextRequest, NextResponse, after } from "next/server";
import { getSupabaseServerClient, CURRENT_USER_ID } from "@/lib/supabase";
import { isDemoRequest } from "@/lib/auth";
import {
  failStaleScoreRuns,
  getJobsNeedingScoring,
  runScorePipeline,
} from "@/lib/pipeline/run-score";

// Let the scoring run keep going after the response is sent. On a Node.js server
// this just runs; on serverless, `after` extends the invocation via waitUntil so
// the run isn't frozen mid-flight the moment we respond (which is what left runs
// stuck at one chunk). Platforms cap this; a cutoff now degrades gracefully —
// the stale-run reaper fails the row and the user resumes with one more click.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  // Belt-and-suspenders: the proxy already rewrites demo traffic to /api/demo.
  if (isDemoRequest(request)) {
    return NextResponse.json({ error: "Not available in demo" }, { status: 403 });
  }

  const supabase = getSupabaseServerClient();

  // Clear out any zombie run (dead worker) so it can't linger as 'running'.
  await failStaleScoreRuns(supabase);

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

  after(async () => {
    try {
      await runScorePipeline(runData.id, needsScoring, preferences);
    } catch (err) {
      console.error("Score pipeline failed:", err);
    }
  });

  return NextResponse.json({ runId: runData.id });
}
