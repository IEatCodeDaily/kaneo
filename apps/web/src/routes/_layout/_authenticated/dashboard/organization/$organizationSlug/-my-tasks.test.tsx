import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MyTasksComponent } from "./my-tasks";

const route = vi.hoisted(() => ({
  search: {} as { taskId?: string; boardId?: string },
  links: [] as { to?: string; search?: unknown }[],
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/components/common/organization-layout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/page-title", () => ({ default: () => null }));
vi.mock("@/components/task/task-details-sheet", () => ({
  default: ({ taskId }: { taskId: string }) => (
    <div data-testid="ticket-drawer">{taskId}</div>
  ),
}));
vi.mock("@/components/providers/auth-provider/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));
vi.mock(
  "@/hooks/queries/organization-members/use-get-active-organization-members",
  () => ({
    useGetActiveOrganizationMembers: () => ({ data: { members: [] } }),
  }),
);
vi.mock("@/hooks/queries/label/use-get-labels-by-organization", () => ({
  default: () => ({ data: [] }),
}));
// The shared board filter menu is covered by its own tests.
vi.mock("@/components/board/board-toolbar", () => ({
  default: () => <div data-testid="ticket-filter" />,
}));
vi.mock("@/hooks/queries/task/use-infinite-my-tasks", () => ({
  default: () => ({
    data: {
      pages: [
        [
          {
            id: "task-1",
            title: "Ticket one",
            number: 1,
            boardId: "board-1",
            boardName: "Board one",
            flagged: false,
          },
          {
            id: "task-2",
            title: "Flagged ticket",
            number: 2,
            boardId: "board-1",
            boardName: "Board one",
            flagged: true,
            flagName: "Blocked",
            flagColor: "#ef4444",
          },
          {
            id: "task-3",
            title: "Archived board ticket",
            number: 3,
            boardId: "board-2",
            boardName: "Board two",
            boardArchivedAt: "2026-08-01T00:00:00.000Z",
            flagged: false,
          },
        ],
      ],
    },
    isLoading: false,
    isFetching: false,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useParams: () => ({ organizationSlug: "org-1" }),
    useNavigate: () => vi.fn(),
    createFileRoute: () => (options: object) => ({
      ...options,
      fullPath: "/dashboard/organization/$organizationSlug/my-tasks",
      useParams: () => ({ organizationSlug: "org-1" }),
      useSearch: () => route.search,
    }),
    Link: ({
      children,
      to,
      search,
    }: {
      children: React.ReactNode;
      to?: string;
      search?: unknown;
    }) => {
      route.links.push({ to, search });
      return <a href="/">{children}</a>;
    },
  };
});

describe("My Tickets board groups", () => {
  afterEach(() => {
    cleanup();
    route.search = {};
    route.links = [];
  });

  it("opens a ticket in the drawer on My Tickets instead of the board", () => {
    render(<MyTasksComponent />);
    expect(route.links).toContainEqual({
      to: ".",
      search: { taskId: "task-1", boardId: "board-1" },
    });
    expect(route.links.some((link) => link.to?.includes("/board"))).toBe(false);
    expect(screen.queryByTestId("ticket-drawer")).toBeNull();
    cleanup();
    route.search = { taskId: "task-1", boardId: "board-1" };
    render(<MyTasksComponent />);
    expect(screen.getByTestId("ticket-drawer")).toHaveTextContent("task-1");
  });

  it("collapses and expands a board", () => {
    render(<MyTasksComponent />);
    fireEvent.click(screen.getByText("settings:navigation.display"));
    fireEvent.change(screen.getByLabelText("Group tickets"), {
      target: { value: "board" },
    });
    const board = screen.getByRole("button", { name: /Board one/ });
    expect(board).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Ticket one")).toBeInTheDocument();

    fireEvent.click(board);
    expect(board).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Ticket one")).not.toBeInTheDocument();

    fireEvent.click(board);
    expect(screen.getByText("Ticket one")).toBeInTheDocument();
  });

  it("filters to flagged tickets and shows the named flag badge", () => {
    render(<MyTasksComponent />);
    // Both tickets visible initially.
    expect(screen.getByText("Ticket one")).toBeInTheDocument();
    expect(screen.getByText("Flagged ticket")).toBeInTheDocument();
    // The flagged ticket carries a badge naming the flag type, not a generic
    // "Flagged" label.
    expect(screen.getByText("Blocked")).toBeInTheDocument();

    // Toggle the Flagged filter (toolbar button uses the myTasks:flagged key).
    fireEvent.click(screen.getByText("myTasks:flagged"));
    expect(screen.queryByText("Ticket one")).not.toBeInTheDocument();
    expect(screen.getByText("Flagged ticket")).toBeInTheDocument();
  });

  /*
    KFL-190: My Tickets is the cross-board surface, so it is the one place a
    row's board context is not implied by the page. Tickets on an archived
    board get the same layered Archive glyph the list view and detail sidebar
    use, so archival reads identically everywhere.
  */
  it("marks tickets whose board is archived and leaves the rest unmarked", () => {
    render(<MyTasksComponent />);

    const archived = screen.getByTestId("my-task-board-archived");
    expect(archived).toBeInTheDocument();
    expect(screen.getAllByTestId("my-task-board-archived")).toHaveLength(1);

    // The glyph is layered over the row's own status slot, not a separate cell.
    const statusSlots = screen.getAllByTestId("my-task-status-icon");
    expect(statusSlots).toHaveLength(3);
    expect(statusSlots[2]).toContainElement(archived);
    expect(statusSlots[2]).toHaveAttribute(
      "title",
      expect.stringContaining("myTasks:boardArchived"),
    );
  });
});
