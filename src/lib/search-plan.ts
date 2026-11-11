// What a scan searches for, derived from the AI Scoring Preferences — the one
// place where "where" is set. The scraper fetches exactly the jobs the scorer
// can accept: remote jobs across Germany when remote is fine, and jobs around
// each of the candidate's cities when office work is fine.
//
// Pure module, no server imports: the settings page shows the plan, the
// scraper runs it.

import { haversineKm, type Home, type Point } from "@/lib/geo/distance";
import type { Preferences } from "@/lib/types";

export type SearchArea =
  /** All of Germany, with the board's remote filter. */
  | { kind: "remote" }
  /** All of Germany, no filter — office work is fine and no city was given. */
  | { kind: "germany" }
  /** Around one of the candidate's cities, no remote filter. */
  | { kind: "place"; place: string; radiusKm: number };

export interface SearchPlan {
  areas: SearchArea[];
  /** Cities left out because their radius overlaps one that is searched. */
  skipped: { place: string; coveredBy: string }[];
}

export type SearchPlanPreferences = Pick<Preferences, "remote_ok" | "office_ok">;

/** Place searches fetch half as many results each, so extra cities don't double the Apify bill. */
export const MIN_PLACE_RESULTS = 5;

export function resultsPerSearch(area: SearchArea, resultsPerScan: number): number {
  return area.kind === "place"
    ? Math.max(MIN_PLACE_RESULTS, Math.floor(resultsPerScan / 2))
    : resultsPerScan;
}

/** The name a job board is searched with — "Wien (AT)" → "Wien". */
export function searchName(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function center(points: Point[]): Point {
  const lat = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const lon = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  return [lat, lon];
}

/**
 * The searches one keyword on one board runs. `homes` are the candidate's
 * cities, already resolved to points — names that don't resolve are left out
 * here just as the scorer leaves them out. Two cities whose circles overlap
 * (centres closer than the two radii together) are searched once, by the
 * bigger of the two — it has more of the jobs.
 */
export function buildSearchPlan(prefs: SearchPlanPreferences, homes: Home[]): SearchPlan {
  const remoteOk = prefs.remote_ok !== false;
  const officeOk = prefs.office_ok !== false;
  const areas: SearchArea[] = [];
  const skipped: SearchPlan["skipped"] = [];

  if (officeOk && homes.length === 0) {
    // Any place is fine to the scorer, so one search without a filter covers
    // remote jobs too.
    return { areas: [{ kind: "germany" }], skipped };
  }
  if (remoteOk) areas.push({ kind: "remote" });
  if (officeOk) {
    const kept: { home: Home; center: Point }[] = [];
    // Biggest first (most postcodes), so an overlap keeps the bigger city.
    const bySize = [...homes].sort((a, b) => b.points.length - a.points.length);
    for (const home of bySize) {
      const here = center(home.points);
      const overlap = kept.find(
        (k) => haversineKm(k.center, here) < k.home.radiusKm + home.radiusKm,
      );
      if (overlap) {
        skipped.push({ place: home.label, coveredBy: overlap.home.label });
        continue;
      }
      kept.push({ home, center: here });
    }
    // Back in the order the candidate listed them.
    for (const home of homes) {
      if (kept.some((k) => k.home === home)) {
        areas.push({ kind: "place", place: home.label, radiusKm: home.radiusKm });
      }
    }
  }
  // Neither switch on can't be saved; search like before rather than not at all.
  if (areas.length === 0) areas.push({ kind: "germany" });
  return { areas, skipped };
}

/** The city a search is limited to, for the statistics; null for all of Germany. */
export function areaLocation(area: SearchArea): string | null {
  return area.kind === "place" ? area.place : null;
}

const listing = (items: string[]) =>
  items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/** One line for the settings page: what a scan searches for. */
export function describeSearchPlan(plan: SearchPlan): string {
  const parts: string[] = [];
  for (const area of plan.areas) {
    if (area.kind === "remote") parts.push("remote jobs across Germany");
    if (area.kind === "germany") parts.push("all jobs across Germany");
  }
  const places = plan.areas
    .filter((a): a is Extract<SearchArea, { kind: "place" }> => a.kind === "place")
    .map((a) => `${a.place} (${a.radiusKm} km)`);
  if (places.length > 0) parts.push(`on-site/hybrid jobs in ${listing(places)}`);
  let line = `Searching ${parts.join(" + ")}.`;
  for (const { place, coveredBy } of plan.skipped) {
    line += ` ${place} overlaps ${coveredBy} and is searched with it.`;
  }
  return line;
}
