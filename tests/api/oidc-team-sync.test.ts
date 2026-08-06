import { describe, expect, it } from "vitest";
import {
  getClaimAtPath,
  normalizeRoles,
  reconcileMappedTeamIds,
} from "../../apps/api/src/oidc-team-sync/service";

describe("OIDC team role claims", () => {
  it("reads nested claim paths", () => {
    expect(
      getClaimAtPath(
        { realm_access: { roles: ["developer"] } },
        "realm_access.roles",
      ),
    ).toEqual(["developer"]);
  });

  it("normalizes array and space-delimited roles", () => {
    expect([...normalizeRoles(["developer", 1, "admin"])]).toEqual([
      "developer",
      "admin",
    ]);
    expect([...normalizeRoles("developer admin")]).toEqual([
      "developer",
      "admin",
    ]);
  });

  it("removes stale mapped memberships and preserves unrelated memberships", () => {
    expect(
      reconcileMappedTeamIds(
        ["mapped-stale", "manual-team"],
        ["mapped-stale", "mapped-desired"],
        ["mapped-desired"],
      ),
    ).toEqual({
      add: ["mapped-desired"],
      remove: ["mapped-stale"],
    });
  });

  it("returns no roles for absent claims so mapped memberships are removed", () => {
    expect([
      ...normalizeRoles(getClaimAtPath({}, "realm_access.roles")),
    ]).toEqual([]);
  });
});
