import { describe, expect, it } from "vitest";
import { extractDescriptionResources } from "./description-resources";

/**
 * #265: links and attachments in a task's description surface as resources.
 *
 * These are DERIVED from the description, never persisted, so the description
 * cannot drift from the resource list.
 */
describe("extractDescriptionResources", () => {
  it("finds markdown links and keeps their text as the title", () => {
    const result = extractDescriptionResources(
      "see [the design doc](https://example.com/doc) for details",
    );

    expect(result).toEqual([
      {
        id: "https://example.com/doc",
        url: "https://example.com/doc",
        title: "the design doc",
        kind: "link",
      },
    ]);
  });

  it("classifies markdown images as image resources, not links", () => {
    const result = extractDescriptionResources(
      "![screenshot](https://example.com/a.png)",
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe("image");
    expect(result[0]?.title).toBe("screenshot");
  });

  it("finds the editor's raw HTML image attachments", () => {
    // This is the exact shape Kaneo writes for an uploaded asset.
    const result = extractDescriptionResources(
      '<img src="https://kaneo.example/api/asset/abc123" alt="image">',
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.url).toBe("https://kaneo.example/api/asset/abc123");
    expect(result[0]?.kind).toBe("image");
  });

  it("finds bare URLs", () => {
    const result = extractDescriptionResources(
      "repro at https://github.com/owner/repo/issues/7",
    );

    expect(result.map((r) => r.url)).toEqual([
      "https://github.com/owner/repo/issues/7",
    ]);
  });

  it("does not treat trailing punctuation as part of the URL", () => {
    // A clickable resource ending in "." would 404.
    const result = extractDescriptionResources("see https://example.com/page.");

    expect(result[0]?.url).toBe("https://example.com/page");
  });

  it("dedupes a URL that appears both as a markdown link and bare", () => {
    const result = extractDescriptionResources(
      "[docs](https://example.com/x) and again https://example.com/x",
    );

    expect(result).toHaveLength(1);
    // The titled occurrence wins, so the label is not lost to the bare match.
    expect(result[0]?.title).toBe("docs");
  });

  it("falls back to the filename when there is no label", () => {
    const result = extractDescriptionResources(
      "https://example.com/files/report%20final.pdf",
    );

    expect(result[0]?.title).toBe("report final.pdf");
  });

  it("ignores non-http(s) URLs", () => {
    // Rendered as clickable anchors, so javascript:/data: would be an XSS vector.
    const result = extractDescriptionResources(
      "[click](javascript:alert(1)) and [d](data:text/html,hi) and [f](file:///etc/passwd)",
    );

    expect(result).toEqual([]);
  });

  /**
   * NEGATIVE CONTROLS: prove the extractor stays quiet when there is nothing to
   * find, so the assertions above are reacting to real matches rather than a
   * function that returns something for any input.
   */
  it("returns nothing for prose with no links", () => {
    expect(
      extractDescriptionResources("Just a plain description with no links."),
    ).toEqual([]);
  });

  it("returns nothing for empty, null, or undefined descriptions", () => {
    expect(extractDescriptionResources("")).toEqual([]);
    expect(extractDescriptionResources(null)).toEqual([]);
    expect(extractDescriptionResources(undefined)).toEqual([]);
  });

  it("does not invent a resource from markdown syntax with no URL", () => {
    expect(extractDescriptionResources("[empty]() and ![alt]()")).toEqual([]);
  });
});
