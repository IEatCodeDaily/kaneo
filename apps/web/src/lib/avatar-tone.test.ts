import { describe, expect, it } from "vitest";
import { AVATAR_TONES, getAvatarTone } from "./avatar-tone";

describe("getAvatarTone", () => {
  it("returns a real tone from the shared palette", () => {
    expect(AVATAR_TONES).toContain(getAvatarTone("user-1"));
  });

  it("is stable for the same identity across calls", () => {
    expect(getAvatarTone("user-1")).toBe(getAvatarTone("user-1"));
  });

  it("is case and whitespace insensitive so one person keeps one colour", () => {
    expect(getAvatarTone("  Ada@Example.COM ")).toBe(
      getAvatarTone("ada@example.com"),
    );
  });

  it("prefers the first usable identity and ignores blanks", () => {
    expect(getAvatarTone(null, "   ", "user-7", "other@example.com")).toBe(
      getAvatarTone("user-7"),
    );
  });

  it("distinguishes different identities", () => {
    const tones = new Set(
      ["a@x.com", "b@x.com", "c@x.com", "d@x.com", "e@x.com", "f@x.com"].map(
        (email) => getAvatarTone(email),
      ),
    );
    expect(tones.size).toBeGreaterThan(1);
  });

  it("does not bucket unknown identities into a palette colour", () => {
    const tone = getAvatarTone(undefined, null, "");
    expect(AVATAR_TONES).not.toContain(tone);
    expect(tone).toBe("bg-muted text-muted-foreground");
  });
});
