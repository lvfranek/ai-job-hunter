import { describe, expect, it } from "vitest";
import { parseDbTimestamp } from "./db-time";

describe("parseDbTimestamp", () => {
  it("reads a timestamp without offset as UTC", () => {
    expect(parseDbTimestamp("2026-10-03T15:11:47.511").toISOString()).toBe(
      "2026-10-03T15:11:47.511Z",
    );
  });

  it("accepts Postgres' space-separated form", () => {
    expect(parseDbTimestamp("2026-10-03 15:11:47").toISOString()).toBe("2026-10-03T15:11:47.000Z");
  });

  it("keeps an explicit offset", () => {
    expect(parseDbTimestamp("2026-10-03T17:11:47+02:00").toISOString()).toBe(
      "2026-10-03T15:11:47.000Z",
    );
    expect(parseDbTimestamp("2026-10-03T15:11:47Z").toISOString()).toBe("2026-10-03T15:11:47.000Z");
  });

  it("leaves a plain date alone", () => {
    expect(parseDbTimestamp("2026-10-03").toISOString()).toBe("2026-10-03T00:00:00.000Z");
  });
});
