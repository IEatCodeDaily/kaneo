import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MyTasksComponent } from "./my-tasks";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/components/common/organization-layout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/page-title", () => ({ default: () => null }));
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
    createFileRoute: () => (options: object) => ({
      ...options,
      useParams: () => ({ organizationSlug: "org-1" }),
    }),
    Link: ({ children }: { children: React.ReactNode }) => (
      <a href="/">{children}</a>
    ),
  };
});

describe("My Tickets board groups", () => {
  afterEach(cleanup);

  it("collapses and expands a board", () => {
    render(<MyTasksComponent />);
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
});
