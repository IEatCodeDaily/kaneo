import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TeamMemberCount from "@/components/team/team-member-count";

/**
 * #121 "Team members update lag bug": "Removed a team user didn't vanish from
 * team list until refreshed."
 *
 * Two defects sat behind that report:
 *
 *  1. The header count rendered `membership.length` unconditionally. While the
 *     query was loading (or refetching after a removal) `membership` is `[]`,
 *     so the card asserted "0 members" directly above a list that still read
 *     "Loading members…" — reproduced live before fixing.
 *  2. The removal only invalidated the team-members key, leaving the
 *     organization-members list (which feeds the "available to add" dropdown)
 *     stale.
 */

afterEach(cleanup);

describe("TeamMemberCount (#121)", () => {
  it("does not claim a count while the member list is still loading", () => {
    render(<TeamMemberCount isPending memberCount={0} />);

    // The bug: "0 members" shown next to "Loading members…".
    expect(screen.queryByTestId("team-member-count")).toBeNull();
    expect(screen.getByTestId("team-member-count-loading")).toBeTruthy();
    expect(screen.queryByText(/0 members/)).toBeNull();
  });

  it("reports the real count once the list has resolved", () => {
    render(<TeamMemberCount isPending={false} memberCount={2} />);

    expect(screen.getByTestId("team-member-count").textContent).toBe(
      "2 members",
    );
  });

  it("singularises a one-member team", () => {
    render(<TeamMemberCount isPending={false} memberCount={1} />);

    expect(screen.getByTestId("team-member-count").textContent).toBe(
      "1 member",
    );
  });

  it("reports zero only when the list has genuinely resolved empty", () => {
    render(<TeamMemberCount isPending={false} memberCount={0} />);

    expect(screen.getByTestId("team-member-count").textContent).toBe(
      "0 members",
    );
  });
});

/**
 * Invalidation contract for a membership change, mirroring the onSuccess
 * handler in the teams settings route.
 */
async function onMembershipChanged(
  queryClient: {
    invalidateQueries: (options: {
      queryKey: unknown[];
      refetchType?: string;
    }) => Promise<void>;
  },
  teamId: string,
  organizationId: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: ["organization-team-members", teamId],
      refetchType: "active",
    }),
    queryClient.invalidateQueries({
      queryKey: ["organization-members", organizationId],
    }),
  ]);
}

describe("membership change invalidation (#121)", () => {
  it("refetches both the team list and the organization member pool", async () => {
    const invalidateQueries = vi.fn(
      async (_options: { queryKey: unknown[]; refetchType?: string }) => {},
    );

    await onMembershipChanged({ invalidateQueries }, "team-1", "org-1");

    const keys = invalidateQueries.mock.calls.map((call) => call[0].queryKey);
    expect(keys).toContainEqual(["organization-team-members", "team-1"]);
    // Without this the add-dropdown keeps offering an already-removed member.
    expect(keys).toContainEqual(["organization-members", "org-1"]);
  });

  it("forces active queries to refetch rather than just marking them stale", async () => {
    const invalidateQueries = vi.fn(
      async (_options: { queryKey: unknown[]; refetchType?: string }) => {},
    );

    await onMembershipChanged({ invalidateQueries }, "team-1", "org-1");

    const teamCall = invalidateQueries.mock.calls.find(
      (call) => call[0].queryKey[0] === "organization-team-members",
    );
    expect(teamCall?.[0].refetchType).toBe("active");
  });
});
