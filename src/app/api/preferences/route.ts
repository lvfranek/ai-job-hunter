import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient, CURRENT_USER_ID } from "@/lib/supabase";

export async function GET() {
  const supabase = getSupabaseServerClient();
  try {
    const { data, error } = await supabase
      .from("preferences")
      .select("*")
      .eq("user_id", CURRENT_USER_ID)
      .single();

    if (error && error.code !== "PGRST116") throw error;

    const defaultPreferences = {
      notes: "",
      preferred_location: "",
      job_type: [],
      excluded_employment_types: [],
      work_time_models: [],
      own_skills: "",
      preferred_languages: "",
      soft_skills_flexible: false,
    };

    return NextResponse.json(data || defaultPreferences);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : (error as { message?: string })?.message;
    return NextResponse.json({ error: message || String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  try {
    const body = await request.json();
    const { data, error } = await supabase
      .from("preferences")
      .upsert({ ...body, user_id: CURRENT_USER_ID }, { onConflict: "user_id" })
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
