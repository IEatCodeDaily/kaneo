import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EyeOff, Folder, Trash2 } from "lucide-react";
import {
  type ComponentProps,
  cloneElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResourceSection } from "./resource-section";

afterEach(cleanup);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: "/dashboard/organization/acme/table" }),
}));

// Plain-DOM sidebar primitives: data-active is the active-pill contract the
// CSS keys on, so the stubs preserve it.
vi.mock("@/components/ui/sidebar", () => ({
  useSidebar: () => ({ isMobile: false }),
  SidebarGroup: ({ children }: { children?: ReactNode }) => (
    <section>{children}</section>
  ),
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
  SidebarMenu: ({ children }: { children?: ReactNode }) => <ul>{children}</ul>,
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
    <button type="button" data-active={isActive ? "true" : "false"} {...props}>
      {children}
    </button>
  ),
  SidebarMenuAction: ({ children, ...props }: { children?: ReactNode }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/menu", () => ({
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
}));

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

const baseItem = {
  id: "t-1",
  label: "Invoices",
  icon: <span data-testid="item-icon" />,
};

function renderSection(
  props: Partial<ComponentProps<typeof ResourceSection>> = {},
) {
  return render(
    <ResourceSection
      id="tables"
      label="Tables"
      sectionActive={false}
      onHeaderClick={vi.fn()}
      items={[baseItem, { ...baseItem, id: "t-2", label: "Customers" }]}
      {...props}
    />,
  );
}

describe("ResourceSection", () => {
  it("renders the header label and every item", () => {
    renderSection();

    expect(screen.getByText("Tables")).toBeTruthy();
    expect(screen.getByText("Invoices")).toBeTruthy();
    expect(screen.getByText("Customers")).toBeTruthy();
  });

  it("marks the active item through the data-active pill contract", () => {
    renderSection({
      items: [
        { ...baseItem, active: true },
        { ...baseItem, id: "t-2", label: "Customers" },
      ],
    });

    const buttons = screen
      .getAllByRole("button")
      .filter((button) => button.textContent === "Invoices");
    expect(buttons[0].getAttribute("data-active")).toBe("true");
  });

  it("carries the section-fallback highlight on the header", () => {
    renderSection({ sectionActive: true });

    const header = screen
      .getAllByRole("button")
      .find((button) => button.textContent === "Tables");
    expect(header?.getAttribute("data-active")).toBe("true");
  });

  it("navigates from the header click", () => {
    const onHeaderClick = vi.fn();
    renderSection({ onHeaderClick });

    fireEvent.click(screen.getByText("Tables"));
    expect(onHeaderClick).toHaveBeenCalledTimes(1);
  });

  it("wires the + add action", () => {
    const onAdd = vi.fn();
    renderSection({ addAction: { label: "Create table", onClick: onAdd } });

    fireEvent.click(screen.getByRole("button", { name: "Create table" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("renders the ⋯ + context actions from one action list", () => {
    const onHide = vi.fn();
    renderSection({
      actionTriggerLabel: "Row actions",
      actions: () => [
        { label: "Hide from sidebar", icon: EyeOff, onSelect: onHide },
        {
          label: "Delete",
          icon: Trash2,
          destructive: true,
          separatorBefore: true,
          onSelect: vi.fn(),
        },
      ],
    });

    // One dropdown + one context menu per item, both from the same list.
    const triggers = screen.getAllByRole("button", { name: "Row actions" });
    expect(triggers.length).toBe(2);
    const hides = screen.getAllByRole("menuitem", {
      name: /Hide from sidebar/,
    });
    expect(hides.length).toBeGreaterThanOrEqual(2);

    fireEvent.click(hides[0]);
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it("renders a separator above separatorBefore actions", () => {
    renderSection({
      actionTriggerLabel: "Row actions",
      actions: () => [
        { label: "Only", icon: Folder, onSelect: vi.fn() },
        {
          label: "Delete",
          icon: Trash2,
          destructive: true,
          separatorBefore: true,
          onSelect: vi.fn(),
        },
      ],
    });

    expect(screen.getAllByRole("separator").length).toBeGreaterThanOrEqual(1);
  });

  it("shows hidden items behind the header ⋯ menu and the More row", () => {
    const onShowHidden = vi.fn();
    const onHiddenSelect = vi.fn();
    renderSection({
      hiddenItems: [
        { id: "t-9", name: "Archived table" },
        { id: "t-8", name: "Scratch" },
      ],
      hiddenMenuLabel: "Table sidebar options",
      onShowHidden,
      moreHiddenLabel: "More Tables",
      onHiddenSelect,
    });

    // Header ⋯ menu lists every hidden item with a Show action.
    fireEvent.click(
      screen.getByRole("button", { name: "Table sidebar options" }),
    );
    const showItem = screen
      .getAllByRole("menuitem")
      .find((item) => item.textContent?.includes("Archived table"));
    expect(showItem).toBeTruthy();
    fireEvent.click(showItem!);
    expect(onShowHidden).toHaveBeenCalledWith("t-9");

    // The collapsible More row expands in place and selects.
    expect(screen.getByTestId("tables-more-toggle")).toBeTruthy();
    fireEvent.click(screen.getByTestId("tables-more-toggle"));
    fireEvent.click(screen.getByTestId("tables-more-entry-t-8"));
    expect(onHiddenSelect).toHaveBeenCalledWith("t-8");
  });

  it("applies the muted strikethrough treatment to soft-deleted items", () => {
    renderSection({ items: [{ ...baseItem, muted: true }] });

    const label = screen
      .getAllByRole("button")
      .find((button) => button.textContent === "Invoices")
      ?.querySelector("span.line-through");
    expect(label?.className).toContain("text-muted-foreground");
  });

  it("wraps sortable items with the dnd sortable contract", () => {
    renderSection({
      sortable: { ids: ["t-1", "t-2"], onReorder: vi.fn() },
    });

    expect(
      document.querySelectorAll('[aria-roledescription="sortable"]').length,
    ).toBe(2);
  });

  it("renders the collapsed rail before the expanded group", () => {
    renderSection({
      collapsedRail: <section data-testid="rail">rail</section>,
    });

    expect(screen.getByTestId("rail")).toBeTruthy();
  });

  it("renders the loading / error / empty slots above the items", () => {
    renderSection({
      loadingState: <div role="status">loading</div>,
      errorState: <button type="button">retry</button>,
      emptyState: <p>no tables</p>,
    });

    expect(screen.getByRole("status").textContent).toBe("loading");
    expect(screen.getByRole("button", { name: "retry" })).toBeTruthy();
    expect(screen.getByText("no tables")).toBeTruthy();
  });
});
