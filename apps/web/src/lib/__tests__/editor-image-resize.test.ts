import { describe, expect, it } from "vitest";
import {
  clampImageWidth,
  imageNameFromUrl,
  imageTooltip,
  imageWrapperClass,
  MAX_IMAGE_WIDTH,
  MIN_IMAGE_WIDTH,
} from "../editor-image-resize";

describe("#54 imageTooltip", () => {
  it("prefers an explicit title", () => {
    expect(imageTooltip("Architecture diagram", "alt", "/api/asset/x")).toBe(
      "Architecture diagram",
    );
  });

  it("falls back to meaningful alt text", () => {
    expect(imageTooltip("", "Sequence diagram", "/api/asset/x")).toBe(
      "Sequence diagram",
    );
  });

  /**
   * The reported problem: markdown pasted as `![image](...)` gives every image
   * the alt text "image", so the tooltip said nothing useful.
   */
  it("ignores generic placeholder alt text", () => {
    for (const generic of ["image", "Image", "IMG", "screenshot", "photo"]) {
      expect(imageTooltip("", generic, "/api/asset/report-q3.png")).toBe(
        "report-q3.png",
      );
    }
  });

  it("uses the filename when there is no title or alt at all", () => {
    expect(imageTooltip(null, undefined, "/api/asset/diagram-1.png")).toBe(
      "diagram-1.png",
    );
  });

  /**
   * Legacy `![image](/api/asset/<cuid>)` markdown has no filename anywhere, and
   * the url ends in an opaque id. Showing that id would be noise, so the
   * tooltip degrades to a plain word instead.
   */
  it("does not show an opaque asset id", () => {
    expect(
      imageTooltip("", "image", "/api/asset/wkrgbs3xsbkfa6o2i1nezn1b"),
    ).toBe("Image");
  });

  // NEGATIVE CONTROL: a non-generic alt must NOT be replaced by the filename.
  it("does not override real alt text with the filename", () => {
    expect(imageTooltip("", "Login flow", "/api/asset/xyz.png")).toBe(
      "Login flow",
    );
  });
});

describe("imageNameFromUrl", () => {
  it("takes the last path segment when it looks like a filename", () => {
    expect(imageNameFromUrl("https://x.test/a/b/c.png")).toBe("c.png");
  });

  // NEGATIVE CONTROL: an extension-less segment is an opaque id, not a name.
  it("rejects an opaque id with no extension", () => {
    expect(imageNameFromUrl("/api/asset/abc123")).toBe("");
  });

  it("drops query strings and fragments", () => {
    expect(imageNameFromUrl("/api/asset/a.png?w=200#frag")).toBe("a.png");
  });

  it("decodes percent-encoded names", () => {
    expect(imageNameFromUrl("/api/asset/my%20file.png")).toBe("my file.png");
  });

  it("survives a malformed escape without throwing", () => {
    expect(() => imageNameFromUrl("/api/asset/%E0%A4%A")).not.toThrow();
  });

  it("returns an empty string for an empty url", () => {
    expect(imageNameFromUrl("")).toBe("");
  });

  it("keeps a real filename that also has a query string", () => {
    expect(imageNameFromUrl("/uploads/design%20v2.PNG?v=3")).toBe(
      "design v2.PNG",
    );
  });
});

describe("clampImageWidth", () => {
  it("keeps widths inside the bounds", () => {
    expect(clampImageWidth(500)).toBe(500);
    expect(clampImageWidth(1)).toBe(MIN_IMAGE_WIDTH);
    expect(clampImageWidth(99_999)).toBe(MAX_IMAGE_WIDTH);
  });

  it("respects a container-derived maximum", () => {
    expect(clampImageWidth(900, 600)).toBe(600);
  });

  it("falls back to the minimum for NaN", () => {
    expect(clampImageWidth(Number.NaN)).toBe(MIN_IMAGE_WIDTH);
  });
});

describe("imageWrapperClass", () => {
  it("marks the selected state", () => {
    expect(imageWrapperClass(true)).toContain("is-selected");
    expect(imageWrapperClass(false)).not.toContain("is-selected");
  });
});
