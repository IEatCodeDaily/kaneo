import { describe, expect, it } from "vitest";
import {
  formatBlockedOrganizationsMessage,
  hasOwnerRole,
  type OrganizationMembershipSummary,
  planAccountDeletion,
} from "../../../apps/api/src/user/account-deletion";

function membership(
  overrides: Partial<OrganizationMembershipSummary> = {},
): OrganizationMembershipSummary {
  return {
    organizationId: "organization-1",
    organizationName: "Acme",
    isOwner: true,
    memberCount: 1,
    ownerCount: 1,
    ...overrides,
  };
}

describe("hasOwnerRole", () => {
  it("matches a plain owner role", () => {
    expect(hasOwnerRole("owner")).toBe(true);
  });

  it("matches owner inside a comma separated role list", () => {
    expect(hasOwnerRole("admin,owner")).toBe(true);
    expect(hasOwnerRole("member, Owner ")).toBe(true);
  });

  it("does not match other roles", () => {
    expect(hasOwnerRole("admin")).toBe(false);
    expect(hasOwnerRole("ownership")).toBe(false);
  });
});

describe("planAccountDeletion", () => {
  it("deletes an organization nobody else belongs to", () => {
    const plan = planAccountDeletion([membership()]);

    expect(plan.organizationIdsToDelete).toEqual(["organization-1"]);
    expect(plan.organizationIdsToLeave).toEqual([]);
    expect(plan.blockedOrganizationNames).toEqual([]);
  });

  it("blocks when the account is the only owner of a shared organization", () => {
    const plan = planAccountDeletion([
      membership({ memberCount: 3, ownerCount: 1 }),
    ]);

    expect(plan.blockedOrganizationNames).toEqual(["Acme"]);
    expect(plan.organizationIdsToDelete).toEqual([]);
    expect(plan.organizationIdsToLeave).toEqual([]);
  });

  it("leaves a shared organization that keeps another owner", () => {
    const plan = planAccountDeletion([
      membership({ memberCount: 3, ownerCount: 2 }),
    ]);

    expect(plan.organizationIdsToLeave).toEqual(["organization-1"]);
    expect(plan.blockedOrganizationNames).toEqual([]);
  });

  it("leaves organizations the account does not own", () => {
    const plan = planAccountDeletion([
      membership({ isOwner: false, memberCount: 4, ownerCount: 1 }),
    ]);

    expect(plan.organizationIdsToLeave).toEqual(["organization-1"]);
  });

  it("plans each organization independently", () => {
    const plan = planAccountDeletion([
      membership({ organizationId: "solo" }),
      membership({
        organizationId: "shared",
        organizationName: "Shared",
        memberCount: 2,
        ownerCount: 1,
      }),
      membership({
        organizationId: "guest",
        isOwner: false,
        memberCount: 5,
        ownerCount: 1,
      }),
    ]);

    expect(plan.organizationIdsToDelete).toEqual(["solo"]);
    expect(plan.blockedOrganizationNames).toEqual(["Shared"]);
    expect(plan.organizationIdsToLeave).toEqual(["guest"]);
  });

  it("returns an empty plan for an account without organizations", () => {
    expect(planAccountDeletion([])).toEqual({
      blockedOrganizationNames: [],
      organizationIdsToDelete: [],
      organizationIdsToLeave: [],
    });
  });
});

describe("formatBlockedOrganizationsMessage", () => {
  it("names a single organization", () => {
    expect(formatBlockedOrganizationsMessage(["Acme"])).toBe(
      'You are the only owner of "Acme". Transfer ownership or delete it before deleting your account.',
    );
  });

  it("joins several organizations", () => {
    expect(
      formatBlockedOrganizationsMessage(["Acme", "Globex", "Initech"]),
    ).toBe(
      'You are the only owner of "Acme", "Globex" and "Initech". Transfer ownership or delete them before deleting your account.',
    );
  });
});
