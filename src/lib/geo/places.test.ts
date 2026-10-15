import { describe, expect, it } from "vitest";
import data from "./places-dach.json";
import { closestKm, haversineKm } from "./distance";
import {
  buildPlaceIndex,
  findPlacesInText,
  resolveHomes,
  resolveJobPlaces,
  resolveLocationText,
  resolvePlace,
  searchPlaces,
  suggestPlaces,
} from "./places";

const index = buildPlaceIndex(data);
const labels = (text: string, country?: "DE" | "AT" | "CH") =>
  resolveLocationText(index, text, country).map((p) => p.label);
const place = (text: string) => resolvePlace(index, text)!;
const job = (fields: Partial<Parameters<typeof resolveJobPlaces>[1]> = {}) => ({
  description: null,
  location: null,
  postal_code: null,
  country_code: null,
  latitude: null,
  longitude: null,
  ...fields,
});

describe("distance", () => {
  it("measures straight-line distance", () => {
    expect(haversineKm([53.551, 9.993], [48.137, 11.575])).toBeGreaterThan(600);
    expect(haversineKm([53.551, 9.993], [48.137, 11.575])).toBeLessThan(625);
  });

  it("measures from a city's area, not its centre", () => {
    const hamburg = place("Hamburg").points;
    expect(closestKm(hamburg, hamburg)).toBe(0);
    // Norderstedt borders Hamburg but its centre is ~17 km from Hamburg's.
    expect(closestKm(hamburg, place("Norderstedt").points)).toBeLessThan(6);
    expect(closestKm(hamburg, place("München").points)).toBeGreaterThan(550);
  });
});

describe("the place data", () => {
  it("keeps labels unique and company postcodes out", () => {
    const all = index.places.map((p) => p.label);
    expect(new Set(all).size).toBe(all.length);
    expect(all.some((l) => /GmbH|Postfach/.test(l))).toBe(false);
  });

  it("drops far-off points like the island of Neuwerk from Hamburg", () => {
    const cuxhaven = place("Cuxhaven").points;
    expect(closestKm(place("Hamburg").points, cuxhaven)).toBeGreaterThan(60);
  });
});

describe("resolveLocationText", () => {
  it("reads the formats job boards use", () => {
    expect(labels("Hamburg")).toEqual(["Hamburg"]);
    expect(labels("22765 Hamburg")).toEqual(["Hamburg"]);
    expect(labels("D-20095 Hamburg")).toEqual(["Hamburg"]);
    expect(labels("Hamburg, Hamburg, Germany")).toEqual(["Hamburg"]);
    expect(labels("Munich, Bavaria, Germany")).toEqual(["München"]);
    expect(labels("Hamburg-Altona")).toEqual(["Hamburg"]);
    expect(labels("Hamburg (Altona)")).toEqual(["Hamburg"]);
    expect(labels("Hamburg Metropolitan Area")).toEqual(["Hamburg"]);
    expect(labels("Großraum München")).toEqual(["München"]);
  });

  it("gives a postcode its exact point", () => {
    const [hit] = resolveLocationText(index, "22765 Hamburg");
    expect(hit.points).toHaveLength(1);
  });

  it("tells Frankfurt am Main and Frankfurt (Oder) apart", () => {
    expect(labels("Frankfurt")).toEqual(["Frankfurt am Main"]);
    expect(labels("Frankfurt, Hessen, Deutschland")).toEqual(["Frankfurt am Main"]);
    expect(labels("Frankfurt a.M.")).toEqual(["Frankfurt am Main"]);
    expect(labels("Frankfurt/Main")).toEqual(["Frankfurt am Main"]);
    expect(labels("Frankfurt (Oder)")).toEqual(["Frankfurt (Oder)"]);
  });

  it("prefers the bigger place for an ambiguous name", () => {
    expect(labels("Halle")).toEqual(["Halle (Sachsen-Anhalt)"]);
    expect(labels("Salzburg")).toEqual(["Salzburg (AT)"]);
  });

  it("accepts other spellings and English names", () => {
    expect(labels("Muenchen")).toEqual(["München"]);
    expect(labels("Munchen")).toEqual(["München"]);
    expect(labels("Dusseldorf")).toEqual(["Düsseldorf"]);
    expect(labels("Cologne")).toEqual(["Köln"]);
    expect(labels("Vienna, Austria")).toEqual(["Wien (AT)"]);
    expect(labels("Zurich")).toEqual(["Zürich (CH)"]);
    expect(labels("St. Pölten")).toEqual(labels("Sankt Pölten"));
    expect(labels("St. Pölten")).toHaveLength(1);
  });

  it("reads a list of cities as several places", () => {
    expect(labels("Hamburg, Berlin, München")).toEqual(["Hamburg", "Berlin", "München"]);
    expect(labels("Hamburg | Köln")).toEqual(["Hamburg", "Köln"]);
    expect(labels("Hamburg oder Berlin")).toEqual(["Hamburg", "Berlin"]);
  });

  it("needs a country or a city for a four-digit postcode", () => {
    expect(labels("1010")).toEqual([]);
    expect(labels("1010 Wien")).toEqual(["Wien (AT)"]);
    expect(labels("1010", "AT")).toEqual(["Wien (AT)"]);
    expect(labels("CH-8001 Zürich")).toEqual(["Zürich (CH)"]);
  });

  it("finds no city in country-level or remote locations", () => {
    for (const text of ["Germany", "Deutschland", "bundesweit", "Remote", "Home-Office", "EMEA"]) {
      expect(labels(text)).toEqual([]);
    }
    expect(labels("Amsterdam, Netherlands")).toEqual([]);
    expect(labels("Hamburg (Remote)")).toEqual(["Hamburg"]);
  });
});

describe("resolveJobPlaces", () => {
  it("takes the first source that resolves, in order", () => {
    // Postcode beats the city name.
    expect(
      resolveJobPlaces(index, job({ postal_code: "22765", location: "Berlin" }))[0].points,
    ).toHaveLength(1);
    // The board's city beats its coordinates (often just the city centre).
    expect(
      resolveJobPlaces(index, job({ location: "Berlin", latitude: 48.1, longitude: 11.5 })).map(
        (p) => p.label,
      ),
    ).toEqual(["Berlin"]);
    // Coordinates for a city the data lacks.
    expect(
      resolveJobPlaces(index, job({ location: "Amsterdam", latitude: 52.37, longitude: 4.9 })),
    ).toEqual([{ label: "Amsterdam", points: [[52.37, 4.9]] }]);
    // The model's cities only when the board said nothing usable.
    expect(
      resolveJobPlaces(index, job({ location: "Germany", description: "Büro in Köln" }), [
        "Köln",
      ]).map((p) => p.label),
    ).toEqual(["Köln"]);
    expect(
      resolveJobPlaces(index, job({ location: "Hamburg" }), ["München"]).map((p) => p.label),
    ).toEqual(["Hamburg"]);
  });

  it("returns nothing when no source names a place", () => {
    expect(resolveJobPlaces(index, job({ location: "Remote" }))).toEqual([]);
  });
});

describe("findPlacesInText", () => {
  const footer = `Ihre Ansprechpartnerin: Dr. Anja Ebersbach
CEO Finanzen & Personal Telefon: +49 (0)941 660 800

Hallo Welt! GmbH Bruderwöhrdstraße 29 93055 Regensburg Germany`;

  it("reads the address at the end of a posting", () => {
    const [place] = findPlacesInText(index, footer);
    expect(place.label).toBe("Regensburg");
    expect(place.points).toHaveLength(1);
  });

  it("never takes a phone number or salary for a postcode", () => {
    expect(findPlacesInText(index, "Telefon: +49 (0)941 660 800, Gehalt 55000 Euro")).toEqual([]);
    // A real postcode, but the word after it isn't its city.
    expect(findPlacesInText(index, "Bis zu 20095 Bewerbungen")).toEqual([]);
  });

  it("reads Standort lines and longer city names", () => {
    expect(findPlacesInText(index, "Standort: Bremen").map((p) => p.label)).toEqual(["Bremen"]);
    expect(
      findPlacesInText(index, "Musterweg 1, 60311 Frankfurt am Main").map((p) => p.label),
    ).toEqual(["Frankfurt am Main"]);
    expect(findPlacesInText(index, "Arbeitsort: Oldenburg (Oldb)").map((p) => p.label)).toEqual([
      "Oldenburg",
    ]);
  });

  it("falls back to a city the model inferred when the posting has no address", () => {
    const inferred = job({
      description: "ansässig im Science Park der Universität des Saarlandes",
    });
    expect(resolveJobPlaces(index, inferred, ["Saarbrücken"]).map((p) => p.label)).toEqual([
      "Saarbrücken",
    ]);
  });

  it("prefers an address in the posting over a city the posting never names", () => {
    const withAddress = job({ description: footer });
    expect(resolveJobPlaces(index, withAddress).map((p) => p.label)).toEqual(["Regensburg"]);
    // The model's city counts only when the posting names it.
    expect(resolveJobPlaces(index, withAddress, ["Hamburg"]).map((p) => p.label)).toEqual([
      "Regensburg",
    ]);
    expect(
      resolveJobPlaces(index, { ...withAddress, description: `Standort Bremen. ${footer}` }, [
        "Bremen",
      ]).map((p) => p.label),
    ).toEqual(["Bremen"]);
    expect(
      resolveJobPlaces(index, { ...withAddress, location: "Hamburg" }).map((p) => p.label),
    ).toEqual(["Hamburg"]);
  });
});

describe("homes, search and suggestions", () => {
  it("resolves the candidate's cities and reports the rest", () => {
    const { homes, unresolved } = resolveHomes(index, [
      { place: "Hamburg", radius_km: 10 },
      { place: "Berlin, Germany (or remote within the EU)", radius_km: 25 },
      { place: "Atlantis", radius_km: 5 },
    ]);
    expect(homes.map((h) => [h.label, h.radiusKm])).toEqual([
      ["Hamburg", 10],
      ["Berlin", 25],
    ]);
    expect(homes[0].points.length).toBeGreaterThan(50);
    expect(unresolved).toEqual(["Atlantis"]);
  });

  it("autocompletes bigger places first", () => {
    const hits = searchPlaces(index, "Ham");
    expect(hits[0]).toBe("Hamburg");
    expect(hits.length).toBeLessThanOrEqual(8);
    expect(searchPlaces(index, "Vienna")[0]).toBe("Wien (AT)");
    expect(searchPlaces(index, "H")).toEqual([]);
  });

  it("suggests close spellings for a typo", () => {
    expect(suggestPlaces(index, "Hamburk")[0]).toBe("Hamburg");
  });
});
