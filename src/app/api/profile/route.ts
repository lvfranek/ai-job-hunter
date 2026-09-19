import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient, CURRENT_USER_ID } from "@/lib/supabase";

export async function GET() {
  const supabase = getSupabaseServerClient();
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", CURRENT_USER_ID)
      .single();

    if (error && error.code !== "PGRST116") throw error;

    return NextResponse.json(data || null);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  try {
    const body = await request.json();
    const { data, error } = await supabase
      .from("profiles")
      .upsert({ ...body, user_id: CURRENT_USER_ID }, { onConflict: "user_id" })
      .select();

    if (error) throw error;
    return NextResponse.json(data[0]);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
