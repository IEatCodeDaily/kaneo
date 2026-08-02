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

/**
 * #175 / #169: the palette gained hues so a label can be the colour its name
 * implies (a `bug` had to sit on rose, which reads pink).
 *
 * `value` is persisted, so the original entries are frozen: renaming or
 * repointing one silently repaints every label already stored with it.
 */
describe("#175 palette additions are backwards compatible", () => {
  /** Colour identities that existed before #175 and must never move. */
  const FROZEN: Record<string, string> = {
    gray: "var(--color-stone-500)",
    "dark-gray": "var(--color-slate-500)",
    purple: "var(--color-violet-500)",
    teal: "var(--color-emerald-600)",
    green: "var(--color-green-600)",
    yellow: "var(--color-amber-600)",
    orange: "var(--color-orange-600)",
    pink: "var(--color-rose-600)",
    red: "var(--color-red-600)",
  };

  it("keeps every pre-existing value pointing at the same colour", () => {
    for (const [value, color] of Object.entries(FROZEN)) {
      expect(resolveLabelColor(value)).toBe(color);
    }
  });

  it("exposes the new hues", () => {
    for (const value of [
      "blossom",
      "honey",
      "lime",
      "emerald",
      "lagoon",
      "sky",
      "ocean",
      "indigo",
      "violet",
      "orchid",
      "cocoa",
    ]) {
      const resolved = resolveLabelColor(value);
      expect(resolved).not.toBe(LABEL_COLOR_FALLBACK);
      expect(resolved).toMatch(/^var\(--color-/);
    }
  });

  it("gives every entry a distinct value and a themed colour", () => {
    const values = labelColors.map((c) => c.value);
    expect(new Set(values).size).toBe(values.length);
    for (const entry of labelColors) {
      expect(entry.color).toMatch(/^var\(--color-/);
      expect(entry.label.length).toBeGreaterThan(0);
    }
  });

  // `red` (Crimson) and `pink` (Rose) are adjacent; a `bug` label moved from
  // pink to red, so the two must stay visually distinguishable.
  it("keeps crimson and rose as different colours", () => {
    expect(resolveLabelColor("red")).not.toBe(resolveLabelColor("pink"));
  });
});
