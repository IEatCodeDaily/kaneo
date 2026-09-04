import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();
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
      recentPages: [
        {
          pathname: "/dashboard/organization/acme/board/delivery",
          label: "Delivery",
        },
        {
          pathname: "/dashboard/organization/acme/projects/launch",
          label: "Launch",
        },
        {
          pathname: "/dashboard/organization/acme/repo/api/code",
          label: "Code",
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
  SidebarMenuSubItem: ({ children }: { children: React.ReactNode }) => (
    <li>{children}</li>
  ),
  SidebarMenuSubButton: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

import { NavMain } from "./nav-main";

afterEach(() => {
  cleanup();
  navigate.mockClear();
});
describe("NavMain compact personal group", () => {
  it("renders Inbox, My Tickets, and expandable Recent in one group", () => {
    render(<NavMain />);
    expect(
      screen.getByRole("button", { name: "navigation:sidebar.inbox" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "navigation:sidebar.myTasks" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "navigation:sidebar.recent" }),
    ).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(
      screen.getByRole("button", { name: "navigation:sidebar.recent" }),
    );
    expect(
      screen.getByRole("button", { name: "Delivery" }),
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
});
