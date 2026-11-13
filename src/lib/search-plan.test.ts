import { describe, expect, it } from "vitest";
import data from "./geo/places-dach.json";
import { buildPlaceIndex, resolveHomes } from "./geo/places";
import {
  buildArbeitsagenturInputs,
  buildIndeedInputs,
  buildLinkedinInputs,
  buildStepstoneInputs,
  buildXingInputs,
  stepstoneRadius,
} from "./apify";
import {
  buildSearchPlan,
  describeSearchPlan,
  resultsPerSearch,
  type SearchArea,
} from "./search-plan";
import type { Settings } from "./types";

const index = buildPlaceIndex(data);
const homes = (...places: string[]) =>
  resolveHomes(
    index,
    places.map((place) => ({ place, radius_km: 25 })),
  ).homes;

describe("buildSearchPlan", () => {
  it("searches only Germany with the remote filter when only remote is fine", () => {
    const plan = buildSearchPlan({ remote_ok: true, office_ok: false }, homes("Hamburg"));
    expect(plan.areas).toEqual([{ kind: "remote" }]);
  });

  it("searches Germany remote plus each city, once per overlapping pair", () => {
    // Oldenburg and Bremen are ~40 km apart: their 25 km circles overlap, and
    // the bigger city is the one searched.
    const plan = buildSearchPlan(
      { remote_ok: true, office_ok: true },
      homes("Oldenburg", "Bremen", "Hamburg"),
    );
    expect(plan.areas).toEqual([
      { kind: "remote" },
      { kind: "place", place: "Bremen", radiusKm: 25 },
      { kind: "place", place: "Hamburg", radiusKm: 25 },
    ]);
    expect(plan.skipped).toEqual([{ place: "Oldenburg", coveredBy: "Bremen" }]);
  });

  it("searches only the cities when only office work is fine", () => {
    const plan = buildSearchPlan({ remote_ok: false, office_ok: true }, homes("Bremen", "Hamburg"));
    expect(plan.areas.map((a) => a.kind)).toEqual(["place", "place"]);
  });

  it("searches all of Germany without a filter when no city is given", () => {
    expect(buildSearchPlan({ remote_ok: true, office_ok: true }, []).areas).toEqual([
      { kind: "germany" },
    ]);
    expect(buildSearchPlan({ remote_ok: false, office_ok: true }, []).areas).toEqual([
      { kind: "germany" },
    ]);
  });

  it("describes the plan in one line", () => {
    const plan = buildSearchPlan(
      { remote_ok: true, office_ok: true },
      homes("Oldenburg", "Bremen", "Hamburg"),
    );
    expect(describeSearchPlan(plan)).toBe(
      "Searching remote jobs across Germany + on-site/hybrid jobs in Bremen (25 km) and Hamburg (25 km). Oldenburg overlaps Bremen and is searched with it.",
    );
  });

  it("fetches half as many results around a city, at least 5", () => {
    const place: SearchArea = { kind: "place", place: "Hamburg", radiusKm: 25 };
    expect(resultsPerSearch({ kind: "remote" }, 20)).toBe(20);
    expect(resultsPerSearch(place, 20)).toBe(10);
    expect(resultsPerSearch(place, 6)).toBe(5);
  });
});

describe("portal inputs per area", () => {
  const settings = { scraper_max_posting_age_days: 7 } as Settings;
  const remote = { keyword: "AI Developer", area: { kind: "remote" } as SearchArea, limit: 20 };
  const hamburg = {
    keyword: "AI Developer",
    area: { kind: "place", place: "Hamburg", radiusKm: 25 } as SearchArea,
    limit: 10,
  };

  it("uses each board's remote filter for the remote search", () => {
    expect(buildIndeedInputs(settings, remote)).toMatchObject({ location: "remote", limit: 20 });
    expect(buildLinkedinInputs(settings, remote)).toMatchObject({
      location: "Germany",
      remote: ["2"],
    });
    expect(buildStepstoneInputs(settings, remote)).toMatchObject({ wfh: "2", radius: undefined });
    expect(buildXingInputs(settings, remote)).toMatchObject({ keyword: "AI Developer remote" });
    expect(buildArbeitsagenturInputs(settings, remote)).toMatchObject({
      location: undefined,
      remoteOnly: true,
    });
  });

  it("searches a city with its radius and no remote filter", () => {
    expect(buildIndeedInputs(settings, hamburg)).toMatchObject({ location: "Hamburg", limit: 10 });
    expect(buildLinkedinInputs(settings, hamburg)).toMatchObject({
      location: "Hamburg",
      remote: undefined,
    });
    expect(buildStepstoneInputs(settings, hamburg)).toMatchObject({
      location: "Hamburg",
      radius: "30",
      wfh: undefined,
    });
    expect(buildXingInputs(settings, hamburg)).toMatchObject({
      keyword: "AI Developer",
      location: "Hamburg",
      results_wanted: 10,
    });
    expect(buildArbeitsagenturInputs(settings, hamburg)).toMatchObject({
      location: "Hamburg",
      radius: 25,
      remoteOnly: false,
      maxResults: 10,
    });
  });

  it("rounds a radius up to Stepstone's next choice", () => {
    expect(stepstoneRadius(25)).toBe("30");
    expect(stepstoneRadius(10)).toBe("10");
    expect(stepstoneRadius(150)).toBe("100");
  });
});
