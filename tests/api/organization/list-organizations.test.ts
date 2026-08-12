import { describe, expect, it, vi } from "vitest";

/**
 * Agent keys must be able to list organizations.
 *
 * `list_organizations` in the MCP server used to proxy the Better Auth route
 * `/api/auth/organization/list`, which is session-only: agent keys got
 * INVALID_API_KEY, so an agent could never discover the organization id that
 * every other org-scoped tool requires. The /api/organization endpoint serves
 * both principals; these tests pin its scoping rules.
 */

const mocks = vi.hoisted(() => {
  const rows: Record<string, unknown[]> = { agent: [], member: [] };
  return {
    rows,
    select: vi.fn(),
  };
});

vi.mock("../../../apps/api/src/database", () => {
  const agentChain = {
    from: () => ({ where: () => mocks.rows.agent }),
  };
  const memberChain = {
    from: () => ({ innerJoin: () => ({ where: () => mocks.rows.member }) }),
  };
  return {
    default: {
      select: (projection: Record<string, unknown>) =>
        "role" in projection ? memberChain : agentChain,
    },
    schema: {
      organizationTable: {
        id: "id",
        name: "name",
        slug: "slug",
        logo: "logo",
      },
      organizationMemberTable: {
        organizationId: "organizationId",
        userId: "userId",
        role: "role",
      },
    },
  };
});

import listOrganizations from "../../../apps/api/src/organization/controllers/list-organizations";

describe("listOrganizations", () => {
  it("agent key sees exactly its scoped organization", async () => {
    mocks.rows.agent = [{ id: "org-1", name: "NevrLabs", slug: "nevrlabs" }];
    const result = await listOrganizations(
      "user-1",
      JSON.stringify({ type: "agent", organizationId: "org-1" }),
    );
    expect(result).toEqual([
      { id: "org-1", name: "NevrLabs", slug: "nevrlabs" },
    ]);
  });

  it("plain user key falls back to membership listing", async () => {
    mocks.rows.member = [
      { id: "org-1", name: "A", slug: "a", logo: null, role: "owner" },
      { id: "org-2", name: "B", slug: "b", logo: null, role: "member" },
    ];
    const result = await listOrganizations("user-1", null);
    expect(result).toHaveLength(2);
  });

  it("malformed legacy metadata is treated as a user key, not an error", async () => {
    mocks.rows.member = [
      { id: "org-1", name: "A", slug: "a", logo: null, role: "member" },
    ];
    const result = await listOrganizations("user-1", "not-json{");
    expect(result).toHaveLength(1);
  });

  it("non-agent metadata does not scope", async () => {
    mocks.rows.member = [
      { id: "org-9", name: "Z", slug: "z", logo: null, role: "member" },
    ];
    const result = await listOrganizations(
      "user-1",
      JSON.stringify({ type: "integration", organizationId: "org-1" }),
    );
    expect(result).toEqual([
      { id: "org-9", name: "Z", slug: "z", logo: null, role: "member" },
    ]);
  });
});
