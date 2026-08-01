import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { invalidateAgentMembershipQueries } from "../invalidate-agent-membership-queries";

/**
 * #123: removing an agent left it visible on the Members page until a manual
 * refresh, because the mutation invalidated only `["agents", orgId]`.
 *
 * These drive a real QueryClient and assert which cached queries end up stale,
 * rather than asserting that some spy was called with a key — a spy assertion
 * would pass even if the key never matched anything in the cache.
 */
const ORG = "org-1";
const OTHER_ORG = "org-2";

function seed() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  const keys = {
    agents: ["agents", ORG],
    fullOrganization: ["organization", "full", ORG],
    activeMembers: ["active-organization-members", ORG],
    // The real Members table key carries paging/sort args after the org id.
    pagedMembers: [
      "organization-members",
      ORG,
      25,
      0,
      "createdAt",
      "desc",
      undefined,
      undefined,
      undefined,
    ],
    otherOrgMembers: ["organization", "full", OTHER_ORG],
    unrelated: ["boards", ORG],
  } as const;

  for (const key of Object.values(keys)) {
    client.setQueryData(key, { seeded: true });
  }
  return { client, keys };
}

const isStale = (client: QueryClient, key: readonly unknown[]) =>
  client.getQueryState(key)?.isInvalidated === true;

describe("#123 invalidateAgentMembershipQueries", () => {
  it("invalidates the Members page query", async () => {
    const { client, keys } = seed();
    await invalidateAgentMembershipQueries(client, ORG);
    expect(isStale(client, keys.fullOrganization)).toBe(true);
  });

  it("invalidates the paginated members table despite its extra key args", async () => {
    const { client, keys } = seed();
    await invalidateAgentMembershipQueries(client, ORG);
    // Prefix matching is the point: an exact-key invalidation would miss this.
    expect(isStale(client, keys.pagedMembers)).toBe(true);
  });

  it("still invalidates the agents list and member pickers", async () => {
    const { client, keys } = seed();
    await invalidateAgentMembershipQueries(client, ORG);
    expect(isStale(client, keys.agents)).toBe(true);
    expect(isStale(client, keys.activeMembers)).toBe(true);
  });

  // NEGATIVE CONTROL: over-broad invalidation would refetch half the app.
  it("leaves other organizations and unrelated queries alone", async () => {
    const { client, keys } = seed();
    await invalidateAgentMembershipQueries(client, ORG);
    expect(isStale(client, keys.otherOrgMembers)).toBe(false);
    expect(isStale(client, keys.unrelated)).toBe(false);
  });

  it("does not throw when the organization id is undefined", async () => {
    const { client } = seed();
    await expect(
      invalidateAgentMembershipQueries(client, undefined),
    ).resolves.toBeDefined();
  });
});
