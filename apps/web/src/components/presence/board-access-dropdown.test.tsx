import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockMembers = vi.fn();
const mockGrants = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock(
  "@/hooks/queries/organization-members/use-get-active-organization-members",
  () => ({ useGetActiveOrganizationMembers: () => mockMembers() }),
);

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: unknown[] }) => {
    const key = options.queryKey?.[0];
    if (key === "resource-grants") return mockGrants();
    return { data: [] };
  },
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { organization: { listTeams: vi.fn() } },
}));

vi.mock("@/fetchers/get-api-url", () => ({ getApiUrl: () => "" }));

import BoardAccessAvatars from "./board-access-avatars";

function member(id: string, name: string, role: string) {
  return {
    userId: id,
    role,
    user: { name, email: `${id}@x.test`, image: null },
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/**
 * #91: "add a dropdown to see all the lists and access type (edit view manage).
 * should list all users and teams."
 *
 * The avatar stack alone caps at a handful of faces and never shows the access
 * TYPE, so the privilege each person holds was invisible.
 */
describe("BoardAccessAvatars dropdown (#91)", () => {
  it("lists every member with their access type", () => {
    mockMembers.mockReturnValue({
      data: {
        members: [
          member("u1", "Raisal", "owner"),
          member("u2", "Zephyr", "admin"),
          member("u3", "Someone", "member"),
        ],
        total: 0,
      },
    });
    mockGrants.mockReturnValue({ data: [] });

    render(
      <BoardAccessAvatars
        organizationId="org-1"
        resourceId="board-1"
        resourceType="board"
      />,
    );

    fireEvent.click(screen.getByTestId("board-access-trigger"));

    const rows = screen.getAllByTestId(/^board-access-row-/);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("owner"),
      expect.stringContaining("admin"),
      expect.stringContaining("member"),
    ]);
  });

  /**
   * Agents are first-class members, so an agent appears in the access list on
   * the same footing as a human, with whatever role it holds.
   */
  it("lists agents on the same footing as humans", () => {
    mockMembers.mockReturnValue({
      data: {
        members: [
          member("u1", "Raisal", "owner"),
          member("a1", "Zephyr", "admin"),
        ],
        total: 0,
      },
    });
    mockGrants.mockReturnValue({ data: [] });

    render(
      <BoardAccessAvatars
        organizationId="org-1"
        resourceId="board-1"
        resourceType="board"
      />,
    );

    fireEvent.click(screen.getByTestId("board-access-trigger"));

    const text = screen
      .getAllByTestId(/^board-access-row-/)
      .map((r) => r.textContent);
    expect(
      text.some((t) => t?.includes("Zephyr") && t?.includes("admin")),
    ).toBe(true);
  });

  it("shows the privilege for team grants", () => {
    mockMembers.mockReturnValue({
      data: { members: [member("u1", "Raisal", "owner")], total: 0 },
    });
    mockGrants.mockReturnValue({
      data: [{ teamId: "t1", userId: null, privilege: "edit" }],
    });

    render(
      <BoardAccessAvatars
        organizationId="org-1"
        resourceId="board-1"
        resourceType="board"
      />,
    );

    fireEvent.click(screen.getByTestId("board-access-trigger"));

    const rows = screen.getAllByTestId(/^board-access-row-/);
    expect(rows.some((r) => r.textContent?.includes("edit"))).toBe(true);
  });

  /**
   * The stack caps at `maxVisible`; the dropdown must not. This is the whole
   * point of the ticket — "should list ALL users and teams".
   */
  it("lists everyone even when the stack overflows", () => {
    mockMembers.mockReturnValue({
      data: {
        members: Array.from({ length: 9 }, (_, i) =>
          member(`u${i}`, `Person ${i}`, "member"),
        ),
        total: 9,
      },
    });
    mockGrants.mockReturnValue({ data: [] });

    render(
      <BoardAccessAvatars
        organizationId="org-1"
        resourceId="board-1"
        resourceType="board"
        maxVisible={3}
      />,
    );

    // Stack is capped...
    expect(screen.getAllByTestId(/^board-access-avatar-member/)).toHaveLength(
      3,
    );
    // ...the dropdown is not.
    fireEvent.click(screen.getByTestId("board-access-trigger"));
    expect(screen.getAllByTestId(/^board-access-row-/)).toHaveLength(9);
  });
});
