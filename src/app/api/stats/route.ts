import { NextResponse } from "next/server";
import { getSupabaseServerClient, CURRENT_USER_ID, selectAll } from "@/lib/supabase";
import { MANUAL_PLATFORM } from "@/lib/mock-data";
import {
  computeStats,
  suggestKeywords,
  type StatsJob,
  type StatsJobKeyword,
  type StatsResponse,
  type StatsSearch,
} from "@/lib/keyword-stats";

type JobRow = {
  id: string;
  title: string;
  platform: string | null;
  status: string | null;
  job_matches: { match_score: number; blocker: string | null } | null;
};

type SearchRow = Omit<StatsSearch, "run_at"> & { scrape_runs: { started_at: string } | null };

// All-time statistics for the Statistics page. Deliberately includes pruned
// (soft-deleted) jobs — "all time" means everything ever scraped.
export async function GET() {
  const supabase = getSupabaseServerClient();
  try {
    // Without migration 028 the tracking tables don't exist yet: still show the
    // job-level numbers, and let the page say what's missing.
    const probe = await supabase.from("job_keywords").select("job_id").limit(1);
    const trackingReady = !probe.error;

    const [jobRows, jobKeywords, searchRows, settings, runCount] = await Promise.all([
      selectAll<JobRow>((from, to) =>
        supabase
          .from("jobs")
          .select("id, title, platform, status, job_matches(match_score, blocker)")
          .eq("user_id", CURRENT_USER_ID)
          .neq("platform", MANUAL_PLATFORM) // statistics are about what the scraper found
          .order("id")
          .range(from, to),
      ),
      trackingReady
        ? selectAll<StatsJobKeyword>((from, to) =>
            supabase
              .from("job_keywords")
              .select("job_id, keyword, discovered")
              .eq("user_id", CURRENT_USER_ID)
              .order("job_id")
              .order("keyword")
              .range(from, to),
          )
        : [],
      trackingReady
        ? selectAll<SearchRow>((from, to) =>
            supabase
              .from("scrape_searches")
              .select(
                "scrape_run_id, keyword, portal, returned, new_jobs, result_cap, error, scrape_runs(started_at)",
              )
              .eq("user_id", CURRENT_USER_ID)
              .order("id")
              .range(from, to),
          )
        : [],
      supabase
        .from("settings")
        .select("scraper_search_keywords")
        .eq("user_id", CURRENT_USER_ID)
        .maybeSingle(),
      supabase
        .from("scrape_runs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", CURRENT_USER_ID)
        .eq("status", "completed"),
    ]);

    const jobs: StatsJob[] = jobRows.map((row) => ({
      id: row.id,
      title: row.title,
      platform: row.platform ?? "unknown",
      status: row.status,
      score: row.job_matches?.match_score ?? null,
      blocker: row.job_matches?.blocker ?? null,
    }));
    const searches: StatsSearch[] = searchRows.flatMap(({ scrape_runs, ...search }) =>
      scrape_runs ? [{ ...search, run_at: scrape_runs.started_at }] : [],
    );

    const stats = computeStats({
      jobs,
      jobKeywords,
      searches,
      activeKeywords: (settings.data?.scraper_search_keywords as string[] | null) ?? [],
      scrapeRuns: runCount.count ?? 0,
    });

    const body: StatsResponse = {
      ...stats,
      trackingReady,
      suggestions: suggestKeywords(
        jobs,
        stats.keywords.map((k) => k.keyword),
      ),
    };
    return NextResponse.json(body);
  } catch (error) {
    console.error("Loading statistics failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
