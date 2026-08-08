import { NextResponse } from "next/server";
import { getSupabaseServerClient, CURRENT_USER_ID } from "@/lib/supabase";
import { scoreJobsBatch } from "@/lib/agents/agent-3";
import type { DbJob, Preferences } from "@/lib/types";

// Rough Haiku-class pricing estimate, shown to the user before/after a rescore.
const COST_PER_JOB = (500 / 1000) * 0.00025;

export async function POST() {
  const supabase = getSupabaseServerClient();

  const [{ data: preferences }, { data: jobs }] = await Promise.all([
    supabase.from("preferences").select("*").eq("user_id", CURRENT_USER_ID).single(),
    supabase.from("jobs").select("*").eq("user_id", CURRENT_USER_ID).is("deleted_at", null),
  ]);

  if (!preferences || !jobs?.length) {
    return NextResponse.json({ jobsRescored: 0, costEstimate: 0 });
  }

  try {
    const results = await scoreJobsBatch(jobs as DbJob[], preferences as Preferences);

    const { error } = await supabase
      .from("job_matches")
      .upsert(
        results.map((r) => ({ ...r, user_id: CURRENT_USER_ID, stale_at: null })),
        { onConflict: "job_id" }
      );
    if (error) throw error;

    return NextResponse.json({
      jobsRescored: results.length,
      costEstimate: results.length * COST_PER_JOB,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : (error as { message?: string })?.message;
    return NextResponse.json({ error: message || String(error) }, { status: 500 });
  }
}
