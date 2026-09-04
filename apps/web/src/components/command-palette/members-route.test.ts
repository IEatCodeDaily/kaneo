import { describe, expect, it } from "vitest";
import { getOrganizationMembersRoute } from "./members-route";

describe("getOrganizationMembersRoute", () => {
  it("targets the registered organization-scoped Members and Teams page", () => {
    expect(getOrganizationMembersRoute("nevrlabs")).toEqual({
      to: "/dashboard/organization/$organizationSlug/members",
      params: { organizationSlug: "nevrlabs" },
    });
  });
});
