// Distance math only — no place data. scoring-rules.ts imports this, and the
// dashboard imports scoring-rules.ts in the browser, so nothing heavier may live here.

/** [latitude, longitude] in degrees. */
export type Point = [number, number];

/** A place as the rules see it: a name, and every point it covers (one per postcode). */
export interface PlacePoints {
  label: string;
  points: Point[];
}

/** One of the candidate's cities and how far from it they'd commute. */
export interface Home extends PlacePoints {
  radiusKm: number;
}

const EARTH_RADIUS_KM = 6371;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Straight-line ("as the crow flies") distance between two points. */
export function haversineKm([lat1, lon1]: Point, [lat2, lon2]: Point): number {
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/**
 * Closest approach between two point sets. A city is all of its postcode
 * points, so this measures from the edge of the city's area, not its centre —
 * Norderstedt is ~3 km from Hamburg, not 17. Stops early once a pair is within
 * `stopAt`, since the caller only needs to know that something is close enough.
 */
export function closestKm(a: Point[], b: Point[], stopAt = 0): number {
  let best = Infinity;
  for (const p of a) {
    for (const q of b) {
      const d = haversineKm(p, q);
      if (d < best) {
        best = d;
        if (best <= stopAt) return best;
      }
    }
  }
  return best;
}
