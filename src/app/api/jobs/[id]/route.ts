import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient, CURRENT_USER_ID } from "@/lib/supabase";
import { APPLIED_STATUSES, MANUAL_PLATFORM } from "@/lib/mock-data";
import { isJobStatus, todayIso, validateDate, validateUrl } from "@/lib/applications";

// Updates a job's tracking fields. Status, date and salary work on every job;
// title, employer and link only on manual applications — a scraped job's
// posting data comes from the board.
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/jobs/[id]">) {
  const { id } = await ctx.params;
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;

  const supabase = getSupabaseServerClient();
  const { data: current, error: loadError } = await supabase
    .from("jobs")
    .select("platform, applied_at")
    .eq("id", id)
    .eq("user_id", CURRENT_USER_ID)
    .maybeSingle();
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const update: Record<string, unknown> = {};

  if ("status" in body) {
    if (body.status !== null && !isJobStatus(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    update.status = body.status;
    // Marking a job as applied dates the application, unless it already has a date.
    if (
      isJobStatus(body.status) &&
      APPLIED_STATUSES.includes(body.status) &&
      !current.applied_at &&
      !("applied_at" in body)
    ) {
      update.applied_at = todayIso();
    }
  }

  if ("applied_at" in body) {
    const date = validateDate(body.applied_at);
    if (!date.ok) return NextResponse.json({ error: date.error }, { status: 400 });
    update.applied_at = date.value;
  }

  if ("salary" in body) {
    update.salary =
      typeof body.salary === "string" && body.salary.trim() ? body.salary.trim() : null;
  }

  if (current.platform === MANUAL_PLATFORM) {
    for (const field of ["title", "company"] as const) {
      if (!(field in body)) continue;
      const value = typeof body[field] === "string" ? body[field].trim() : "";
      if (!value) return NextResponse.json({ error: `${field} is required` }, { status: 400 });
      update[field] = value;
    }
    if ("url" in body) {
      const url = validateUrl(body.url);
      if (!url.ok) return NextResponse.json({ error: url.error }, { status: 400 });
      update.url = url.value;
    }
  }

  const { data, error } = await supabase
    .from("jobs")
    .update(update)
    .eq("id", id)
    .eq("user_id", CURRENT_USER_ID)
    .select()
    .single();

  if (error) {
    const message = error.code === "23505" ? "Another job already has this link" : error.message;
    return NextResponse.json({ error: message }, { status: error.code === "23505" ? 409 : 500 });
  }

  return NextResponse.json(data);
}

// Deletes a manual application. Scraped jobs leave the tracker by clearing
// their status instead.
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/jobs/[id]">) {
  const { id } = await ctx.params;
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("jobs")
    .delete()
    .eq("id", id)
    .eq("user_id", CURRENT_USER_ID)
    .eq("platform", MANUAL_PLATFORM)
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) {
    return NextResponse.json({ error: "Only manual applications can be deleted" }, { status: 400 });
  }
  return NextResponse.json({ deleted: true });
}
