import "server-only";
import { getPlaceIndex } from "./load";
import { resolvePlace, searchPlaces, suggestPlaces } from "./places";
import { acceptsOfficeWork, type PreferencesInput } from "@/lib/preferences";
import type { WorkLocation } from "@/lib/types";

// What the API routes (real and demo) do with places: autocomplete, and
// checking the cities a candidate saves.

const MIN_QUERY_CHARS = 2;

/** Autocomplete for the preferences page; `exact` also says what the text resolves to. */
export async function placeSearch(
  query: string,
  exact: boolean,
): Promise<{ places: string[]; match?: string | null }> {
  const q = query.trim();
  if (q.length < MIN_QUERY_CHARS) return exact ? { places: [], match: null } : { places: [] };
  const index = await getPlaceIndex();
  const places = searchPlaces(index, q);
  return exact ? { places, match: resolvePlace(index, q)?.label ?? null } : { places };
}

/**
 * Checks the saved cities against the place data and stores each under its
 * proper name ("hamburg" → "Hamburg", "Vienna" → "Wien (AT)"). Skipped for a
 * remote-only candidate: the fields are hidden then and their values unused.
 */
export async function withResolvedWorkLocations(
  preferences: PreferencesInput,
): Promise<{ preferences: PreferencesInput } | { error: string }> {
  if (!acceptsOfficeWork(preferences.job_type) || preferences.work_locations.length === 0) {
    return { preferences };
  }
  const index = await getPlaceIndex();
  const resolved: WorkLocation[] = [];
  for (const entry of preferences.work_locations) {
    const place = resolvePlace(index, entry.place);
    if (!place) {
      const [suggestion] = suggestPlaces(index, entry.place);
      return {
        error: suggestion
          ? `Couldn't find "${entry.place}" – did you mean ${suggestion}?`
          : `Couldn't find "${entry.place}". Try the city's name or its postcode.`,
      };
    }
    if (!resolved.some((r) => r.place === place.label)) {
      resolved.push({ place: place.label, radius_km: entry.radius_km });
    }
  }
  return { preferences: { ...preferences, work_locations: resolved } };
}
