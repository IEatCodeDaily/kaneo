import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const setRecentPageLimit = vi.fn();
const navigate = vi.fn();
let recentOpen = false;
const setRecentOpen = vi.fn((open: boolean) => {
  recentOpen = open;
});
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  useLocation: () => ({ pathname: "/dashboard/organization/acme/inbox" }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/hooks/queries/organization/use-active-organization", () => ({
  default: () => ({ data: { id: "org-1", slug: "acme" } }),
}));
vi.mock("@/store/user-preferences", () => ({
  useUserPreferencesStore: (selector: (state: unknown) => unknown) =>
    selector({
      setRecentPageLimit,
      recentOpen,
      setRecentOpen,
      recentPageLimit: 5,
      recentPages: [
        {
          pathname: "/dashboard/organization/acme/board/delivery",
          label: "Delivery",
          openedAt: Date.now() - 60_000,
        },
        {
          pathname: "/dashboard/organization/acme/projects/launch",
          label: "Launch",
          openedAt: Date.now() - 3_600_000,
        },
        {
          pathname: "/dashboard/organization/acme/repo/api/code",
          label: "Code",
          openedAt: Date.now() - 86_400_000,
        },
      ],
    }),
}));
vi.mock("@/components/providers/auth-provider/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "u-1" } }),
}));
vi.mock(
  "@/hooks/queries/notification/use-get-unread-notification-count",
  () => ({ default: () => ({ data: { count: 1 } }) }),
);
vi.mock("@/hooks/queries/task/use-get-my-tasks", () => ({
  default: () => ({ data: [{ id: "1" }] }),
}));
vi.mock("@/hooks/queries/flag/use-get-my-flags", () => ({
  default: () => ({ data: [] }),
}));
vi.mock("@/components/ui/context-menu", () => ({
  ContextMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ContextMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  ContextMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ContextMenuRadioGroup: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ContextMenuRadioItem: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));
vi.mock("@/components/ui/sidebar", () => ({
  SidebarGroup: ({ children }: { children: React.ReactNode }) => (
    <section>{children}</section>
  ),
  SidebarGroupContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarMenu: ({ children }: { children: React.ReactNode }) => (
    <ul>{children}</ul>
  ),
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => (
    <li>{children}</li>
  ),
  SidebarMenuButton: ({
    children,
    onClick,
    className,
    tooltip,
    ...props
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
    tooltip?: string;
    "aria-label"?: string;
    "aria-expanded"?: boolean;
  }) => (
    <button
      type="button"
      className={className}
      aria-label={props["aria-label"] ?? tooltip}
      aria-expanded={props["aria-expanded"]}
      onClick={onClick}
    >
      {children}
    </button>
  ),
  SidebarMenuSub: ({ children }: { children: React.ReactNode }) => (
    <ul>{children}</ul>
  ),
  SidebarMenuSubItem: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <li className={className}>{children}</li>,
  SidebarMenuSubButton: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <button type="button" className={className}>
      {children}
    </button>
  ),
}));

import { NavMain } from "./nav-main";

afterEach(() => {
  recentOpen = false;
  setRecentOpen.mockClear();
  cleanup();
  navigate.mockClear();
});
describe("NavMain compact personal group", () => {
  it("renders Inbox, My Tickets, and expandable Recent in one group", () => {
    const view = render(<NavMain />);
    expect(
      screen.getByRole("button", { name: "navigation:sidebar.inbox" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "navigation:sidebar.myTasks" }),
    ).toBeInTheDocument();
    const recent = screen.getByRole("button", {
      name: "navigation:sidebar.recent",
    });
    expect(recent).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(recent);
    view.rerender(<NavMain />);
    expect(
      screen.getByRole("button", { name: /Delivery/ }),
    ).toBeInTheDocument();
  });
  it("uses compact rows and separate count and chevron columns", () => {
    render(<NavMain />);
    expect(
      screen.getByRole("button", { name: "navigation:sidebar.inbox" })
        .className,
    ).toContain("h-7");
    expect(screen.getByTestId("inbox-count-column").className).toContain("w-5");
    expect(screen.getByTestId("recent-chevron-column").className).toContain(
      "w-5",
    );
  });
  it("renders compact Recent rows with relative open times", () => {
    const view = render(<NavMain />);
    fireEvent.click(
      screen.getByRole("button", { name: "navigation:sidebar.recent" }),
    );
    view.rerender(<NavMain />);
    const delivery = screen.getByRole("button", { name: /Delivery/ });
    expect(delivery.className).toContain("h-6");
    expect(delivery.className).toContain("text-[11px]");
    expect(delivery).toHaveTextContent("1m");
  });

  it("offers persisted Recent limits from three through eight", () => {
    render(<NavMain />);
    for (const limit of [3, 4, 5, 6, 7, 8]) {
      expect(
        screen.getByRole("button", { name: String(limit) }),
      ).toBeInTheDocument();
    }
  });
});
