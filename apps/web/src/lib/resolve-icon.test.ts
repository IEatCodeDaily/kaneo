import { describe, expect, it } from "vitest";
import boardIcons from "@/constants/board-icons";
import { isEmojiIcon, isKnownIconValue, resolveIcon } from "./resolve-icon";

/**
 * #171: board/repo icons may be a lucide name OR an emoji.
 * #172: values already stored in the database (`github`, `Flask`, and icons
 * missing from the map) fell back to the generic glyph on every surface.
 */
describe("isEmojiIcon", () => {
  it.each(["🚀", "🎯", "🐛", "✨", "🛠️", "👍🏽", "👨‍💻", "🇮🇩"])(
    "accepts %s",
    (emoji) => {
      expect(isEmojiIcon(emoji)).toBe(true);
    },
  );

  // NEGATIVE CONTROL: icon names and junk must not be treated as emoji, or
  // every lucide name would render as text.
  it.each(["Rocket", "Layout", "github", "", "   ", "a", "1"])(
    "rejects %o",
    (value) => {
      expect(isEmojiIcon(value)).toBe(false);
    },
  );

  it("rejects long strings that merely start with an emoji", () => {
    expect(isEmojiIcon("🚀 this is a sentence, not an icon")).toBe(false);
  });
});

describe("resolveIcon", () => {
  it("resolves an exact lucide name", () => {
    const resolved = resolveIcon("Rocket");
    expect(resolved.kind).toBe("lucide");
    if (resolved.kind === "lucide") {
      expect(resolved.Icon).toBe(boardIcons.Rocket);
    }
  });

  it("resolves an emoji as an emoji", () => {
    const resolved = resolveIcon("🚀");
    expect(resolved).toEqual({ kind: "emoji", emoji: "🚀" });
  });

  /**
   * The #172 regression: these are real values from the board table that
   * rendered as the generic Layout glyph.
   */
  it.each([
    ["github", boardIcons.GitBranch],
    ["Flask", boardIcons.FlaskConical],
    ["rocket", boardIcons.Rocket],
    ["LAYOUT", boardIcons.Layout],
  ])("maps the stored value %s to a real icon", (value, expected) => {
    const resolved = resolveIcon(value);
    expect(resolved.kind).toBe("lucide");
    if (resolved.kind === "lucide") expect(resolved.Icon).toBe(expected);
  });

  /**
   * Icons users had actually chosen but which were missing from the map, so
   * they silently fell back. They are now exported.
   */
  it.each(["Cpu", "Factory", "Headset", "ShieldCheck", "Smartphone"])(
    "exposes %s, which real boards use",
    (value) => {
      const resolved = resolveIcon(value);
      expect(resolved.kind).toBe("lucide");
      if (resolved.kind === "lucide") {
        expect(resolved.Icon).not.toBe(boardIcons.Layout);
      }
    },
  );

  // NEGATIVE CONTROL: genuinely unknown values must still fall back, otherwise
  // the assertions above would pass for a resolver that invents icons.
  it.each(["not-an-icon", "zzzz", "", null, undefined])(
    "falls back to Layout for %o",
    (value) => {
      const resolved = resolveIcon(value);
      expect(resolved.kind).toBe("lucide");
      if (resolved.kind === "lucide") {
        expect(resolved.Icon).toBe(boardIcons.Layout);
      }
    },
  );
});

describe("isKnownIconValue", () => {
  it("is true for names, aliases and emoji", () => {
    for (const value of ["Rocket", "rocket", "github", "Flask", "🚀"]) {
      expect(isKnownIconValue(value)).toBe(true);
    }
  });

  it("is false for unknown values", () => {
    for (const value of ["nope", "", null, undefined]) {
      expect(isKnownIconValue(value)).toBe(false);
    }
  });
});
