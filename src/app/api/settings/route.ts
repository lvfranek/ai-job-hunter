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
      target_titles: [],
      target_skills: [],
      job_level: "senior",
      max_posting_age_days: 30,
      results_per_scan: 100,
      portal_toggles: {
        indeed: true,
        linkedin: true,
        xing: true,
        stepstone: true,
        arbeitsagentur: true,
      },
      preferred_gemini_model: "mistralai/mistral-nemo",
    };

    return NextResponse.json(data || defaultSettings);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
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
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
