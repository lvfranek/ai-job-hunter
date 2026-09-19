import { describe, expect, it } from "vitest";
import { htmlToMarkdown, markdownFingerprint, normalizeBlockText } from "./text-format";

describe("normalizeBlockText", () => {
  it("collapses horizontal whitespace but keeps line breaks", () => {
    expect(normalizeBlockText("a   b\nc\t\td")).toBe("a b\nc d");
  });

  it("caps runs of blank lines at one", () => {
    expect(normalizeBlockText("a\n\n\n\n\nb")).toBe("a\n\nb");
  });

  it("trims leading/trailing whitespace around line breaks", () => {
    expect(normalizeBlockText("a \n b")).toBe("a\nb");
  });
});

describe("htmlToMarkdown", () => {
  it("returns an empty string for null/undefined input", () => {
    expect(htmlToMarkdown(null)).toBe("");
    expect(htmlToMarkdown(undefined)).toBe("");
  });

  it("converts headings, bold and lists to the Markdown subset", () => {
    const html = "<h2>Dein Profil</h2><ul><li>React</li><li>TypeScript</li></ul>";
    expect(htmlToMarkdown(html)).toBe("## Dein Profil\n\n- React\n- TypeScript");
  });

  it("strips literal ** from source text so it can't invert emphasis", () => {
    expect(htmlToMarkdown("**<strong>PartSpace</strong>")).toBe("**PartSpace**");
  });

  it("removes inline tags without inserting a spurious space", () => {
    expect(htmlToMarkdown("<strong>Senior</strong>Engineer")).toBe("**Senior**Engineer");
  });

  it("decodes named and numeric HTML entities", () => {
    expect(htmlToMarkdown("Cafe&nbsp;&amp;&nbsp;Bar &euro;50 &#65;&#x42;")).toBe(
      "Cafe & Bar €50 AB",
    );
  });

  it("drops script/style tags including their contents", () => {
    expect(htmlToMarkdown("<p>keep</p><script>evil()</script>")).toBe("keep");
  });

  it("removes emphasis markers left wrapping nothing", () => {
    expect(htmlToMarkdown("<strong></strong>text")).toBe("text");
  });
});

describe("markdownFingerprint", () => {
  it("strips markers and normalizes case/whitespace for comparison", () => {
    const a = markdownFingerprint("## Senior **Engineer**");
    const b = markdownFingerprint("senior engineer");
    expect(a).toBe(b);
  });

  it("strips leading list bullets", () => {
    expect(markdownFingerprint("- React\n- TypeScript")).toBe("react typescript");
  });
});
