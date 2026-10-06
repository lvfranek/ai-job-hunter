import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient, CURRENT_USER_ID } from "@/lib/supabase";
import { APPLIED_STATUSES, MANUAL_PLATFORM } from "@/lib/mock-data";
import { validateApplication, type ApplicationInput } from "@/lib/applications";

const COLUMNS = "id, title, company, url, platform, status, applied_at, salary, created_at";

// The tracker: every manual application, plus scraped jobs you marked as
// applied (or further). Pruned scraped jobs are included on purpose — older
// pruning removed applied jobs too, and an application stays an application.
export async function GET() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("jobs")
    .select(COLUMNS)
    .eq("user_id", CURRENT_USER_ID)
    .or(`platform.eq.${MANUAL_PLATFORM},status.in.(${APPLIED_STATUSES.join(",")})`)
    .order("applied_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// Adds one application (the form) or many (the CSV import). Rows whose link
// already belongs to a job are skipped rather than failing the whole import.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const items: unknown[] = Array.isArray(body) ? body : [body];
  if (items.length === 0 || items.length > 500) {
    return NextResponse.json({ error: "Send between 1 and 500 applications" }, { status: 400 });
  }

  const rows: ApplicationInput[] = [];
  for (const [i, item] of items.entries()) {
    const result = validateApplication(item);
    if (!result.ok) {
      const where = items.length > 1 ? `Row ${i + 1}: ` : "";
      return NextResponse.json({ error: where + result.error }, { status: 400 });
    }
    rows.push(result.value);
  }

  const supabase = getSupabaseServerClient();
  const urls = rows.flatMap((r) => (r.url ? [r.url] : []));
  const taken = new Set<string>();
  if (urls.length) {
    const { data, error } = await supabase.from("jobs").select("url").in("url", urls);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const row of data as { url: string }[]) taken.add(row.url);
  }

  const fresh = rows.filter((r) => {
    if (!r.url) return true;
    if (taken.has(r.url)) return false;
    taken.add(r.url); // the same link twice in one import
    return true;
  });

  if (fresh.length) {
    const { error } = await supabase
      .from("jobs")
      .insert(fresh.map((r) => ({ ...r, platform: MANUAL_PLATFORM, user_id: CURRENT_USER_ID })));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ inserted: fresh.length, skipped: rows.length - fresh.length });
}
