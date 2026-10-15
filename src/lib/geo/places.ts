// Turning location text into places with points — "22765 Hamburg", "Munich,
// Bavaria, Germany", "Hamburg-Altona", "Hamburg, Berlin, München". Pure
// functions over an index passed in: the ~1 MB place data is loaded on the
// server only (load.ts), so tests can use a small fixture.

import type { Home, PlacePoints, Point } from "./distance";

export type Country = "DE" | "AT" | "CH";

export interface Place extends PlacePoints {
  country: Country;
  /** State code as GeoNames has it: "HH", "BY" for Germany, "09" for Vienna, "ZH". */
  state: string;
  /** The bare place name; `label` is unique and may add the state or country. */
  name: string;
}

/** The shape of places-dach.json — one line per place, see scripts/build-places.mjs. */
export interface PlaceData {
  attribution: string;
  built: string;
  places: string[];
}

export interface PlaceIndex {
  places: Place[];
  /** Normalised name → places, biggest first. */
  byKey: Map<string, Place[]>;
  /** "DE:22765" → the point of that postcode and the place it belongs to. */
  byPostcode: Map<string, { place: Place; point: Point }>;
}

// ---- normalising names ---------------------------------------------------------

const UMLAUTS: [RegExp, string, string][] = [
  [/ä/g, "ae", "a"],
  [/ö/g, "oe", "o"],
  [/ü/g, "ue", "u"],
];

const stripAccents = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Every lookup key a name can be written as. Both umlaut spellings are kept
 * (München → muenchen and munchen), so "Muenchen", "Munchen" and "München" all
 * meet. Hyphens and punctuation become spaces; "St." becomes "sankt".
 */
export function normalizeKeys(text: string): string[] {
  const base = text
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[-–/().,'’]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\bst\b(?= )/g, "sankt");
  if (!base) return [];
  const withE = UMLAUTS.reduce((s, [re, e]) => s.replace(re, e), base);
  const plain = UMLAUTS.reduce((s, [re, , p]) => s.replace(re, p), base);
  return [...new Set([stripAccents(withE), stripAccents(plain)])];
}

const key = (text: string) => normalizeKeys(text)[0] ?? "";

// English names job boards use for places the data has in German or French.
const EXONYMS: Record<string, string> = {
  munich: "München",
  cologne: "Köln",
  nuremberg: "Nürnberg",
  hanover: "Hannover",
  brunswick: "Braunschweig",
  vienna: "Wien",
  geneva: "Genève",
  genf: "Genève",
  lucerne: "Luzern",
  basle: "Basel",
  berne: "Bern",
  "frankfurt main": "Frankfurt am Main",
};

const COUNTRY_NAMES: Record<string, Country> = Object.fromEntries(
  (
    [
      ["Germany", "DE"],
      ["Deutschland", "DE"],
      ["DE", "DE"],
      ["Austria", "AT"],
      ["Österreich", "AT"],
      ["AT", "AT"],
      ["Switzerland", "CH"],
      ["Schweiz", "CH"],
      ["Suisse", "CH"],
      ["Svizzera", "CH"],
      ["CH", "CH"],
    ] as const
  ).flatMap(([name, country]) => normalizeKeys(name).map((k) => [k, country])),
);

// Anything that names no city: countries, regions of the world, "remote".
const NO_CITY = new Set(
  [
    "European Union",
    "EU",
    "Europe",
    "Europa",
    "EMEA",
    "DACH",
    "Remote",
    "Home Office",
    "Homeoffice",
    "Anywhere",
    "Worldwide",
    "bundesweit",
    "deutschlandweit",
    "europaweit",
    "verschiedene Standorte",
    "mehrere Standorte",
    "diverse Standorte",
    "various locations",
    "multiple locations",
    "flexibel",
    "flexible",
    "vor Ort",
    "hybrid",
    "onsite",
    "on site",
  ].flatMap(normalizeKeys),
);

// "City, State, Country" — the state picks the right Frankfurt and tells it
// apart from a list of cities. German and English names; AT codes are GeoNames'.
const STATE_NAMES: Record<string, { country: Country; code: string }> = Object.fromEntries(
  (
    [
      ["DE", "BW", ["Baden-Württemberg"]],
      ["DE", "BY", ["Bayern", "Bavaria"]],
      ["DE", "BE", ["Berlin"]],
      ["DE", "BB", ["Brandenburg"]],
      ["DE", "HB", ["Bremen"]],
      ["DE", "HH", ["Hamburg"]],
      ["DE", "HE", ["Hessen", "Hesse"]],
      ["DE", "MV", ["Mecklenburg-Vorpommern", "Mecklenburg-Western Pomerania"]],
      ["DE", "NI", ["Niedersachsen", "Lower Saxony"]],
      ["DE", "NW", ["Nordrhein-Westfalen", "North Rhine-Westphalia", "NRW"]],
      ["DE", "RP", ["Rheinland-Pfalz", "Rhineland-Palatinate"]],
      ["DE", "SL", ["Saarland"]],
      ["DE", "SN", ["Sachsen", "Saxony"]],
      ["DE", "ST", ["Sachsen-Anhalt", "Saxony-Anhalt"]],
      ["DE", "SH", ["Schleswig-Holstein"]],
      ["DE", "TH", ["Thüringen", "Thuringia"]],
      ["AT", "01", ["Burgenland"]],
      ["AT", "02", ["Kärnten", "Carinthia"]],
      ["AT", "03", ["Niederösterreich", "Lower Austria"]],
      ["AT", "04", ["Oberösterreich", "Upper Austria"]],
      ["AT", "05", ["Salzburg"]],
      ["AT", "06", ["Steiermark", "Styria"]],
      ["AT", "07", ["Tirol", "Tyrol"]],
      ["AT", "08", ["Vorarlberg"]],
      ["AT", "09", ["Wien", "Vienna"]],
    ] as [Country, string, string[]][]
  ).flatMap(([country, code, names]) =>
    names.flatMap((name) => normalizeKeys(name).map((k) => [k, { country, code }])),
  ),
);

// "Greater Munich", "Hamburg Metropolitan Area", "Raum Stuttgart".
const AREA_PREFIX = /^(?:greater|grossraum|raum|region|metropolregion|naehe|nahe|near|umgebung)\s+/;
const AREA_SUFFIX =
  /\s+(?:metropolitan area|area|und umgebung|umgebung|region|metropolregion|umland)$/;

// Never shorten a name down to one of these alone ("Bad Homburg" is not "Bad").
const GENERIC_WORDS = new Set([
  "bad",
  "sankt",
  "neu",
  "gross",
  "klein",
  "ober",
  "unter",
  "alt",
  "nieder",
  "hohen",
  "markt",
]);

// Where a short name ends: "Frankfurt am Main" → "Frankfurt", "Biel/Bienne" → both.
const SHORT_NAME_CUT = /\s+(?:am|an der|an|im|in|bei|ob der|ob)\s+.*$|\s*\(.*$/i;

// ---- the index -----------------------------------------------------------------

function parseLine(line: string): Place | null {
  const [country, state, label, name, pointText] = line.split("|");
  if (!pointText) return null;
  const points: Point[] = [];
  const postcodes: string[] = [];
  for (const entry of pointText.split(";")) {
    const [postcode, coords] = entry.split(":");
    const [lat, lon] = (coords ?? "").split(",").map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    points.push([lat, lon]);
    postcodes.push(postcode);
  }
  if (points.length === 0) return null;
  const place = { country: country as Country, state, label, name, points };
  // Kept on the side for the postcode map, not on the place itself.
  return Object.assign(place, { postcodes });
}

/** Places sorted biggest first, with Germany winning a tie. */
const bigFirst = (a: Place, b: Place) =>
  b.points.length - a.points.length || Number(b.country === "DE") - Number(a.country === "DE");

export function buildPlaceIndex(data: PlaceData): PlaceIndex {
  const places: Place[] = [];
  const byKey = new Map<string, Place[]>();
  const byPostcode = new Map<string, { place: Place; point: Point }>();
  const addKey = (k: string, place: Place) => {
    const list = byKey.get(k) ?? [];
    if (!list.includes(place)) list.push(place);
    byKey.set(k, list);
  };

  for (const line of data.places) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    const { postcodes, ...place } = parsed as Place & { postcodes: string[] };
    places.push(place);
    const names = [place.name, place.label, place.name.replace(SHORT_NAME_CUT, "")];
    if (place.name.includes("/")) names.push(...place.name.split("/"));
    for (const name of names) for (const k of normalizeKeys(name)) addKey(k, place);
    postcodes.forEach((postcode, i) => {
      const id = `${place.country}:${postcode}`;
      if (!byPostcode.has(id)) byPostcode.set(id, { place, point: place.points[i] });
    });
  }
  for (const list of byKey.values()) list.sort(bigFirst);
  return { places, byKey, byPostcode };
}

// ---- resolving text ------------------------------------------------------------

function lookup(index: PlaceIndex, text: string, state?: string): Place | null {
  for (const k of normalizeKeys(text)) {
    const exonym = EXONYMS[k];
    const found = index.byKey.get(exonym ? key(exonym) : k);
    if (!found?.length) continue;
    if (state) return found.find((p) => p.state === state) ?? null;
    return found[0];
  }
  return null;
}

/** One city name → its place, shortening "Hamburg-Altona" to "Hamburg" when needed. */
function resolveName(index: PlaceIndex, text: string, state?: string): Place | null {
  const cleaned = key(text).replace(AREA_PREFIX, "").replace(AREA_SUFFIX, "").trim();
  if (!cleaned || NO_CITY.has(cleaned) || COUNTRY_NAMES[cleaned]) return null;
  const direct = lookup(index, cleaned, state);
  if (direct) return direct;
  const words = cleaned.split(" ");
  for (let k = words.length - 1; k >= 1; k--) {
    if (k === 1 && GENERIC_WORDS.has(words[0])) break;
    const found = lookup(index, words.slice(0, k).join(" "), state);
    if (found) return found;
  }
  return null;
}

export function countryOf(code: string | null | undefined): Country | undefined {
  return code ? COUNTRY_NAMES[key(code)] : undefined;
}

/**
 * A postcode → its exact point. Five digits are German; four digits exist in
 * both Austria and Switzerland (1010 is Vienna and Lausanne), so they need a
 * country or a city name that matches one of the two.
 */
export function lookupPostcode(
  index: PlaceIndex,
  postcode: string,
  country?: Country,
  cityText?: string,
): PlacePoints | null {
  const digits = postcode.replace(/\D/g, "");
  if (digits.length !== 4 && digits.length !== 5) return null;
  const countries: Country[] = country ? [country] : digits.length === 5 ? ["DE"] : ["AT", "CH"];
  const hits = countries.flatMap((c) => index.byPostcode.get(`${c}:${digits}`) ?? []);
  let hit = hits.length === 1 ? hits[0] : undefined;
  if (!hit && cityText) {
    const city = resolveName(index, cityText);
    hit = hits.find((h) => h.place === city);
  }
  return hit ? { label: hit.place.label, points: [hit.point] } : null;
}

const POSTCODE = /(?:^|[\s,(])(?:(D|DE|A|AT|CH)\s?[-\s]\s?)?(\d{4,5})(?!\d)/i;
const NOISE_IN_PARENS =
  /\((?:remote|hybrid|home ?office|m\/w\/d|w\/m\/d|m\/f\/d|f\/m\/d|all genders|gn|vor ort|on-?site|teilweise remote)[^)]*\)/gi;

function expandAbbreviations(text: string): string {
  return text
    .replace(NOISE_IN_PARENS, " ")
    .replace(/\bFrankfurt\s*\/\s*M(?:ain|\.)?(?=\W|$)/gi, "Frankfurt am Main")
    .replace(/\ba\.\s?M\./g, "am Main")
    .replace(/\bi\.\s?Br\./g, "im Breisgau");
}

/**
 * Every place a location text names. Board fields come as "Hamburg",
 * "22765 Hamburg", "Hamburg, Hamburg, Germany", "Frankfurt, Hessen,
 * Deutschland" (one place: a state follows) or "Hamburg, Berlin, München"
 * (three). Texts that name no city ("Germany", "Remote") give [].
 */
export function resolveLocationText(
  index: PlaceIndex,
  text: string | null | undefined,
  countryHint?: Country,
): PlacePoints[] {
  if (!text?.trim()) return [];
  const found: PlacePoints[] = [];
  const add = (place: PlacePoints | null) => {
    if (place && !found.some((f) => f.label === place.label)) found.push(place);
  };

  const segments = expandAbbreviations(text).split(
    /\s*\|\s*|\s*;\s*|\s+\/\s+|\s+(?:und|oder|or|and|&)\s+/i,
  );
  for (const segment of segments) {
    const postcode = segment.match(POSTCODE);
    if (postcode) {
      const country = postcode[1]
        ? countryOf(postcode[1].replace(/^D$/i, "DE").replace(/^A$/i, "AT"))
        : countryHint;
      const rest = segment.replace(postcode[0], " ");
      const hit = lookupPostcode(index, postcode[2], country, rest);
      if (hit) {
        add(hit);
        continue;
      }
    }

    let parts = segment
      .replace(/\d{4,5}/g, " ")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 2 && COUNTRY_NAMES[key(parts[parts.length - 1])])
      parts = parts.slice(0, -1);
    if (parts.length >= 2) {
      const state = STATE_NAMES[key(parts[1])];
      const inState = state ? resolveName(index, parts[0], state.code) : null;
      if (inState) {
        add(inState);
        continue;
      }
    }
    for (const part of parts) add(resolveName(index, part));
  }
  return found;
}

/** The single place a user typed for themselves, or null. */
export function resolvePlace(index: PlaceIndex, text: string): Place | null {
  const [first] = resolveLocationText(index, text);
  return first ? (index.places.find((p) => p.label === first.label) ?? null) : null;
}

// ---- autocomplete and suggestions ---------------------------------------------

/** Labels whose name starts with what was typed, exact and bigger places first. */
export function searchPlaces(index: PlaceIndex, query: string, limit = 8): string[] {
  const typed = normalizeKeys(query.replace(/\s*\(.*$/, ""));
  if (typed.length === 0 || typed[0].length < 2) return [];
  const exonym = EXONYMS[typed[0]];
  const prefixes = exonym ? [...typed, ...normalizeKeys(exonym)] : typed;
  const hits = new Map<Place, boolean>();
  for (const [k, places] of index.byKey) {
    const exact = prefixes.includes(k);
    if (!exact && !prefixes.some((p) => k.startsWith(p))) continue;
    for (const place of places) hits.set(place, (hits.get(place) ?? false) || exact);
  }
  return [...hits]
    .sort(
      ([a, ea], [b, eb]) =>
        Number(eb) - Number(ea) || bigFirst(a, b) || a.label.localeCompare(b.label),
    )
    .slice(0, limit)
    .map(([place]) => place.label);
}

function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

/** Close matches for a name that didn't resolve — "Hamburk" → Hamburg. */
export function suggestPlaces(index: PlaceIndex, query: string, limit = 3): string[] {
  const typed = key(query);
  if (typed.length < 3) return [];
  const scored = new Map<Place, number>();
  for (const [k, places] of index.byKey) {
    const d = editDistance(typed, k, 2);
    if (d > 2) continue;
    for (const place of places) scored.set(place, Math.min(scored.get(place) ?? 3, d));
  }
  const close = [...scored]
    .sort(([a, da], [b, db]) => da - db || bigFirst(a, b))
    .map(([place]) => place.label);
  return (close.length > 0 ? close : searchPlaces(index, typed.slice(0, 3))).slice(0, limit);
}

// ---- jobs and homes ------------------------------------------------------------

export interface JobLocationFields {
  location: string | null;
  postal_code: string | null;
  country_code: string | null;
  latitude: number | null;
  longitude: number | null;
  /** The posting itself — the model's cities must appear in it, and its address line is the last resort. */
  title?: string | null;
  description?: string | null;
}

/**
 * Whether the posting names a city at all. The model has put "Hamburg" on a
 * Regensburg posting that never mentions Hamburg — a city it reports only
 * counts when the text really contains it.
 */
export function mentionedIn(text: string, city: string): boolean {
  const haystacks = normalizeKeys(text).map((t) => ` ${t} `);
  const name = city.split(/[,(]/)[0];
  return normalizeKeys(name).some(
    (k) => k.length >= 2 && haystacks.some((h) => h.includes(` ${k} `)),
  );
}

// "93055 Regensburg", "D-28195 Bremen", "60311 Frankfurt am Main". The city
// after the postcode has to match the postcode's own place, so a phone number
// or a salary can never pass as an address.
const POSTCODE_CITY =
  /(?:^|[\s,(:])(?:D-?\s?)?(\d{5})\s+([A-ZÄÖÜ][\wÄÖÜäöüß.'-]*(?:\s+(?:am|an der|im|in|bei|ob der)\s+[A-ZÄÖÜ][\wÄÖÜäöüß.'-]*|\s*\([^)\n]{1,20}\))?)/g;
// "Standort: Bremen", "Arbeitsort: Oldenburg (Oldb)", "am Standort Gauting".
const PLACE_LABEL =
  /(?:Standort|Standorte|Arbeitsort|Einsatzort|Dienstort|Location|Job location)(?:\s*[:：]\s*|\s+(?:in\s+)?(?=[A-ZÄÖÜ]))([^\n;|]{2,60})/g;
const MAX_TEXT_PLACES = 3;

/**
 * Places a posting's text names outright: addresses with a postcode, and
 * "Standort: …" lines. Read in code, not by the model — it skips a company
 * address it takes for the head office even when that office is where the
 * job is worked.
 */
export function findPlacesInText(
  index: PlaceIndex,
  text: string | null | undefined,
): PlacePoints[] {
  if (!text) return [];
  const found: PlacePoints[] = [];
  const add = (place: PlacePoints) => {
    if (found.length < MAX_TEXT_PLACES && !found.some((f) => f.label === place.label)) {
      found.push(place);
    }
  };
  for (const match of text.matchAll(PLACE_LABEL)) {
    for (const place of resolveLocationText(index, match[1], "DE")) add(place);
  }
  for (const match of text.matchAll(POSTCODE_CITY)) {
    const hit = index.byPostcode.get(`DE:${match[1]}`);
    const city = resolveName(index, match[2]);
    if (hit && city && hit.place === city) add({ label: city.label, points: [hit.point] });
  }
  return found;
}

/**
 * Where a job is worked from. The first source that resolves wins — they are
 * never merged, so a "Hauptsitz Hamburg" in a posting's footer can't make a
 * Munich job look close. Order: the board's postcode (exact), the board's city
 * (all its points), the board's coordinates (only for a city the data lacks —
 * they are usually just the city centre), the cities the model read, and last
 * the addresses written in the posting itself.
 */
export function resolveJobPlaces(
  index: PlaceIndex,
  job: JobLocationFields,
  modelCities: string[] = [],
): PlacePoints[] {
  const country = countryOf(job.country_code);
  if (job.postal_code) {
    const hit = lookupPostcode(index, job.postal_code, country, job.location ?? undefined);
    if (hit) return [hit];
  }
  const fromBoard = resolveLocationText(index, job.location, country);
  if (fromBoard.length > 0) return fromBoard;
  if (Number.isFinite(job.latitude) && Number.isFinite(job.longitude) && job.latitude !== null) {
    return [
      {
        label: job.location?.trim() || "the posting's location",
        points: [[job.latitude, job.longitude as number]],
      },
    ];
  }
  const postingText = [job.title, job.description].filter(Boolean).join("\n");
  const placesOf = (cities: string[]) => {
    const found: PlacePoints[] = [];
    for (const city of cities) {
      for (const place of resolveLocationText(index, city, country)) {
        if (!found.some((p) => p.label === place.label)) found.push(place);
      }
    }
    return found;
  };
  // A city the model read that the posting names outright is the best clue left.
  const named = placesOf(modelCities.filter((c) => mentionedIn(postingText, c)));
  if (named.length > 0) return named;
  // Then an address written in the posting.
  const written = findPlacesInText(index, job.description);
  if (written.length > 0) return written;
  // Last, a city the model inferred ("Universität des Saarlandes" → Saarbrücken).
  // It once invented "Hamburg" for a Regensburg posting — but that posting had
  // an address, which wins above; ignoring every inference left real jobs unplaced.
  return placesOf(modelCities);
}

/** The candidate's cities as places; names that don't resolve are reported, never guessed. */
export function resolveHomes(
  index: PlaceIndex,
  workLocations: { place: string; radius_km: number }[],
): { homes: Home[]; unresolved: string[] } {
  const homes: Home[] = [];
  const unresolved: string[] = [];
  for (const { place, radius_km } of workLocations ?? []) {
    const found = resolvePlace(index, place);
    if (found) homes.push({ label: found.label, points: found.points, radiusKm: radius_km });
    else unresolved.push(place);
  }
  return { homes, unresolved };
}
