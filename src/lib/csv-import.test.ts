import { describe, expect, it } from "vitest";
import {
  CSV_TEMPLATE,
  detectSeparator,
  mapHeaders,
  parseApplicationsCsv,
  parseCsv,
  parseDate,
  parseStatus,
} from "@/lib/csv-import";

describe("parseCsv", () => {
  it("handles quoted fields with separators, quotes and newlines", () => {
    const text = 'a;b\n"x; y";"he said ""hi""\nbye"\r\n1;2';
    expect(parseCsv(text, ";")).toEqual([
      ["a", "b"],
      ["x; y", 'he said "hi"\nbye'],
      ["1", "2"],
    ]);
  });
});

describe("detectSeparator", () => {
  it("picks ; for German Excel and , otherwise", () => {
    expect(detectSeparator("Datum;Titel;Firma\n1,5;x;y")).toBe(";");
    expect(detectSeparator("Date,Title,Company\n")).toBe(",");
  });
});

describe("mapHeaders", () => {
  it("maps German headers and keeps Stellenanzeige as the link", () => {
    expect(
      mapHeaders([
        "Bewerbungsdatum",
        "Titel der Stellenanzeige",
        "Arbeitgeber",
        "Status",
        "Stellenanzeige",
        "Gehalt (optional)",
      ]),
    ).toEqual({ applied_at: 0, title: 1, company: 2, status: 3, url: 4, salary: 5 });
  });

  it("maps English headers", () => {
    expect(mapHeaders(["Company", "Job Title", "Date", "URL"])).toEqual({
      company: 0,
      title: 1,
      applied_at: 2,
      url: 3,
    });
  });
});

describe("parseDate", () => {
  it("reads German, slash and ISO dates", () => {
    expect(parseDate("03.09.2026")).toBe("2026-09-03");
    expect(parseDate("3.9.26")).toBe("2026-09-03");
    expect(parseDate("03/09/2026")).toBe("2026-09-03");
    expect(parseDate("2026-09-03")).toBe("2026-09-03");
  });

  it("rejects impossible dates", () => {
    expect(parseDate("31.02.2026")).toBeNull();
    expect(parseDate("next week")).toBeNull();
  });
});

describe("parseStatus", () => {
  it("maps German and English words", () => {
    expect(parseStatus("Beworben")).toBe("applied");
    expect(parseStatus("Absage erhalten")).toBe("rejected");
    expect(parseStatus("Vorstellungsgespräch")).toBe("interview");
    expect(parseStatus("Zusage")).toBe("offer");
    expect(parseStatus("")).toBe("applied");
    expect(parseStatus("???")).toBe("applied");
  });
});

describe("parseApplicationsCsv", () => {
  it("parses a German Excel export with BOM", () => {
    const csv =
      "﻿Datum;Titel;Arbeitgeber;Status;Link;Gehalt\n" +
      "01.09.2026;Frontend Dev;Acme GmbH;Absage;https://example.com/a;55k\n" +
      ";;Leer GmbH;;;\n" +
      "02.09.2026;Backend Dev;Beta AG;;;\n";
    const result = parseApplicationsCsv(csv);
    if ("error" in result) throw new Error(result.error);
    expect(result.rows).toEqual([
      {
        line: 2,
        ok: true,
        value: {
          title: "Frontend Dev",
          company: "Acme GmbH",
          status: "rejected",
          applied_at: "2026-09-01",
          url: "https://example.com/a",
          salary: "55k",
        },
      },
      {
        line: 3,
        ok: false,
        error: "Job title is required",
        raw: ["", "", "Leer GmbH", "", "", ""],
      },
      {
        line: 4,
        ok: true,
        value: {
          title: "Backend Dev",
          company: "Beta AG",
          status: "applied",
          applied_at: "2026-09-02",
          url: null,
          salary: null,
        },
      },
    ]);
  });

  it("explains a file without title/employer columns", () => {
    const result = parseApplicationsCsv("Foo,Bar\n1,2");
    expect(result).toEqual({
      error: "Couldn't find a job title and an employer column. Found: Foo, Bar",
    });
  });
});

describe("CSV_TEMPLATE", () => {
  it("imports cleanly, so its columns and formats match the importer", () => {
    const result = parseApplicationsCsv(CSV_TEMPLATE);
    if ("error" in result) throw new Error(result.error);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      ok: true,
      value: { applied_at: "2026-09-01", status: "applied", salary: "55–60k" },
    });
  });
});
