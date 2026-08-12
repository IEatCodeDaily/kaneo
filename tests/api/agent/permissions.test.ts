import { describe, expect, it } from "vitest";
import { validatePermissions } from "../../../apps/api/src/agent";

/**
 * Agents are first-class members: a human user and an agent user are treated
 * identically, and access is decided by the member's ROLE, not by whether the
 * principal is a bot.
 *
 * This suite previously asserted the opposite — `{ task: ["delete"] }` was
 * expected to THROW, because agents were capped at a hardcoded allowlist
 * (board/task read+create+update, label read, organization read) no matter
 * what role their member row carried. That cap is gone; the validator now only
 * catches typos.
 */
describe("agent permission validation", () => {
  it("accepts an explicit least-privilege grant", () => {
    expect(
      validatePermissions({ board: ["read"], task: ["read", "create"] }),
    ).toEqual({ board: ["read"], task: ["read", "create"] });
  });

  it("accepts every action a role permits, including delete", () => {
    expect(validatePermissions({ task: ["delete"] })).toEqual({
      task: ["delete"],
    });
  });

  it("accepts team-scoped grants", () => {
    expect(validatePermissions({ team: ["read"] })).toEqual({ team: ["read"] });
  });

  // Still a real validator: unknown resources/actions and empty grants fail.
  it.each([undefined, {}, { user: ["read"] }, { task: [] }, { task: ["fly"] }])(
    "rejects missing or unknown grants: %j",
    (permissions) => {
      expect(() => validatePermissions(permissions)).toThrow();
    },
  );
});
