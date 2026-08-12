import { describe, expect, it } from "vitest";
import { getAvatarTone } from "./avatar-tone";

/**
 * #264 requires ONE colour per person on EVERY surface. The failure mode that
 * actually shipped before was per-call-site identity keys: a card keyed on
 * userId while a hover preview or group header keyed on the display name, so
 * the same human got two different colours across views.
 *
 * These assertions pin the contract that only a stable identifier may drive
 * the tone.
 */
describe("#264 cross-surface avatar tone consistency", () => {
  const userId = "tv8zd28v9nthir4yop7vu63k";
  const email = "ada@example.com";

  it("gives one person the same tone whether keyed by id alone or id+email", () => {
    // Kanban card passes (userId); members table passes (userId, email).
    expect(getAvatarTone(userId)).toBe(getAvatarTone(userId, email));
  });

  it("ignores display name when a stable id is present", () => {
    // A rename must never recolour the avatar.
    expect(getAvatarTone(userId, "Ada Lovelace")).toBe(
      getAvatarTone(userId, "A. Lovelace"),
    );
  });

  it("does not let a display name outrank the id", () => {
    const viaId = getAvatarTone(userId);
    const viaIdThenName = getAvatarTone(userId, "Someone Else Entirely");
    expect(viaIdThenName).toBe(viaId);
  });

  it("still colours identities that only expose a login handle", () => {
    // Repo surfaces only have a GitHub login, not a Kaneo user id.
    const tone = getAvatarTone("octocat");
    expect(tone).not.toBe("bg-muted text-muted-foreground");
    expect(getAvatarTone("octocat")).toBe(tone);
  });

  it("negative control: differing identities must not collapse to one tone", () => {
    const a = getAvatarTone("user-aaa");
    const b = getAvatarTone("user-bbb");
    const c = getAvatarTone("user-ccc");
    expect(new Set([a, b, c]).size).toBeGreaterThan(1);
  });
});
