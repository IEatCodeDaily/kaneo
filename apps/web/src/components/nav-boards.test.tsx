import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUserPreferencesStore } from "@/store/user-preferences";
import type { BoardWithTasks } from "@/types/board";
import { NavBoards } from "./nav-boards";
import { NavTables } from "./nav-tables";

const navigate = vi.fn();
let pathname = "/dashboard/organization/acme";
let mockBoards: BoardWithTasks[] = [];

afterEach(cleanup);

beforeEach(() => {
  useUserPreferencesStore.setState({
    hiddenBoardIds: [],
    boardSidebarOrders: {},
    hiddenTableIds: [],
    tableSidebarOrders: {},
  });
  pathname = "/dashboard/organization/acme";
  navigate.mockReset();
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { name?: string }) =>
      opts?.name ? `${key}:${opts.name}` : key,
  }),
}));
vi.mock("@/lib/i18n", () => ({ ensureTablesStrings: () => Promise.resolve() }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  useParams: () => ({}),
  useLocation: () => ({ pathname }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    getQueryData: () => undefined,
    invalidateQueries: vi.fn(),
  }),
}));
vi.mock("@/components/providers/auth-provider/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "u-1" } }),
}));
vi.mock("@/hooks/queries/organization/use-active-organization", () => ({
  default: () => ({ data: { id: "org-1", slug: "acme" } }),
}));
vi.mock("@/hooks/use-organization-permission", () => ({
  useOrganizationPermission: () => ({
    canCreateBoards: () => true,
    canDeleteBoards: () => true,
    canUpdateBoards: () => true,
  }),
}));
vi.mock("@/hooks/queries/board/use-get-boards", () => ({
  default: () => ({ data: mockBoards }),
}));
vi.mock("@/hooks/mutations/board/use-delete-board", () => ({
  default: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/mutations/board/use-archive-board", () => ({
  default: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-remembered-view", () => ({
  useTargetBoardView: () => "board",
  useTargetRepoView: () => "code",
  useRememberCurrentView: () => {},
}));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/navigation-prefetch", () => ({
  intentPrefetchHandlers: () => ({}),
  prefetchBoardNavigation: vi.fn(),
  prefetchRepoNavigation: vi.fn(),
}));
vi.mock("@/components/common/entity-icon", () => ({
  default: ({ value }: { value?: string }) => (
    <span data-testid="entity-icon">{value ?? ""}</span>
  ),
}));
vi.mock("@/hooks/data-table/use-data-tables", () => ({
  useDataTables: () => ({
    data: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/components/shared/modals/create-board-modal", () => ({
  default: () => null,
}));
vi.mock("@/components/shared/modals/create-data-table-modal", () => ({
  default: () => null,
}));

vi.mock("@/components/ui/sidebar", async () => {
  const { cloneElement } = await import("react");
  return {
    useSidebar: () => ({ isMobile: false }),
    SidebarGroup: ({
      children,
      className,
    }: {
      children?: ReactNode;
      className?: string;
    }) => <section className={className}>{children}</section>,
    SidebarGroupContent: ({ children }: { children?: ReactNode }) => (
      <div>{children}</div>
    ),
    SidebarGroupLabel: ({
      children,
      render,
      onClick,
      ...props
    }: {
      children?: ReactNode;
      render?: ReactElement<Record<string, unknown>>;
      onClick?: () => void;
    }) => {
      if (render) {
        return cloneElement(render, { onClick, ...props }, children);
      }
      return null;
    },
    SidebarMenu: ({ children }: { children?: ReactNode }) => (
      <ul>{children}</ul>
    ),
    SidebarMenuItem: ({ children }: { children?: ReactNode }) => (
      <li>{children}</li>
    ),
    SidebarMenuButton: ({
      children,
      isActive,
      ...props
    }: {
      children?: ReactNode;
      isActive?: boolean;
    }) => (
      <button
        type="button"
        data-active={isActive ? "true" : "false"}
        {...props}
      >
        {children}
      </button>
    ),
    SidebarMenuAction: ({ children, ...props }: { children?: ReactNode }) => (
      <button type="button" {...props}>
        {children}
      </button>
    ),
  };
});

vi.mock("@/components/ui/menu", async () => {
  const { cloneElement } = await import("react");
  return {
    DropdownMenu: ({ children }: { children?: ReactNode }) => <>{children}</>,
    DropdownMenuTrigger: ({
      children,
      render,
      ...props
    }: {
      children?: ReactNode;
      render?: ReactElement<Record<string, unknown>>;
    }) => {
      if (render) {
        return cloneElement(render, props, children);
      }
      return (
        <button type="button" {...props}>
          {children}
        </button>
      );
    },
    DropdownMenuContent: ({ children }: { children?: ReactNode }) => (
      <div role="menu">{children}</div>
    ),
    DropdownMenuItem: ({
      children,
      onClick,
      ...props
    }: {
      children?: ReactNode;
      onClick?: () => void;
    }) => (
      <button role="menuitem" type="button" onClick={onClick} {...props}>
        {children}
      </button>
    ),
    DropdownMenuSeparator: () => <hr />,
  };
});

vi.mock("@/components/ui/context-menu", () => ({
  ContextMenu: ({ children }: { children?: ReactNode }) => <>{children}</>,
  ContextMenuTrigger: ({ children }: { children?: ReactNode }) => (
    <>{children}</>
  ),
  ContextMenuContent: ({ children }: { children?: ReactNode }) => (
    <div role="menu">{children}</div>
  ),
  ContextMenuItem: ({
    children,
    onClick,
    ...props
  }: {
    children?: ReactNode;
    onClick?: () => void;
  }) => (
    <button role="menuitem" type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
  ContextMenuSeparator: () => <hr />,
}));

const board = (overrides: Record<string, unknown>) =>
  ({
    id: overrides.id ?? "",
    slug: overrides.slug ?? "",
    name: overrides.name ?? "",
    icon: null,
    archivedAt: null,
    columns: [],
  }) as unknown as BoardWithTasks;

describe("NavBoards on the generic resource section", () => {
  it("keeps the collapsed rail and expanded rows rendering as before", () => {
    mockBoards = [board({ id: "b-1", slug: "alpha", name: "Alpha" })];
    const { container } = render(<NavBoards />);

    expect(screen.getByTestId("sidebar-boards-collapsed")).toBeTruthy();
    expect(screen.getByTestId("sidebar-board-collapsed-b-1")).toBeTruthy();
    // Expanded row + collapsed rail both carry the board name.
    expect(screen.getAllByText("Alpha").length).toBeGreaterThanOrEqual(2);
    // Drag-reorder wiring survives the migration.
    expect(
      container.querySelectorAll('[aria-roledescription="sortable"]').length,
    ).toBe(1);
    // The per-item ⋯ actions still come from the shared section contract.
    expect(
      screen.getAllByRole("button", { name: "navigation:sidebar.more" }).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("hides a board and reveals it through the More Boards row", () => {
    mockBoards = [board({ id: "b-1", slug: "alpha", name: "Alpha" })];
    render(<NavBoards />);

    const hideItems = screen.getAllByRole("menuitem", {
      name: /Hide from sidebar/,
    });
    fireEvent.click(hideItems[0]);
    expect(useUserPreferencesStore.getState().hiddenBoardIds).toEqual([
      "u-1:b-1",
    ]);
    expect(screen.queryByText("Alpha")).toBeNull();

    fireEvent.click(screen.getByTestId("boards-more-toggle"));
    fireEvent.click(screen.getByTestId("boards-more-entry-b-1"));
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ boardSlug: "alpha" }),
      }),
    );
  });

  it("renders boards and tables side by side without testid collisions", () => {
    mockBoards = [board({ id: "b-1", slug: "alpha", name: "Alpha" })];
    useUserPreferencesStore.setState({ hiddenBoardIds: ["u-1:b-1"] });
    render(
      <>
        <NavBoards />
        <NavTables />
      </>,
    );

    // Boards keep their namespace…
    expect(screen.getByTestId("boards-more-toggle")).toBeTruthy();
    // …and tables get their own.
    expect(screen.queryByTestId("tables-more-toggle")).toBeNull();
    fireEvent.click(screen.getByTestId("boards-more-toggle"));
    expect(screen.getByTestId("boards-more-entry-b-1")).toBeTruthy();
    expect(screen.queryByTestId("tables-more-entry-b-1")).toBeNull();
  });
});
