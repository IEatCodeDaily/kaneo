import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const useGetActiveOrganizationMembers = vi.fn();

vi.mock(
  "@/hooks/queries/organization-members/use-get-active-organization-members",
  () => ({
    useGetActiveOrganizationMembers: (organizationId: string) =>
      useGetActiveOrganizationMembers(organizationId),
  }),
);
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    organization: {
      listTeams: vi.fn(async () => ({ data: [], error: null })),
    },
  },
}));
vi.mock("@/fetchers/get-api-url", () => ({
  getApiUrl: (path: string) => `http://api.test/${path}`,
}));

import BoardAccessAvatars from "./board-access-avatars";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("BoardAccessAvatars", () => {
  it("renders one avatar per member from a { members, total } payload", () => {
    // REAL payload shape: an object, not an array.
    useGetActiveOrganizationMembers.mockReturnValue({
      data: {
        members: [
          {
            userId: "u1",
            role: "owner",
            user: { name: "Ada Lovelace", email: "ada@x.dev", image: null },
          },
          {
            userId: "u2",
            role: "member",
            user: { name: "Alan Turing", email: "alan@x.dev", image: null },
          },
        ],
        total: 2,
      },
    });

    render(<BoardAccessAvatars organizationId="org-1" resourceId="board-1" />, {
      wrapper,
    });

    expect(screen.getByTestId("board-access-avatars")).toBeTruthy();
    expect(screen.getByTestId("board-access-avatar-member-u1")).toBeTruthy();
    expect(screen.getByTestId("board-access-avatar-member-u2")).toBeTruthy();
    expect(
      screen
        .getByTestId("board-access-avatars")
        .querySelectorAll('[data-testid^="board-access-avatar-member-"]')
        .length,
    ).toBe(2);
  });

  it("collapses extra members into an overflow chip", () => {
    useGetActiveOrganizationMembers.mockReturnValue({
      data: {
        members: Array.from({ length: 6 }, (_, index) => ({
          userId: `u${index}`,
          role: "member",
          user: { name: `Member ${index}`, email: `m${index}@x.dev` },
        })),
        total: 6,
      },
    });

    render(
      <BoardAccessAvatars
        organizationId="org-1"
        resourceId="board-1"
        maxVisible={4}
      />,
      { wrapper },
    );

    expect(screen.getByTestId("board-access-avatar-overflow").textContent).toBe(
      "+2",
    );
  });

  it("renders nothing when there are no members", () => {
    useGetActiveOrganizationMembers.mockReturnValue({
      data: { members: [], total: 0 },
    });

    render(<BoardAccessAvatars organizationId="org-1" resourceId="board-1" />, {
      wrapper,
    });

    expect(screen.queryByTestId("board-access-avatars")).toBeNull();
  });
});
