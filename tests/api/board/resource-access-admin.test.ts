import { describe, expect, it } from "vitest";
import { hasOrganizationWideResourceAccess } from "../../../apps/api/src/resource-access-roles";

// Regression for the Kaneo Test "Board not found" bug: an organization admin
// (membership role "admin") was capped by board-level resource grants because
// getResourcePrivilege only bypassed grants for "owner". Capability follows
// role -- an org admin gets manage on every board, exactly like an owner.
describe("hasOrganizationWideResourceAccess", () => {
  it.each([
    ["admin", "member"], // system admin
    ["agent", "owner"], // org owner
    ["agent", "admin"], // org admin -- the previously-broken case
  ])(
    "grants org-wide access for %s user / %s member",
    (userRole, membershipRole) => {
      expect(hasOrganizationWideResourceAccess(userRole, membershipRole)).toBe(
        true,
      );
    },
  );

  it("does not bypass grants for an ordinary member", () => {
    expect(hasOrganizationWideResourceAccess("agent", "member")).toBe(false);
  });
});
