import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { failStaleScoreRuns } from "@/lib/pipeline/run-score";

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId) {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  // Reap dead runs first so a stalled worker surfaces as 'failed' here rather
  // than leaving the client polling 'running' indefinitely.
  const reaped = await failStaleScoreRuns(supabase);

  const { data, error } = await supabase
    .from("score_runs")
    .select("*")
    .eq("id", runId)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const stalled = reaped.includes(data.id);

  // The raw errors map is keyed by chunk index and holds full stack-ish strings.
  // The UI only needs "what went wrong, how often", so collapse it here.
  const errorSummary = Object.values(
    (data.errors ?? {}) as Record<string, string>
  ).reduce<Record<string, number>>((acc, message) => {
    const key = String(message).slice(0, 160);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    runId: data.id,
    status: data.status,
    total: data.total,
    scored: data.scored,
    failed: data.failed ?? 0,
    totalChunks: data.total_chunks ?? 0,
    completedChunks: data.completed_chunks ?? 0,
    model: data.model ?? null,
    errorSummary,
    stalled,
    completedAt: data.ended_at,
  });
}
