import "server-only";
import { getPlaceIndex } from "@/lib/geo/load";
import { resolveHomes } from "@/lib/geo/places";
import { DEFAULT_PREFERENCES } from "@/lib/preferences";
import { buildSearchPlan, type SearchPlan } from "@/lib/search-plan";
import { getSupabaseServerClient, CURRENT_USER_ID } from "@/lib/supabase";
import type { Preferences } from "@/lib/types";

type WherePreferences = Pick<Preferences, "remote_ok" | "office_ok" | "work_locations">;

/** The search plan for these preferences, with their cities resolved the way the scorer does. */
export async function searchPlanFor(prefs: WherePreferences): Promise<SearchPlan> {
  const index = await getPlaceIndex();
  const { homes } = resolveHomes(index, prefs.work_locations ?? []);
  return buildSearchPlan(prefs, homes);
}

/** The current user's search plan, from their saved preferences (defaults without a row). */
export async function loadSearchPlan(
  supabase: ReturnType<typeof getSupabaseServerClient>,
): Promise<SearchPlan> {
  const { data, error } = await supabase
    .from("preferences")
    .select("remote_ok, office_ok, work_locations")
    .eq("user_id", CURRENT_USER_ID)
    .maybeSingle();
  if (error) throw new Error(`Loading preferences failed: ${error.message}`);
  return searchPlanFor((data as WherePreferences | null) ?? DEFAULT_PREFERENCES);
}
