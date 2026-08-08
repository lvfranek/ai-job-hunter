import { NextRequest, NextResponse } from "next/server";
import { supabase, CURRENT_USER_ID } from "@/lib/supabase";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("preferences")
      .select("*")
      .eq("user_id", CURRENT_USER_ID)
      .single();

    if (error && error.code !== "PGRST116") throw error;

    const defaultPreferences = {
      target_titles: [],
      title_strictness: 5,
      target_skills_frontend: [],
      skills_frontend_strictness: 5,
      target_skills_backend: [],
      skills_backend_strictness: 5,
      target_skills_tools: [],
      skills_tools_strictness: 5,
      target_skills_other: [],
      skills_other_strictness: 5,
      preferred_seniority: 5,
      preferred_location: "",
      job_type: [],
      company_size: [],
      excluded_keywords: [],
    };

    return NextResponse.json(data || defaultPreferences);
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
      .from("preferences")
      .upsert({ user_id: CURRENT_USER_ID, ...body }, { onConflict: "user_id" })
      .select();

    if (error) throw error;

    await supabase
      .from("job_matches")
      .update({ stale_at: new Date().toISOString() })
      .eq("user_id", CURRENT_USER_ID);

    return NextResponse.json(data[0]);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : (error as { message?: string })?.message;
    return NextResponse.json({ error: message || String(error) }, { status: 500 });
  }
}
