import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useBoardLayoutStore } from "@/store/board-layout";
import BoardLayout from "./board-layout";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ organizationSlug: "org-1", boardSlug: "board-1" }),
  useLocation: () => ({ pathname: "/board/board-1/board" }),
  useRouterState: ({
    select,
  }: {
    select: (state: { status: string }) => unknown;
  }) => select({ status: "idle" }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/hooks/queries/board/use-get-board", () => ({
  default: () => ({ data: { id: "board-1", name: "Board" } }),
}));
vi.mock("@/hooks/queries/board/use-get-boards", () => ({
  default: () => ({
    data: [{ id: "board-1", slug: "board-1", name: "Board" }],
  }),
}));
vi.mock("@/hooks/queries/task/use-get-tasks", () => ({
  useGetTasks: () => ({
    data: { columns: [], plannedTasks: [], archivedTasks: [] },
  }),
}));
vi.mock("@/hooks/use-board-websocket", () => ({ useBoardWebSocket: vi.fn() }));
vi.mock("@/components/common/layout", () => {
  const Layout = ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  );
  Layout.Header = ({ children }: { children: ReactNode }) => (
    <header>{children}</header>
  );
  Layout.Content = ({ children }: { children: ReactNode }) => (
    <main>{children}</main>
  );
  return { default: Layout };
});
vi.mock("@/components/board/board-view-tabs", () => ({
  BoardViewTabs: ({
    value,
    views,
    onValueChange,
  }: {
    value: string;
    views: { value: string; label: string }[];
    onValueChange: (value: string) => void;
  }) => (
    <div data-testid="board-view-tabs" data-value={value}>
      {views.map((view) => (
        <button
          key={view.value}
          type="button"
          onClick={() => onValueChange(view.value)}
        >
          {view.label}
        </button>
      ))}
    </div>
  ),
}));
vi.mock("@/components/board/board-sync-indicator", () => ({
  default: () => null,
}));
vi.mock("@/components/presence/board-access-avatars", () => ({
  default: () => <span>avatars</span>,
}));
vi.mock("@/components/common/header/organization-crumb-select", () => ({
  default: () => null,
}));
vi.mock("@/components/common/header/board-crumb-select", () => ({
  default: () => null,
}));
vi.mock("@/components/common/header/mobile-board-nav", () => ({
  default: () => null,
}));
vi.mock("@/components/shared/modals/create-board-modal", () => ({
  default: () => null,
}));
vi.mock("@/components/shared/modals/create-task-modal", () => ({
  default: ({ open }: { open: boolean }) =>
    open ? <div data-testid="create-task-modal" /> : null,
}));
vi.mock("@/components/board/board-properties-panel", () => ({
  default: ({ open }: { open: boolean }) =>
    open ? (
      <aside id="board-properties-panel" data-testid="board-properties-panel" />
    ) : null,
}));

afterEach(() => {
  cleanup();
  useBoardLayoutStore.setState({ propertiesPanelBoardId: null });
});

describe("BoardLayout shared actions", () => {
  it("always offers the same Backlog, Board, List, Timeline, Calendar views", () => {
    const expected = ["Backlog", "Board", "List", "Timeline", "Calendar"];
    const calendar = render(
      <BoardLayout
        boardId="board-1"
        organizationId="org-1"
        activeView="calendar"
      >
        <div>Calendar</div>
      </BoardLayout>,
    );

    expect(
      Array.from(
        screen.getByTestId("board-view-tabs").querySelectorAll("button"),
      ).map((button) => button.textContent),
    ).toEqual(expected);

    calendar.rerender(
      <BoardLayout boardId="board-1" organizationId="org-1" activeView="board">
        <div>Tasks</div>
      </BoardLayout>,
    );
    expect(
      Array.from(
        screen.getByTestId("board-view-tabs").querySelectorAll("button"),
      ).map((button) => button.textContent),
    ).toEqual(expected);
  });

  it("keeps Properties mounted and uses it as a pressed-state toggle", () => {
    render(
      <BoardLayout boardId="board-1" organizationId="org-1" activeView="board">
        <div>Tasks</div>
      </BoardLayout>,
    );
    const toggle = screen.getByTestId("board-properties-toggle");
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "board-properties-panel");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveClass("bg-accent");
    expect(screen.getByTestId("board-properties-panel")).toHaveAttribute(
      "id",
      "board-properties-panel",
    );

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(toggle).not.toHaveClass("bg-accent");
    expect(
      screen.queryByTestId("board-properties-panel"),
    ).not.toBeInTheDocument();
  });

  it("preserves the properties panel across navigation-like child/view rerenders", () => {
    const { rerender } = render(
      <BoardLayout boardId="board-1" organizationId="org-1" activeView="board">
        <div>Tasks</div>
      </BoardLayout>,
    );
    fireEvent.click(screen.getByTestId("board-properties-toggle"));
    rerender(
      <BoardLayout
        boardId="board-1"
        organizationId="org-1"
        activeView="calendar"
      >
        <div>Calendar</div>
      </BoardLayout>,
    );
    expect(screen.getByTestId("board-properties-panel")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("Calendar");
  });

  it("preserves properties when route-owned layouts unmount and remount", () => {
    const firstRoute = render(
      <BoardLayout boardId="board-1" organizationId="org-1" activeView="board">
        <div>Tasks</div>
      </BoardLayout>,
    );
    fireEvent.click(screen.getByTestId("board-properties-toggle"));
    firstRoute.unmount();

    render(
      <BoardLayout
        boardId="board-1"
        organizationId="org-1"
        activeView="calendar"
      >
        <div>Calendar</div>
      </BoardLayout>,
    );

    expect(screen.getByTestId("board-properties-panel")).toBeInTheDocument();
    expect(screen.getByTestId("board-properties-toggle")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
