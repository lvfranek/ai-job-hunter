import { NextResponse } from "next/server";
import { getSupabaseServerClient, CURRENT_USER_ID } from "@/lib/supabase";
import { scoreJobsBatch } from "@/lib/agents/agent-3";
import type { DbJob, Preferences } from "@/lib/types";

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

  try {
    const results = await scoreJobsBatch(needsScoring, preferences as Preferences);

    const { error } = await supabase
      .from("job_matches")
      .upsert(
        results.map((r) => ({ ...r, user_id: CURRENT_USER_ID, stale_at: null })),
        { onConflict: "job_id" }
      );
    if (error) throw error;

    return NextResponse.json({ jobsScored: results.length });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : (error as { message?: string })?.message;
    return NextResponse.json({ error: message || String(error) }, { status: 500 });
  }
}
