import { describe, expect, it } from "vitest";
import {
  mapArbeitsagenturJob,
  mapIndeedJob,
  mapLinkedinJob,
  mapStepstoneJob,
  mapXingJob,
} from "./apify";

const base = { url: "https://example.com/job", title: "Developer" };
const location = (job: ReturnType<typeof mapIndeedJob>) => ({
  location: job.location,
  postal_code: job.postal_code,
  country_code: job.country_code,
  latitude: job.latitude,
  longitude: job.longitude,
});

describe("job board locations", () => {
  it("reads Indeed's location object", () => {
    const job = mapIndeedJob({
      ...base,
      location: {
        city: "Hamburg",
        postalCode: "22765",
        countryCode: "DE",
        latitude: 53.55,
        longitude: 9.93,
      },
    });
    expect(location(job)).toEqual({
      location: "Hamburg",
      postal_code: "22765",
      country_code: "DE",
      latitude: 53.55,
      longitude: 9.93,
    });
  });

  it("reads LinkedIn's and Stepstone's location strings", () => {
    expect(mapLinkedinJob({ ...base, location: "Hamburg, Hamburg, Germany" }).location).toBe(
      "Hamburg, Hamburg, Germany",
    );
    expect(mapStepstoneJob({ ...base, location: { location: "Norderstedt" } }).location).toBe(
      "Norderstedt",
    );
  });

  it("joins Xing's extra locations into one list", () => {
    const job = mapXingJob({
      ...base,
      location: "Hamburg",
      locations: ["Hamburg", "Berlin"],
      location_zip: 20095,
      location_country_code: "DE",
    });
    expect(job.location).toBe("Hamburg | Berlin");
    expect(job.postal_code).toBe("20095");
    expect(job.country_code).toBe("DE");
  });

  it("reads the Arbeitsagentur's postcode and coordinates", () => {
    const job = mapArbeitsagenturJob({
      portalUrl: base.url,
      title: base.title,
      location: "Berlin",
      postalCode: "10178",
      lat: "52.52",
      lng: 13.41,
    });
    expect(location(job)).toEqual({
      location: "Berlin",
      postal_code: "10178",
      country_code: "DE",
      latitude: 52.52,
      longitude: 13.41,
    });
  });

  it("leaves a missing or reshaped location empty instead of failing", () => {
    expect(location(mapIndeedJob({ ...base, location: 42 }))).toEqual({
      location: null,
      postal_code: null,
      country_code: null,
      latitude: null,
      longitude: null,
    });
    expect(mapXingJob({ ...base }).location).toBeNull();
  });
});
