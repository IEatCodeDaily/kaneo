import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrganizationMembersGroups } from "./organization-members-groups";

afterEach(cleanup);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "team.members.people": "People",
        "team.members.agents": "Agents",
        "team.members.agentsManagedByAdmins":
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
  it("keeps human members and agents in clearly separate labelled groups", () => {
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
    expect(screen.getByTestId("members-table").textContent).toBe("Human");
    expect(screen.getByTestId("members-table").textContent).not.toContain(
      "Robot",
    );
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
