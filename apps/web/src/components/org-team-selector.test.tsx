import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: "/dashboard/organization/acme/home" }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: [
      { id: "team-1", name: "Engineering" },
      { id: "team-2", name: "Ops" },
    ],
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
const shortcutMocks = vi.hoisted(() => ({ register: vi.fn() }));
vi.mock("@/hooks/use-keyboard-shortcuts", () => ({
  useRegisterShortcuts: shortcutMocks.register,
  getModifierKeyText: () => "Ctrl",
}));
vi.mock("@/hooks/queries/organization/use-active-organization", () => ({
  default: () => ({
    data: { id: "org-1", slug: "acme", name: "Acme", logo: null },
  }),
}));
vi.mock("@/hooks/queries/organization/use-get-organizations", () => ({
  default: () => ({
    data: [
      { id: "org-1", slug: "acme", name: "Acme", logo: null },
      { id: "org-2", slug: "globex", name: "Globex", logo: null },
    ],
  }),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    organization: {
      listTeams: vi.fn(async () => ({
        data: [
          { id: "team-1", name: "Engineering" },
          { id: "team-2", name: "Ops" },
        ],
      })),
    },
  },
}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));
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
  DropdownMenuGroup: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({ children }: { children: React.ReactNode }) => (
    <div role="menuitem" tabIndex={0}>
      {children}
    </div>
  ),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuShortcut: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));
vi.mock("@/components/ui/sidebar", () => ({
  SidebarMenuButton: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  useSidebar: () => ({ state: "expanded" }),
}));
vi.mock("@/components/user-avatar", () => ({
  UserAvatar: () => <div />,
}));
vi.mock("@/components/version-display", () => ({
  VersionDisplay: () => <div />,
}));
vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <span className={className}>{children}</span>,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  AvatarImage: () => null,
}));

import { OrgTeamSelector } from "./org-team-selector";

afterEach(() => cleanup());

describe("OrgTeamSelector", () => {
  it("shows the org and active team rows in the trigger", () => {
    render(
      <OrgTeamSelector
        open={false}
        onOpenChange={vi.fn()}
        onAddOrganization={vi.fn()}
      />,
    );
    // The org name appears in the trigger and (mocked-open) menu; both count.
    expect(screen.getAllByText("Acme").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("navigation:teamView.all").length,
    ).toBeGreaterThan(0);
  });

  it("lists current-org teams first, then organizations - no Members or Settings", () => {
    render(
      <OrgTeamSelector
        open
        onOpenChange={vi.fn()}
        onAddOrganization={vi.fn()}
      />,
    );
    const items = screen
      .getAllByRole("menuitem")
      .map((item) => item.textContent);
    expect(items.some((text) => text?.includes("Engineering"))).toBe(true);
    expect(items.some((text) => text?.includes("Globex"))).toBe(true);
    const engIndex = items.findIndex((text) => text?.includes("Engineering"));
    const globexIndex = items.findIndex((text) => text?.includes("Globex"));
    expect(engIndex).toBeLessThan(globexIndex);
    expect(items.join(" ")).not.toContain("Members");
    expect(items.join(" ")).not.toContain("Settings");
  });
});
