import { NextRequest, NextResponse } from "next/server";
import { withResolvedWorkLocations } from "@/lib/geo/api";
import { DEFAULT_PREFERENCES, normalizePreferences } from "@/lib/preferences";
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

    return NextResponse.json(data || DEFAULT_PREFERENCES);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : (error as { message?: string })?.message;
    return NextResponse.json({ error: message || String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  try {
    // Only known fields, numbers parsed — the upsert fails on anything else.
    const checked = await withResolvedWorkLocations(normalizePreferences(await request.json()));
    if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
    const { preferences } = checked;
    const { data, error } = await supabase
      .from("preferences")
      .upsert({ ...preferences, user_id: CURRENT_USER_ID }, { onConflict: "user_id" })
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
