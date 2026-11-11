import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient, CURRENT_USER_ID } from "@/lib/supabase";
import { loadSearchPlan } from "@/lib/pipeline/search-plan";

export async function GET() {
  const supabase = getSupabaseServerClient();
  try {
    const { data, error } = await supabase
      .from("settings")
      .select("*")
      .eq("user_id", CURRENT_USER_ID)
      .single();

    if (error && error.code !== "PGRST116") throw error;

    const defaultSettings = {
      scraper_search_keywords: [],
      scraper_max_posting_age_days: 30,
      scraper_results_per_scan: 25,
      portal_toggles: {
        indeed: true,
        linkedin: true,
        xing: true,
        stepstone: true,
        arbeitsagentur: true,
      },
      notification_min_chance: "good",
    };

    // Derived, not stored — never expose the webhook URL itself to the client.
    // Where to search is set on the preferences page; shown here read-only.
    return NextResponse.json({
      ...(data || defaultSettings),
      webhook_configured: Boolean(process.env.NOTIFICATION_WEBHOOK_URL),
      search_plan: await loadSearchPlan(supabase),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : (error as { message?: string })?.message;
    return NextResponse.json({ error: message || String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  try {
    // Derived fields from GET, and columns that no longer exist, never reach the table.
    const body = await request.json();
    for (const key of ["webhook_configured", "search_plan", "remote_only", "scraper_location"]) {
      delete body[key];
    }
    const { data, error } = await supabase
      .from("settings")
      .upsert({ ...body, user_id: CURRENT_USER_ID }, { onConflict: "user_id" })
      .select();

    if (error) throw error;

    return NextResponse.json(data[0]);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : (error as { message?: string })?.message;
    return NextResponse.json({ error: message || String(error) }, { status: 500 });
  }
}
