import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient, CURRENT_USER_ID } from "@/lib/supabase";
import { APPLIED_STATUSES, MANUAL_PLATFORM } from "@/lib/mock-data";

export async function GET() {
  const supabase = getSupabaseServerClient();
  try {
    const { data, error } = await supabase
      .from("jobs")
      .select(`*, job_matches (*)`)
      .eq("user_id", CURRENT_USER_ID)
      .is("deleted_at", null)
      // Manual applications live on /applications only, never in the match feed.
      .neq("platform", MANUAL_PLATFORM)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  try {
    const body = await request.json();
    const { data, error } = await supabase
      .from("jobs")
      .insert({ ...body, user_id: CURRENT_USER_ID })
      .select();

    if (error) throw error;
    return NextResponse.json(data[0]);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// Bulk-prune old job posts: soft-deletes every non-deleted job whose effective
// posted date (posted_date, falling back to created_at) is older than
// `olderThanDays` days. Returns the number of jobs removed. Jobs you applied to
// and manual applications are never pruned — they belong to the tracker.
export async function DELETE(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  try {
    const olderThanDays = Number(request.nextUrl.searchParams.get("olderThanDays"));
    if (!Number.isInteger(olderThanDays) || olderThanDays < 1) {
      return NextResponse.json(
        { error: "olderThanDays must be a positive integer" },
        { status: 400 },
      );
    }

    const cutoff = new Date(Date.now() - olderThanDays * 86400000).toISOString();

    const { data, error } = await supabase
      .from("jobs")
      .update({ deleted_at: new Date().toISOString() })
      .eq("user_id", CURRENT_USER_ID)
      .is("deleted_at", null)
      .neq("platform", MANUAL_PLATFORM)
      .or(`status.is.null,status.not.in.(${APPLIED_STATUSES.join(",")})`)
      .or(`posted_date.lt.${cutoff},and(posted_date.is.null,created_at.lt.${cutoff})`)
      .select("id");

    if (error) throw error;
    return NextResponse.json({ deleted: data?.length ?? 0 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
