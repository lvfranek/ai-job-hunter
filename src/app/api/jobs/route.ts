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

// Bulk-prune old job posts: soft-deletes every non-deleted job whose effective
// posted date (posted_date, falling back to created_at) is older than
// `olderThanDays` days. Returns the number of jobs removed.
export async function DELETE(request: NextRequest) {
  try {
    const olderThanDays = Number(request.nextUrl.searchParams.get("olderThanDays"));
    if (!Number.isInteger(olderThanDays) || olderThanDays < 1) {
      return NextResponse.json(
        { error: "olderThanDays must be a positive integer" },
        { status: 400 }
      );
    }

    const cutoff = new Date(Date.now() - olderThanDays * 86400000).toISOString();

    const { data, error } = await supabase
      .from("jobs")
      .update({ deleted_at: new Date().toISOString() })
      .eq("user_id", CURRENT_USER_ID)
      .is("deleted_at", null)
      .or(`posted_date.lt.${cutoff},and(posted_date.is.null,created_at.lt.${cutoff})`)
      .select("id");

    if (error) throw error;
    return NextResponse.json({ deleted: data?.length ?? 0 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
