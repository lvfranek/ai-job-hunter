import { getSupabaseServerClient, CURRENT_USER_ID } from "@/lib/supabase";

interface MatchRow {
  id: string;
  match_score: number;
  reasoning: string | null;
  jobs: {
    title: string;
    company: string;
    url: string;
    platform: string;
    posted_date: string | null;
  } | null;
}

// Never let a webhook failure fail the scrape/score pipeline that called this —
// always wrapped in try/catch, always returns rather than throws.
export async function notifyNewJobs(): Promise<boolean> {
  const webhookUrl = process.env.NOTIFICATION_WEBHOOK_URL;
  if (!webhookUrl) return false;

  const supabase = getSupabaseServerClient();
  const { data: settings } = await supabase
    .from("settings")
    .select("notification_threshold")
    .eq("user_id", CURRENT_USER_ID)
    .single();
  const threshold = settings?.notification_threshold ?? 75;

  const { data: matches } = await supabase
    .from("job_matches")
    .select("id, match_score, reasoning, jobs(title, company, url, platform, posted_date)")
    .eq("user_id", CURRENT_USER_ID)
    .is("notified_at", null)
    .gte("match_score", threshold);

  const qualifying = ((matches ?? []) as unknown as MatchRow[]).filter((m) => m.jobs);
  if (qualifying.length === 0) return false;

  const payload = {
    event: "new_jobs",
    count: qualifying.length,
    jobs: qualifying.map((m) => ({
      title: m.jobs!.title,
      company: m.jobs!.company,
      url: m.jobs!.url,
      platform: m.jobs!.platform,
      score: m.match_score,
      reasoning: m.reasoning,
      postedDate: m.jobs!.posted_date,
    })),
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Webhook responded ${res.status}`);

    await supabase
      .from("job_matches")
      .update({ notified_at: new Date().toISOString() })
      .in(
        "id",
        qualifying.map((m) => m.id)
      );
    return true;
  } catch (error) {
    console.error("Notification webhook failed:", error);
    return false;
  }
}
