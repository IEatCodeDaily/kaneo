import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUserPreferencesStore } from "@/store/user-preferences";
import type { DataTableSummary } from "@/types/data-table";
import { NavTables } from "./nav-tables";

const navigate = vi.fn();
let pathname = "/dashboard/organization/acme/table";
let mockTables: DataTableSummary[] = [];
let isLoading = false;
let isError = false;
const refetch = vi.fn();

afterEach(cleanup);

beforeEach(() => {
  useUserPreferencesStore.setState({
    hiddenTableIds: [],
    tableSidebarOrders: {},
  });
  pathname = "/dashboard/organization/acme/table";
  isLoading = false;
  isError = false;
  refetch.mockReset();
  navigate.mockReset();
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { name?: string }) =>
      opts?.name ? `${key}:${opts.name}` : key,
  }),
}));
vi.mock("@/lib/i18n", () => ({
  ensureTablesStrings: () => Promise.resolve(),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  useLocation: () => ({ pathname }),
}));
vi.mock("@/components/providers/auth-provider/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "u-1" } }),
}));
vi.mock("@/hooks/queries/organization/use-active-organization", () => ({
  default: () => ({ data: { id: "org-1", slug: "acme" } }),
}));
vi.mock("@/hooks/use-organization-permission", () => ({
  useOrganizationPermission: () => ({ canCreateBoards: () => true }),
}));
vi.mock("@/hooks/data-table/use-data-tables", () => ({
  useDataTables: () => ({ data: mockTables, isLoading, isError, refetch }),
}));
vi.mock("@/components/shared/modals/create-data-table-modal", () => ({
  default: () => null,
}));

// Plain-DOM primitives so store and route wiring are observable (data-active
// is the pill contract the CSS keys on).
vi.mock("@/components/ui/sidebar", async () => {
  const { cloneElement } = await import("react");
  return {
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
      render?: ReactElement;
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
      render?: ReactElement;
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

const table = (overrides: Partial<DataTableSummary>): DataTableSummary =>
  ({
    id: overrides.id ?? "",
    organizationId: "org-1",
    name: overrides.name ?? "",
    icon: null,
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  }) as DataTableSummary;

describe("NavTables (generic resource section)", () => {
  it("renders tables in the persisted order and keeps the sortable wiring", () => {
    mockTables = [
      table({ id: "t-1", name: "Alpha" }),
      table({ id: "t-2", name: "Beta" }),
    ];
    useUserPreferencesStore.setState({
      tableSidebarOrders: { "u-1": ["t-2", "t-1"] },
    });
    const { container } = render(<NavTables />);

    const labels = Array.from(container.querySelectorAll("li")).map(
      (li) => li.textContent ?? "",
    );
    const beta = labels.findIndex((text) => text.includes("Beta"));
    const alpha = labels.findIndex((text) => text.includes("Alpha"));
    expect(beta).toBeGreaterThanOrEqual(0);
    expect(alpha).toBeGreaterThan(beta);

    expect(
      container.querySelectorAll('[aria-roledescription="sortable"]').length,
    ).toBe(2);
  });

  it("hides a table from its ⋯ menu and lists it under More Tables", () => {
    mockTables = [
      table({ id: "t-1", name: "Alpha" }),
      table({ id: "t-2", name: "Beta" }),
    ];
    const { container } = render(<NavTables />);

    const betaRow = Array.from(container.querySelectorAll("li")).find((li) =>
      li.textContent?.includes("Beta"),
    );
    const hideItem = betaRow
      ? Array.from(betaRow.querySelectorAll("[role=menuitem]")).find((item) =>
          item.textContent?.includes("hideFromSidebar"),
        )
      : undefined;
    expect(hideItem).toBeTruthy();
    fireEvent.click(hideItem!);

    const { hiddenTableIds } = useUserPreferencesStore.getState();
    expect(hiddenTableIds).toEqual(["u-1:t-2"]);

    // The row leaves the list and collapses behind the More Tables entry.
    expect(screen.queryByText("Beta")).toBeNull();
    fireEvent.click(screen.getByTestId("tables-more-toggle"));
    expect(screen.getByTestId("tables-more-entry-t-2").textContent).toContain(
      "Beta",
    );
  });

  it("navigates to a hidden table from the More Tables row", () => {
    mockTables = [
      table({ id: "t-1", name: "Alpha" }),
      table({ id: "t-2", name: "Beta", slug: "beta" }),
    ];
    useUserPreferencesStore.setState({ hiddenTableIds: ["u-1:t-2"] });
    render(<NavTables />);

    fireEvent.click(screen.getByTestId("tables-more-toggle"));
    fireEvent.click(screen.getByTestId("tables-more-entry-t-2"));

    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          organizationSlug: "acme",
          tableId: "beta",
        }),
      }),
    );
  });

  it("restores a hidden table from the header ⋯ Show menu", () => {
    mockTables = [
      table({ id: "t-1", name: "Alpha" }),
      table({ id: "t-2", name: "Beta" }),
    ];
    useUserPreferencesStore.setState({ hiddenTableIds: ["u-1:t-2"] });
    const { container } = render(<NavTables />);

    // The header ⋯ trigger carries the accessible name; its menu is the only
    // one listing a Show action for Beta.
    const headerTrigger = container
      .querySelector("div.absolute")
      ?.querySelector("button");
    expect(headerTrigger?.getAttribute("aria-label")).toBe(
      "navigation:sidebar.more",
    );
    const showItem = screen
      .getAllByRole("menuitem")
      .find((item) =>
        item.textContent?.includes("navigation:sidebar.showItem:Beta"),
      );
    expect(showItem).toBeTruthy();
    fireEvent.click(showItem!);

    expect(useUserPreferencesStore.getState().hiddenTableIds).toEqual([]);
    expect(screen.getByText("Beta")).toBeTruthy();
    expect(screen.queryByTestId("tables-more-toggle")).toBeNull();
  });

  it("marks the row on the current table route active", () => {
    mockTables = [
      table({ id: "t-1", name: "Alpha" }),
      table({ id: "t-2", name: "Beta", slug: "beta" }),
    ];
    pathname = "/dashboard/organization/acme/table/beta/board";
    const { container } = render(<NavTables />);

    const rows = Array.from(container.querySelectorAll("li"));
    const betaButton = rows
      .find((li) => li.textContent?.includes("Beta"))
      ?.querySelector("button");
    const alphaButton = rows
      .find((li) => li.textContent?.includes("Alpha"))
      ?.querySelector("button");
    expect(betaButton?.getAttribute("data-active")).toBe("true");
    expect(alphaButton?.getAttribute("data-active")).toBe("false");
  });

  it("falls back to the header highlight when no visible table claims the route", () => {
    mockTables = [table({ id: "t-1", name: "Alpha" })];
    useUserPreferencesStore.setState({ hiddenTableIds: ["u-1:t-1"] });
    pathname = "/dashboard/organization/acme/table/t-1/board";
    const { container } = render(<NavTables />);

    const header = container.querySelector("[data-active='true']");
    expect(header?.textContent).toContain("navigation:tables.title");
  });

  it("renders loading and error render states", () => {
    mockTables = [];
    isLoading = true;
    const { container } = render(<NavTables />);
    expect(container.querySelector("[role=status]")).toBeTruthy();
  });

  it("retries through the error state's retry button", () => {
    mockTables = [];
    isError = true;
    render(<NavTables />);

    fireEvent.click(screen.getByText(/tables.loadError/));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("persists hide/show toggles deduplicated and orders per user", () => {
    const store = useUserPreferencesStore.getState();
    store.setTableSidebarVisibility("u-1", "t-1", false);
    store.setTableSidebarVisibility("u-1", "t-1", false);
    store.setTableSidebarVisibility("u-2", "t-1", false);
    expect(useUserPreferencesStore.getState().hiddenTableIds).toEqual([
      "u-1:t-1",
      "u-2:t-1",
    ]);
    store.setTableSidebarVisibility("u-1", "t-1", true);
    expect(useUserPreferencesStore.getState().hiddenTableIds).toEqual([
      "u-2:t-1",
    ]);

    store.setTableSidebarOrder("u-1", ["t-2", "t-1"]);
    expect(useUserPreferencesStore.getState().tableSidebarOrders).toEqual({
      "u-1": ["t-2", "t-1"],
    });
  });
});
