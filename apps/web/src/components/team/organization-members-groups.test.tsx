import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrganizationMembersGroups } from "./organization-members-groups";

afterEach(cleanup);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    // #109: these were keyed on the dotted form (`team.members.people`), which
    // i18next never resolves — the separator is ":". The component was fixed to
    // use `team:members.people`, so this mock has to follow. The dotted keys
    // here were a mirror of the production bug, not a deliberate fixture.
    t: (key: string) =>
      ({
        "team:members.people": "People",
        "team:members.agents": "Agents",
        "team:members.agentsManagedByAdmins":
          "Organization agents are managed by owners and administrators.",
      })[key] ?? key,
  }),
}));

vi.mock("./members-table", () => ({
  default: ({ users }: { users: Array<{ user: { name: string } }> }) => (
    <div data-testid="members-table">
      {users.map(({ user }) => user.name).join(",")}
    </div>
  ),
}));

vi.mock("@/components/settings/agent-manager", () => ({
  AgentManager: () => <div data-testid="agent-manager">Agent controls</div>,
}));

const human = {
  id: "m1",
  userId: "u1",
  role: "member",
  user: { name: "Human", role: "user" },
};
const agent = {
  id: "m2",
  userId: "u2",
  role: "member",
  user: { name: "Robot", role: "agent" },
};

describe("OrganizationMembersGroups", () => {
  /**
   * Agents are first-class members: "human user and agents user is identical.
   * treat them equally."
   *
   * This previously asserted the OPPOSITE — that the members table contained
   * only "Human" and explicitly NOT "Robot" — because agents were filtered out
   * and surfaced solely as API keys. They now appear in the same table with
   * the same role column; the Agents section below is credential management
   * only.
   */
  it("lists agents alongside human members in the same table", () => {
    render(
      <OrganizationMembersGroups
        organizationId="org-1"
        users={[human, agent] as never}
        invitations={[]}
        canManageAgents
      />,
    );

    expect(screen.getByRole("heading", { name: "People" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Agents" })).toBeTruthy();
    const table = screen.getByTestId("members-table").textContent;
    expect(table).toContain("Human");
    expect(table).toContain("Robot");
    // The key-management section stays, for issuing and revoking credentials.
    expect(screen.getByTestId("agent-manager")).toBeTruthy();
  });

  it("does not expose agent key management to regular members", () => {
    render(
      <OrganizationMembersGroups
        organizationId="org-1"
        users={[human] as never}
        invitations={[]}
        canManageAgents={false}
      />,
    );

    expect(screen.queryByTestId("agent-manager")).toBeNull();
  });
});
