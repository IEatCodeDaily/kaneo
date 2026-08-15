import { describe, expect, it, vi } from "vitest";

/**
 * KFL-160: the assignee picker must group principals into Users / Agents / Teams.
 *
 * better-auth's organization `listMembers` hard-codes its user projection to
 * {id,name,email,image} (see better-auth/dist/plugins/organization/adapter.mjs),
 * so `user.role` — the only place agent-ness is recorded — is stripped before it
 * ever reaches the client. Kaneo therefore has to expose principals itself with
 * an explicit `kind` discriminator derived from userTable.role === "agent".
 */

const mocks = vi.hoisted(() => ({ rows: [] as unknown[] }));

vi.mock("../../../apps/api/src/database", () => ({
  default: {
    select: () => ({
      from: () => ({ innerJoin: () => ({ where: () => mocks.rows }) }),
    }),
  },
  schema: {},
}));

import getOrganizationPrincipals from "../../../apps/api/src/organization/controllers/get-organization-principals";

describe("getOrganizationPrincipals", () => {
  it("marks users whose role is 'agent' as kind=agent and everyone else as kind=user", async () => {
    mocks.rows = [
      {
        id: "u-1",
        name: "Ada",
        email: "ada@example.com",
        image: null,
        role: "user",
      },
      {
        id: "u-2",
        name: "Stellar",
        email: "stellar@agents.local",
        image: null,
        role: "agent",
      },
    ];

    const result = await getOrganizationPrincipals("org-1");

    expect(result).toEqual([
      {
        id: "u-1",
        name: "Ada",
        email: "ada@example.com",
        image: null,
        kind: "user",
      },
      {
        id: "u-2",
        name: "Stellar",
        email: "stellar@agents.local",
        image: null,
        kind: "agent",
      },
    ]);
  });

  it("treats a null/unset user role as a human user, not an agent", async () => {
    mocks.rows = [
      { id: "u-3", name: "NoRole", email: "n@e.com", image: null, role: null },
    ];

    const [principal] = await getOrganizationPrincipals("org-1");

    expect(principal.kind).toBe("user");
  });

  it("does not leak the raw role field to the client", async () => {
    mocks.rows = [
      { id: "u-4", name: "X", email: "x@e.com", image: null, role: "agent" },
    ];

    const [principal] = await getOrganizationPrincipals("org-1");

    expect(principal).not.toHaveProperty("role");
    expect(principal.kind).toBe("agent");
  });
});
