import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId) {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("scrape_runs")
    .select("*")
    .eq("id", runId)
    .single();

  if (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }

  return NextResponse.json({
    runId: data.id,
    status: data.status,
    jobsFound: data.total_scraped,
    jobsFiltered: data.passed_prefilter,
    jobsStored: data.scored,
    completedAt: data.ended_at,
  });
}
