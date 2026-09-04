import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
vi.mock("@/hooks/use-keyboard-shortcuts", () => ({
  useRegisterShortcuts: () => undefined,
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
vi.mock("@/components/team-view-selector", () => ({
  TeamViewSelector: () => <div data-testid="team-view-selector" />,
}));
vi.mock("@/components/user-avatar", () => ({
  UserAvatar: () => <div data-testid="user-avatar" />,
}));
vi.mock("@/components/organization-switcher", () => ({
  OrganizationMenuSection: () => <div data-testid="organization-selector" />,
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
  SidebarHeader: ({ children }: { children: React.ReactNode }) => (
    <header>{children}</header>
  ),
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
  organization = {
    id: "org-1",
    slug: "acme",
    name: "Acme",
    logo: null,
    workEnabled: true,
  };
});

describe("AppSidebar work and footer structure", () => {
  it("keeps TeamViewSelector on top and moves organization switching into footer identity", () => {
    render(<AppSidebar />);
    expect(screen.getByRole("banner")).toContainElement(
      screen.getByTestId("team-view-selector"),
    );
    expect(screen.getByRole("contentinfo")).toContainElement(
      screen.getByTestId("organization-selector"),
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
});
