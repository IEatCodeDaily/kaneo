import { describe, expect, it } from "vitest";
import labelColors, {
  LABEL_COLOR_FALLBACK,
  resolveLabelColor,
} from "./label-colors";

/**
 * #169: the same label rendered a different colour depending on which dropdown
 * you opened.
 *
 * Label colours arrive from two sources:
 *   - Kaneo-native labels store a named token (`pink`, `green`, `purple`);
 *   - GitHub-synced labels store raw hex (`#0969da`, `#1d76db`, `#8b5cf6`).
 *
 * Surfaces that only looked up the named tokens fell through to grey for every
 * synced label, while the board chips resolved the hex correctly.
 */
describe("resolveLabelColor", () => {
  it("maps every named token to its themed colour", () => {
    for (const { value, color } of labelColors) {
      expect(resolveLabelColor(value)).toBe(color);
    }
  });

  /**
   * The regression. These are the real stored values from the labels that
   * rendered grey in the create-ticket shortcut.
   */
  it.each([
    ["#0969da", "qa-sync-test"],
    ["#1d76db", "sync-alpha / sync-beta"],
    ["#8b5cf6", "ai-verified"],
  ])("keeps synced hex %s (%s) instead of falling back to grey", (hex) => {
    const resolved = resolveLabelColor(hex);
    expect(resolved).toBe(hex);
    expect(resolved).not.toBe(LABEL_COLOR_FALLBACK);
  });

  it("accepts hex stored without the leading hash", () => {
    expect(resolveLabelColor("0969da")).toBe("#0969da");
  });

  it("accepts shorthand hex", () => {
    expect(resolveLabelColor("#abc")).toBe("#abc");
  });

  // NEGATIVE CONTROL: junk must still fall back, otherwise the assertions
  // above would pass for an implementation that echoes its input.
  it("falls back to grey for values CSS cannot paint", () => {
    for (const junk of ["not-a-colour", "#12345", "rgb(", "zzz"]) {
      expect(resolveLabelColor(junk)).toBe(LABEL_COLOR_FALLBACK);
    }
  });

  it("falls back to grey for empty and missing values", () => {
    expect(resolveLabelColor("")).toBe(LABEL_COLOR_FALLBACK);
    expect(resolveLabelColor(null)).toBe(LABEL_COLOR_FALLBACK);
    expect(resolveLabelColor(undefined)).toBe(LABEL_COLOR_FALLBACK);
  });

  // A named token must win over CSS's own colour keywords, so `purple` stays
  // the themed violet rather than the browser's `purple`.
  it("prefers the themed token over the CSS keyword of the same name", () => {
    expect(resolveLabelColor("purple")).toBe("var(--color-violet-500)");
    expect(resolveLabelColor("green")).toBe("var(--color-green-600)");
    expect(resolveLabelColor("red")).toBe("var(--color-red-600)");
  });
});
