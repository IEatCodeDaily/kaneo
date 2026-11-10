import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("__APP_VERSION__", "0.0.0-test");
let organization = {
  id: "org-1",
  slug: "acme",
  name: "Acme",
  logo: null,
  workEnabled: true,
};
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: "/dashboard/organization/acme" }),
}));
vi.mock("@/hooks/use-remembered-view", () => ({
  useRememberCurrentView: () => undefined,
}));
vi.mock("@/hooks/use-user-websocket", () => ({
  useUserWebSocket: () => undefined,
}));
const shortcutMocks = vi.hoisted(() => ({ register: vi.fn() }));
vi.mock("@/hooks/use-keyboard-shortcuts", () => ({
  useRegisterShortcuts: shortcutMocks.register,
  getModifierKeyText: () => "Ctrl",
}));
vi.mock("@/hooks/queries/organization/use-active-organization", () => ({
  default: () => ({ data: organization }),
}));
vi.mock("@/components/search", () => ({ default: () => <div /> }));
vi.mock("./search", () => ({ default: () => <div /> }));
vi.mock("@/components/nav-main", () => ({
  NavMain: () => <div data-testid="nav-main" />,
}));
vi.mock("@/components/nav-work", () => ({
  NavWork: () => <div data-testid="nav-work" />,
}));
vi.mock("@/components/nav-boards", () => ({
  NavBoards: () => <div data-testid="nav-boards" />,
}));
vi.mock("@/components/nav-projects", () => ({
  NavProjects: () => <div data-testid="nav-projects" />,
}));
vi.mock("@/components/nav-repos", () => ({
  NavRepos: () => <div data-testid="nav-repos" />,
}));
vi.mock("@/components/nav-tables", () => ({
  NavTables: () => <div data-testid="nav-tables" />,
}));
vi.mock("@/components/nav-dashboards", () => ({
  NavDashboards: () => <div data-testid="nav-dashboards" />,
}));
vi.mock("@/components/org-team-selector", () => ({
  OrgTeamSelector: (props: { open?: boolean }) => (
    <div data-testid="org-team-selector">
      <button
        type="button"
        data-testid="sidebar-organization-identity"
        aria-expanded={props.open ?? false}
      />
    </div>
  ),
}));
vi.mock("@/components/user-avatar", () => ({
  UserAvatar: () => <div data-testid="user-avatar" />,
}));

vi.mock("@/components/shared/modals/create-organization-modal", () => ({
  default: () => null,
}));
vi.mock("@/components/ui/menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/components/ui/sidebar", () => ({
  Sidebar: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarHeader: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <header className={className}>{children}</header>,
  SidebarContent: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
  SidebarFooter: ({ children }: { children: React.ReactNode }) => (
    <footer>{children}</footer>
  ),
  SidebarTrigger: () => <button type="button">toggle</button>,
  useSidebar: () => ({ toggleSidebar: vi.fn(), state: "expanded" }),
}));

import { AppSidebar } from "./app-sidebar";

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  organization = {
    id: "org-1",
    slug: "acme",
    name: "Acme",
    logo: null,
    workEnabled: true,
  };
});

describe("AppSidebar work and footer structure", () => {
  it("registers W S to open organization switching", () => {
    render(<AppSidebar />);
    const options =
      shortcutMocks.register.mock.calls[
        shortcutMocks.register.mock.calls.length - 1
      ][0];
    expect(options.sequentialShortcuts?.w?.s).toBeTypeOf("function");
    act(() => options.sequentialShortcuts.w.s());
    expect(screen.getByTestId("sidebar-organization-identity")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });
  it("merges organization and team selection in the header", () => {
    render(<AppSidebar />);
    const header = screen.getByRole("banner");
    const footer = screen.getByRole("contentinfo");
    expect(header).toContainElement(screen.getByTestId("org-team-selector"));
    expect(header).toContainElement(
      screen.getByTestId("sidebar-organization-identity"),
    );
    expect(footer).not.toContainElement(
      screen.getByTestId("org-team-selector"),
    );
    expect(footer).toContainElement(screen.getByRole("button", { name: "Members" }));
    expect(footer).toContainElement(screen.getByTestId("user-avatar"));
  });
  it("pins search and primary nav above the scrolling resources", () => {
    render(<AppSidebar />);
    const main = screen.getByRole("main");
    const pinned = main.firstElementChild as HTMLElement;
    expect(pinned.className).toContain("sticky");
    expect(pinned.className).toContain("top-0");
    expect(pinned.className).toContain("bg-sidebar");
    expect(pinned).toContainElement(screen.getByTestId("nav-main"));
  });
  it("lays out the team selector and toggle horizontally", () => {
    render(<AppSidebar />);
    expect(screen.getByTestId("sidebar-header").className).toContain(
      "flex-row",
    );
  });
  it("shows Work/Resources mode only at the feature boundary", () => {
    render(<AppSidebar />);
    expect(screen.getByRole("button", { name: "Work" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Resources" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("nav-work")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resources" }));
    expect(screen.getByTestId("nav-boards")).toBeInTheDocument();
  });
  it("uses one flat segmented surface with standard active row semantics", () => {
    render(<AppSidebar />);
    const work = screen.getByRole("button", { name: "Work" });
    const resources = screen.getByRole("button", { name: "Resources" });
    expect(work.parentElement?.className).toContain("bg-sidebar-accent");
    for (const button of [work, resources]) {
      expect(button.className).toContain("gap-1.5");
      expect(button.className).toContain(
        "data-[active=true]:bg-sidebar-accent",
      );
      expect(button.className).not.toContain("bg-background");
      expect(button.querySelector("svg")?.getAttribute("class")).toContain(
        "size-4",
      );
    }
    expect(work).toHaveAttribute("data-active", "true");
    expect(resources).toHaveAttribute("data-active", "false");
  });
  it("contains Work completely when the Alpha feature is disabled", () => {
    organization = { ...organization, workEnabled: false };
    render(<AppSidebar />);
    expect(screen.queryByRole("button", { name: "Work" })).toBeNull();
    expect(screen.queryByTestId("nav-work")).toBeNull();
    expect(screen.getByTestId("nav-boards")).toBeInTheDocument();
    expect(screen.getByTestId("nav-repos")).toBeInTheDocument();
    expect(screen.getByTestId("nav-tables")).toBeInTheDocument();
  });

  it("renders Settings once as a bottom navigation link", () => {
    render(<AppSidebar />);
    expect(screen.getAllByRole("button", { name: "Settings" })).toHaveLength(1);
  });
  it("uses standard sidebar hover styling for Settings", () => {
    render(<AppSidebar />);
    expect(
      screen.getByRole("button", { name: "Settings" }).className,
    ).toContain("hover:bg-sidebar-accent");
  });
  /**
   * better-accessibility: the row was a raw <button>, so it never picked up
   * the sidebar focus-visible ring and keyboard users fell back to the
   * browser outline (auto 1px @ 50% alpha) — invisible on the #0a0a0b rail.
   */
  it("gives the Settings link a visible keyboard focus ring", () => {
    render(<AppSidebar />);
    const cls = screen.getByRole("button", { name: "Settings" }).className;
    expect(cls).toContain("focus-visible:ring-2");
    expect(cls).toContain("ring-sidebar-ring");
  });

  it("restores the organization-scoped mode from session storage", () => {
    sessionStorage.setItem("kaneo:sidebar-mode:org-1", "resources");
    render(<AppSidebar />);
    expect(screen.getByTestId("nav-boards")).toBeInTheDocument();
    expect(screen.queryByTestId("nav-work")).toBeNull();
  });
});
