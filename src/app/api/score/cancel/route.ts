import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

// Cooperative cancel: flips the run's status so the background pipeline stops
// launching new chunks at its next check. Chunks already in flight still finish
// and their results are kept — there's no way to abort an in-progress AI call.
export async function POST(request: NextRequest) {
  const { runId } = await request.json();
  if (!runId) {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("score_runs")
    .update({ status: "cancelled", ended_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("status", "running");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ cancelled: true });
}
