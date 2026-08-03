import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useBoardLayoutStore } from "@/store/board-layout";
import BoardLayout from "./board-layout";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
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
  BoardViewTabs: () => null,
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
    open ? <aside data-testid="board-properties-panel" /> : null,
}));

afterEach(() => {
  cleanup();
  useBoardLayoutStore.setState({ propertiesPanelBoardId: null });
});

describe("BoardLayout shared actions", () => {
  it("owns create and properties actions for every child view", async () => {
    render(
      <BoardLayout boardId="board-1" organizationId="org-1" activeView="board">
        <div>Tasks</div>
      </BoardLayout>,
    );
    fireEvent.click(screen.getByTestId("board-create-task"));
    expect(await screen.findByTestId("create-task-modal")).toBeInTheDocument();
    expect(screen.getByTestId("board-properties-toggle")).toBeInTheDocument();
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
    expect(screen.getByText("Calendar")).toBeInTheDocument();
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
    expect(
      screen.queryByTestId("board-properties-toggle"),
    ).not.toBeInTheDocument();
  });
});
