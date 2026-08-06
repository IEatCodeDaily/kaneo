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

describe("organization default visibility resolution", () => {
  it("uses the per-type override when present", () => {
    expect(
      resolveDefaultPrivilege({
        resourceType: "board",
        defaultResourcePrivilege: "view",
        resourceDefaultOverrides: { board: "edit" },
      }),
    ).toBe("edit");
  });

  it("inherits the org-wide default when the type has no override", () => {
    expect(
      resolveDefaultPrivilege({
        resourceType: "repo",
        defaultResourcePrivilege: "view",
        resourceDefaultOverrides: { board: "edit" },
      }),
    ).toBe("view");
  });

  it("supports hidden (none) as both override and org-wide default", () => {
    expect(
      resolveDefaultPrivilege({
        resourceType: "table",
        defaultResourcePrivilege: "manage",
        resourceDefaultOverrides: { table: "none" },
      }),
    ).toBe("none");
    expect(
      resolveDefaultPrivilege({
        resourceType: "board",
        defaultResourcePrivilege: "none",
        resourceDefaultOverrides: {},
      }),
    ).toBe("none");
  });

  it("falls back to legacy manage when the organization row predates the column", () => {
    expect(
      resolveDefaultPrivilege({
        resourceType: "board",
        defaultResourcePrivilege: null,
        resourceDefaultOverrides: null,
      }),
    ).toBe("manage");
  });

  it("rejects garbage stored values instead of granting them", () => {
    expect(
      resolveDefaultPrivilege({
        resourceType: "board",
        defaultResourcePrivilege: "superuser",
        resourceDefaultOverrides: { board: "root" },
      }),
    ).toBe("manage");
  });
});
