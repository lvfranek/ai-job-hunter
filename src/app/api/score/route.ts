import { NextResponse } from "next/server";
import { getSupabaseServerClient, CURRENT_USER_ID } from "@/lib/supabase";
import { CHUNK_SIZE, chunk, scoreChunk } from "@/lib/agents/agent-3";
import type { DbJob, Preferences } from "@/lib/types";

// Run this many chunks concurrently — cuts wall-clock time roughly proportionally
// (5 sequential chunks at ~60s each was a 5-minute wait; 3 at a time is ~2 rounds)
// without hammering the AI provider's rate limits.
const CONCURRENCY = 3;

// Scores jobs that have never been scored AND jobs whose score went stale
// (preferences changed since) — one action, "keep my scores current", instead
// of two separate buttons for what the user experiences as the same thing.
export async function POST() {
  const supabase = getSupabaseServerClient();

  const [{ data: preferences }, { data: jobs }] = await Promise.all([
    supabase.from("preferences").select("*").eq("user_id", CURRENT_USER_ID).single(),
    supabase
      .from("jobs")
      .select("*, job_matches(id, stale_at)")
      .eq("user_id", CURRENT_USER_ID)
      .is("deleted_at", null),
  ]);

  if (!preferences) {
    return NextResponse.json({ error: "Complete your preferences first" }, { status: 400 });
  }

  type JobWithMatchInfo = DbJob & { job_matches: { id: string; stale_at: string | null } | null };
  const needsScoring = ((jobs ?? []) as JobWithMatchInfo[]).filter(
    (job) => job.job_matches === null || job.job_matches.stale_at !== null
  );

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
  runScorePipeline(runData.id, needsScoring, preferences as Preferences).catch((err) =>
    console.error("Score pipeline failed:", err)
  );

  return NextResponse.json({ runId: runData.id });
}

async function runScorePipeline(runId: string, jobs: DbJob[], preferences: Preferences) {
  const supabase = getSupabaseServerClient();
  const chunks = chunk(jobs, CHUNK_SIZE);
  const errors: Record<string, string> = {};
  let scored = 0;

  try {
    for (let i = 0; i < chunks.length; i += CONCURRENCY) {
      // Cooperative cancellation: check between rounds rather than mid-flight —
      // chunks already launched still finish, but no new ones start.
      const { data: current } = await supabase
        .from("score_runs")
        .select("status")
        .eq("id", runId)
        .single();
      if (current?.status === "cancelled") return;

      const round = chunks.slice(i, i + CONCURRENCY);
      await Promise.all(
        round.map(async (jobChunk, idx) => {
          try {
            const results = await scoreChunk(jobChunk, preferences);
            const { error } = await supabase
              .from("job_matches")
              .upsert(
                results.map((r) => ({ ...r, user_id: CURRENT_USER_ID, stale_at: null })),
                { onConflict: "job_id" }
              );
            if (error) throw error;
          } catch (error) {
            console.error(`Scoring chunk failed:`, error);
            errors[`chunk_${i + idx}`] = String(error);
          } finally {
            // Count the chunk as processed either way so progress still reaches
            // 100% and the run finishes instead of hanging on a failed chunk.
            scored += jobChunk.length;
            await supabase.from("score_runs").update({ scored }).eq("id", runId);
          }
        })
      );
    }

    await supabase
      .from("score_runs")
      .update({
        status: "completed",
        ended_at: new Date().toISOString(),
        errors: Object.keys(errors).length > 0 ? errors : null,
      })
      .eq("id", runId);
  } catch (error) {
    await supabase
      .from("score_runs")
      .update({
        status: "failed",
        ended_at: new Date().toISOString(),
        errors: { message: String(error) },
      })
      .eq("id", runId);
  }
}
