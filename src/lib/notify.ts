import { chanceLabels, chancesAtLeast, type Chance } from "@/lib/chance";
import { getSupabaseServerClient, CURRENT_USER_ID } from "@/lib/supabase";
import type { NotificationChance } from "@/lib/types";

interface MatchRow {
  id: string;
  chance: Chance;
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
    .select("notification_min_chance")
    .eq("user_id", CURRENT_USER_ID)
    .single();
  const minChance: NotificationChance =
    settings?.notification_min_chance === "very_good" ? "very_good" : "good";

  const { data: matches } = await supabase
    .from("job_matches")
    .select("id, chance, reasoning, jobs(title, company, url, platform, posted_date)")
    .eq("user_id", CURRENT_USER_ID)
    .is("notified_at", null)
    .in("chance", chancesAtLeast(minChance));

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
      chance: m.chance,
      chanceLabel: chanceLabels[m.chance],
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
        qualifying.map((m) => m.id),
      );
    return true;
  } catch (error) {
    console.error("Notification webhook failed:", error);
    return false;
  }
}
