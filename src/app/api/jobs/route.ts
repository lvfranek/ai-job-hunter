import { NextRequest, NextResponse } from "next/server";
import { supabase, CURRENT_USER_ID } from "@/lib/supabase";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("jobs")
      .select(`*, job_matches (*)`)
      .eq("user_id", CURRENT_USER_ID)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { data, error } = await supabase
      .from("jobs")
      .insert({ user_id: CURRENT_USER_ID, ...body })
      .select();

    if (error) throw error;
    return NextResponse.json(data[0]);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
