import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * #96: the sidebar top is `Team selector | Sidebar toggle`, the avatar sits at
 * the bottom, the organization selector and theme toggle live in the avatar
 * popup instead of the sidebar chrome, and the notification bell is gone
 * because it duplicated Inbox.
 */

// `__APP_VERSION__` is a Vite `define`, so it is a bare global at runtime.
vi.stubGlobal("__APP_VERSION__", "0.0.0-test");

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: "/dashboard/organization/org-1" }),
}));

vi.mock("@/hooks/use-remembered-view", () => ({
  useRememberCurrentView: () => undefined,
}));
vi.mock("@/hooks/use-user-websocket", () => ({
  useUserWebSocket: () => undefined,
}));
vi.mock("@/hooks/queries/organization/use-active-organization", () => ({
  default: () => ({
    data: { id: "org-1", name: "NevrLabs", logo: null },
  }),
}));
vi.mock("@/hooks/use-keyboard-shortcuts", () => ({
  useRegisterShortcuts: () => undefined,
  getModifierKeyText: () => "Ctrl",
}));

vi.mock("@/components/search", () => ({ default: () => <div /> }));
vi.mock("./search", () => ({ default: () => <div /> }));
vi.mock("@/components/nav-main", () => ({ NavMain: () => <div /> }));
vi.mock("@/components/nav-boards", () => ({
  NavBoards: () => <div data-testid="nav-boards" />,
}));
vi.mock("@/components/nav-repos", () => ({
  NavRepos: () => <div data-testid="nav-repos" />,
}));
vi.mock("@/components/nav-tables", () => ({
  NavTables: () => <div data-testid="nav-tables" />,
}));

vi.mock("@/components/team-view-selector", () => ({
  TeamViewSelector: () => <div data-testid="team-view-selector" />,
}));
vi.mock("@/components/user-avatar", () => ({
  UserAvatar: () => <div data-testid="user-avatar" />,
}));

vi.mock("@/components/ui/sidebar", () => ({
  Sidebar: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar">{children}</div>
  ),
  SidebarHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-header-slot">{children}</div>
  ),
  SidebarContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-content-slot">{children}</div>
  ),
  SidebarFooter: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-footer-slot">{children}</div>
  ),

  SidebarTrigger: (props: Record<string, unknown>) => (
    <button
      data-testid={(props["data-testid"] as string) ?? "sidebar-trigger"}
      type="button"
    >
      toggle
    </button>
  ),
  useSidebar: () => ({ toggleSidebar: vi.fn() }),
}));

import { AppSidebar } from "./app-sidebar";

afterEach(() => cleanup());

describe("AppSidebar layout (#96)", () => {
  it("puts the team-view selector and the sidebar toggle together at the top", () => {
    render(<AppSidebar />);

    const header = screen.getByTestId("sidebar-header-slot");
    expect(
      header.querySelector("[data-testid='team-view-selector']"),
    ).not.toBeNull();
    expect(
      header.querySelector("[data-testid='sidebar-toggle']"),
    ).not.toBeNull();
  });

  it("separates main navigation, Boards, and Repos in the collapsed rail", () => {
    render(<AppSidebar />);

    for (const testId of [
      "sidebar-main-boards-divider",
      "sidebar-boards-repos-divider",
    ]) {
      const divider = screen.getByTestId(testId);
      expect(divider.className).toContain(
        "group-data-[collapsible=icon]:block",
      );
      expect(divider.className).toContain("hidden");
    }
  });

  it("toggles Boards and Repos while keeping Tables visible", () => {
    render(<AppSidebar />);
    expect(screen.getByRole("tab", { name: "Boards" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByTestId("nav-tables")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Repos" }));

    expect(screen.getByRole("tab", { name: "Repos" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByTestId("nav-tables")).toBeInTheDocument();
  });

  it("does not render the organization selector at the sidebar top", () => {
    render(<AppSidebar />);

    const header = screen.getByTestId("sidebar-header-slot");
    expect(
      header.querySelector("[data-testid='organization-selector']"),
    ).toBeNull();
    expect(screen.queryByTestId("organization-selector")).toBeNull();
  });

  it("moves the avatar to the bottom of the sidebar", () => {
    render(<AppSidebar />);

    const footer = screen.getByTestId("sidebar-footer-slot");
    expect(footer.querySelector("[data-testid='user-avatar']")).not.toBeNull();
    // ...and nowhere near the top any more.
    expect(
      screen
        .getByTestId("sidebar-header-slot")
        .querySelector("[data-testid='user-avatar']"),
    ).toBeNull();
  });

  it("tucks the version number into the bottom of the sidebar", () => {
    render(<AppSidebar />);

    const footer = screen.getByTestId("sidebar-footer-slot");
    expect(
      footer.querySelector("[data-testid='version-display']"),
    ).not.toBeNull();
  });

  it("renders no notification bell anywhere in the sidebar", () => {
    render(<AppSidebar />);

    const sidebar = screen.getByTestId("sidebar");
    expect(
      sidebar.querySelector("[data-testid='notification-bell']"),
    ).toBeNull();
    expect(sidebar.querySelector(".lucide-bell")).toBeNull();
    expect(screen.queryByLabelText(/notification/i)).toBeNull();
  });

  it("does not render the theme toggle in the sidebar chrome", () => {
    render(<AppSidebar />);

    expect(
      screen.getByTestId("sidebar").querySelector("[data-slot='switch']"),
    ).toBeNull();
    expect(screen.queryByLabelText("Toggle theme")).toBeNull();
  });
});
