import { describe, expect, it } from "vitest";
import {
  highestPrivilege,
  privilegeAllows,
  resolveDefaultPrivilege,
} from "../../apps/api/src/resource-access";

describe("resource access privilege lattice", () => {
  it("uses the highest team or individual privilege", () => {
    expect(highestPrivilege(["view", "manage", "edit"])).toBe("manage");
    expect(highestPrivilege(["edit", "view"])).toBe("edit");
    expect(highestPrivilege([])).toBe("none");
  });

  it("orders none < view < edit < manage", () => {
    expect(privilegeAllows("view", "view")).toBe(true);
    expect(privilegeAllows("view", "edit")).toBe(false);
    expect(privilegeAllows("edit", "view")).toBe(true);
    expect(privilegeAllows("edit", "manage")).toBe(false);
    expect(privilegeAllows("manage", "manage")).toBe(true);
  });
});

// Rewritten (not deleted) when the model changed from per-resource-TYPE
// overrides to per-RESOURCE baselines: each resource's own org_privilege wins,
// NULL follows the organization-wide default.
describe("organization default visibility resolution", () => {
  it("uses the resource's own org baseline when set", () => {
    expect(
      resolveDefaultPrivilege({
        resourceOrgPrivilege: "edit",
        defaultResourcePrivilege: "view",
      }),
    ).toBe("edit");
  });

  it("follows the org-wide default when the resource has no baseline", () => {
    expect(
      resolveDefaultPrivilege({
        resourceOrgPrivilege: null,
        defaultResourcePrivilege: "view",
      }),
    ).toBe("view");
  });

  it("supports hidden (none) per resource and org-wide", () => {
    expect(
      resolveDefaultPrivilege({
        resourceOrgPrivilege: "none",
        defaultResourcePrivilege: "manage",
      }),
    ).toBe("none");
    expect(
      resolveDefaultPrivilege({
        resourceOrgPrivilege: null,
        defaultResourcePrivilege: "none",
      }),
    ).toBe("none");
  });

  it("falls back to legacy manage when the organization row predates the column", () => {
    expect(
      resolveDefaultPrivilege({
        resourceOrgPrivilege: null,
        defaultResourcePrivilege: null,
      }),
    ).toBe("manage");
  });

  it("rejects garbage stored values instead of granting them", () => {
    expect(
      resolveDefaultPrivilege({
        resourceOrgPrivilege: "root",
        defaultResourcePrivilege: "superuser",
      }),
    ).toBe("manage");
  });
});
