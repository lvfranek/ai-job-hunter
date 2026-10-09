import "server-only";
import { buildPlaceIndex, type PlaceIndex } from "./places";

// The place data is ~1 MB: imported lazily, so routes that never measure a
// distance (score status polling, preferences GET) don't parse it on a cold
// start, and `server-only` fails the build if a client component ever pulls it in.
let cached: Promise<PlaceIndex> | undefined;

export function getPlaceIndex(): Promise<PlaceIndex> {
  cached ??= import("./places-dach.json").then((m) => buildPlaceIndex(m.default));
  return cached;
}
