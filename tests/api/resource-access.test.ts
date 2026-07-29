import { describe, expect, it } from "vitest";
import {
  highestPrivilege,
  privilegeAllows,
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
