import { NextRequest, NextResponse } from "next/server";
import { supabase, CURRENT_USER_ID } from "@/lib/supabase";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("settings")
      .select("*")
      .eq("user_id", CURRENT_USER_ID)
      .single();

    if (error && error.code !== "PGRST116") throw error;

    const defaultSettings = {
      scraper_search_keywords: [],
      scraper_location: "",
      scraper_max_posting_age_days: 30,
      scraper_results_per_scan: 100,
      remote_only: false,
      portal_toggles: {
        indeed: true,
        linkedin: true,
        xing: true,
        stepstone: true,
        arbeitsagentur: true,
      },
      notification_threshold: 75,
    };

    // Derived, not stored — never expose the webhook URL itself to the client.
    return NextResponse.json({
      ...(data || defaultSettings),
      webhook_configured: Boolean(process.env.NOTIFICATION_WEBHOOK_URL),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : (error as { message?: string })?.message;
    return NextResponse.json({ error: message || String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { data, error } = await supabase
      .from("settings")
      .upsert({ user_id: CURRENT_USER_ID, ...body }, { onConflict: "user_id" })
      .select();

    if (error) throw error;

    return NextResponse.json(data[0]);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : (error as { message?: string })?.message;
    return NextResponse.json({ error: message || String(error) }, { status: 500 });
  }
}
