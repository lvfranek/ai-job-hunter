// Builds src/lib/geo/places-dach.json from the GeoNames postal-code dumps for
// Germany, Austria and Switzerland (CC BY 4.0, https://www.geonames.org).
//
//   npm run geo:build
//
// Each place becomes one line: "CC|state|label|name|postcode:lat,lon;…". A city
// keeps every one of its postcode points, so distances can be measured from the
// city's area instead of its centre. The file is committed — builds and CI never
// download anything.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const OUT = new URL("../src/lib/geo/places-dach.json", import.meta.url);
const COUNTRIES = ["DE", "AT", "CH"];

// Column order of the GeoNames postal-code dump.
const COL = {
  country: 0,
  postcode: 1,
  place: 2,
  state: 3,
  stateCode: 4,
  county: 7,
  countyCode: 8,
  lat: 9,
  lon: 10,
};

// German state codes are letters; numeric ones mark company and P.O.-box codes.
const DE_STATE = /^[A-Z]{2}$/;
const NOT_A_PLACE = /\b(GmbH|mbH|AG|KG|Postfach|PF|Aktiengesellschaft)\b/;
// A district suffix starts after the city name ("Hamburg Sasel"); these words
// instead continue a proper name ("Neustadt an der Weinstraße").
const NAME_CONTINUES = /^(am|an|im|in|bei|ob|auf|vor|unter|a\.|i\.|v\.|\()/i;
const GENERIC_PREFIX = /^(bad|sankt|st\.|neu|groß|klein|ober|unter|alt|nieder|hohen)$/i;

function download(country, dir) {
  const zip = join(dir, `${country}.zip`);
  execFileSync("curl", [
    "-sSfL",
    "-o",
    zip,
    `https://download.geonames.org/export/zip/${country}.zip`,
  ]);
  return execFileSync("unzip", ["-p", zip, `${country}.txt`], {
    maxBuffer: 64 * 1024 * 1024,
  }).toString("utf8");
}

function rows(text) {
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"));
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

function haversineKm([lat1, lon1], [lat2, lon2]) {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/** Groups keyed by country|state|name, each with a postcode → point map. */
function group(groups, key, meta, row) {
  const g = groups.get(key) ?? { ...meta, points: new Map() };
  const postcode = row[COL.postcode];
  if (!g.points.has(postcode)) g.points.set(postcode, [Number(row[COL.lat]), Number(row[COL.lon])]);
  groups.set(key, g);
}

function germanGroups(text, groups) {
  const kept = rows(text).filter(
    (r) => DE_STATE.test(r[COL.stateCode]) && !NOT_A_PLACE.test(r[COL.place]) && r[COL.lat],
  );
  // Names per state and county, to fold districts into their city.
  const names = new Map();
  for (const r of kept) {
    const key = `${r[COL.stateCode]}|${r[COL.countyCode]}`;
    const set = names.get(key) ?? new Set();
    set.add(r[COL.place].split(",")[0].trim());
    names.set(key, set);
  }
  for (const r of kept) {
    const scope = names.get(`${r[COL.stateCode]}|${r[COL.countyCode]}`);
    let name = r[COL.place].split(",")[0].trim();
    const words = name.split(" ");
    for (let k = words.length - 1; k >= 1; k--) {
      const prefix = words.slice(0, k).join(" ");
      if (NAME_CONTINUES.test(words[k]) || GENERIC_PREFIX.test(prefix)) continue;
      if (scope.has(prefix)) {
        name = prefix;
        break;
      }
    }
    group(
      groups,
      `DE|${r[COL.stateCode]}|${r[COL.countyCode]}|${name}`,
      {
        country: "DE",
        state: r[COL.stateCode],
        stateName: r[COL.state],
        county: r[COL.county],
        name,
      },
      r,
    );
  }
}

function municipalityGroups(country, text, groups) {
  for (const r of rows(text)) {
    if (!r[COL.lat] || NOT_A_PLACE.test(r[COL.place])) continue;
    // AT/CH: the municipality is admin3. Vienna's admin3 is its district.
    let name = r[COL.county]?.trim() || r[COL.place].split(",")[0].trim();
    if (/^Gemeindebezirk/.test(name)) name = r[COL.place].split(",")[0].trim();
    group(
      groups,
      `${country}|${r[COL.stateCode]}|${name}`,
      { country, state: r[COL.stateCode], stateName: r[COL.state], county: "", name },
      r,
    );
  }
}

/** Drops points far from the rest — "Hamburg Neuwerk" is an island 100 km out. */
function withoutOutliers(points) {
  if (points.length < 3) return points;
  const centre = [median(points.map((p) => p[1][0])), median(points.map((p) => p[1][1]))];
  const distances = points.map((p) => haversineKm(centre, p[1]));
  const limit = Math.max(25, 3 * median(distances));
  return points.filter((_, i) => distances[i] <= limit);
}

/**
 * A town's postcodes can straddle a county or state border ("Hamburg" has two
 * postcodes filed under Schleswig-Holstein). Same-named groups close to a bigger
 * one are folded into it; far-apart namesakes stay separate places.
 */
function mergeBorderFragments(places) {
  const byName = new Map();
  for (const p of places) {
    const key = `${p.country}|${p.name}`;
    byName.set(key, [...(byName.get(key) ?? []), p]);
  }
  const merged = [];
  for (const group of byName.values()) {
    const sorted = group.sort((a, b) => b.points.length - a.points.length);
    const kept = [];
    for (const p of sorted) {
      const host = kept.find((k) =>
        p.points.some(([, a]) => k.points.some(([, b]) => haversineKm(a, b) <= 25)),
      );
      if (host)
        host.points.push(...p.points.filter(([pc]) => !host.points.some(([h]) => h === pc)));
      else kept.push({ ...p, points: [...p.points] });
    }
    merged.push(...kept);
  }
  return merged;
}

const dir = mkdtempSync(join(tmpdir(), "geonames-"));
try {
  const groups = new Map();
  for (const country of COUNTRIES) {
    const text = download(country, dir);
    if (country === "DE") germanGroups(text, groups);
    else municipalityGroups(country, text, groups);
  }

  const places = mergeBorderFragments(
    [...groups.values()].map((g) => ({ ...g, points: withoutOutliers([...g.points]) })),
  );

  // Unique labels: AT/CH always say their country; a name used more than once
  // in a country gets its state, and its county if the state repeats too.
  const count = new Map();
  const add = (key) => count.set(key, (count.get(key) ?? 0) + 1);
  for (const p of places) {
    add(`${p.country}|${p.name}`);
    add(`${p.country}|${p.name}|${p.state}`);
  }
  for (const p of places) {
    const unique = count.get(`${p.country}|${p.name}`) === 1;
    const uniqueInState = count.get(`${p.country}|${p.name}|${p.state}`) === 1;
    const where = uniqueInState || !p.county ? p.stateName : p.county;
    if (p.country === "DE") p.label = unique ? p.name : `${p.name} (${where})`;
    else p.label = unique ? `${p.name} (${p.country})` : `${p.name} (${where}, ${p.country})`;
  }

  const lines = places
    .filter((p) => p.points.length > 0)
    .sort((a, b) => b.points.length - a.points.length || a.label.localeCompare(b.label))
    .map(
      (p) =>
        `${p.country}|${p.state}|${p.label}|${p.name}|` +
        p.points.map(([pc, [lat, lon]]) => `${pc}:${lat.toFixed(3)},${lon.toFixed(3)}`).join(";"),
    );

  const data = {
    attribution:
      "Postal code data © GeoNames (https://www.geonames.org), CC BY 4.0 — filtered and grouped into places.",
    built: new Date().toISOString().slice(0, 10),
    places: lines,
  };
  writeFileSync(OUT, JSON.stringify(data));
  console.log(`${lines.length} places → ${OUT.pathname}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
