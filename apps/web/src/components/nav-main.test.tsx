import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();
let pathname = "/dashboard/organization/org-1/boards";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  useLocation: () => ({ pathname }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/hooks/queries/organization/use-active-organization", () => ({
  default: () => ({ data: { id: "org-1", name: "Org" } }),
}));

vi.mock("@/components/providers/auth-provider/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "u-1", role: "member" } }),
}));

// The Inbox entry now renders InboxUnreadBadge, which calls useGetNotifications
// (a real useQuery). This suite renders without a QueryClientProvider, so the
// hook must be mocked or every case dies with "No QueryClient set".
vi.mock("@/hooks/queries/notification/use-get-notifications", () => ({
  default: () => ({
    data: [
      { id: "n-1", isRead: false },
      { id: "n-2", isRead: true },
    ],
  }),
}));

// Same story for the My Tasks entry, which renders MyTasksCountBadge on top of
// useGetMyTasks (KFL-141).
vi.mock("@/hooks/queries/task/use-get-my-tasks", () => ({
  default: () => ({ data: [{ id: "t-1" }, { id: "t-2" }, { id: "t-3" }] }),
}));

vi.mock("@/components/ui/sidebar", () => ({
  SidebarGroup: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
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
    isActive,
    onClick,
    tooltip,
  }: {
    children: React.ReactNode;
    isActive?: boolean;
    onClick?: () => void;
    tooltip?: string;
  }) => (
    // The real primitive renders `tooltip` into a Tooltip popup that is only
    // visible when the sidebar is collapsed to icons. In jsdom we surface it as
    // the accessible name + a title, which is what a hover tooltip exposes.
    <button
      type="button"
      aria-current={isActive}
      aria-label={typeof tooltip === "string" ? tooltip : undefined}
      onClick={onClick}
      title={typeof tooltip === "string" ? tooltip : undefined}
    >
      {children}
    </button>
  ),
}));

import { NavMain } from "./nav-main";

afterEach(() => {
  cleanup();
  navigate.mockClear();
  pathname = "/dashboard/organization/org-1/boards";
});

/**
 * #58 shipped two cross-board pages that were initially unreachable — the
 * routes existed and compiled, but nothing linked to them. These cases pin the
 * nav entries so the pages cannot silently become orphaned again.
 */
describe("NavMain cross-board entries (#58)", () => {
  it("links to the Inbox page", () => {
    render(<NavMain />);

    fireEvent.click(
      screen.getByRole("button", { name: "navigation:sidebar.inbox" }),
    );

    expect(navigate).toHaveBeenCalledWith({
      to: "/dashboard/organization/org-1/inbox",
    });
  });

  it("links to the My Tasks page", () => {
    render(<NavMain />);

    fireEvent.click(
      screen.getByRole("button", { name: "navigation:sidebar.myTasks" }),
    );

    expect(navigate).toHaveBeenCalledWith({
      to: "/dashboard/organization/org-1/my-tasks",
    });
  });

  it("marks My Tasks active when it is the current route", () => {
    pathname = "/dashboard/organization/org-1/my-tasks";
    render(<NavMain />);

    expect(
      screen
        .getByRole("button", { name: "navigation:sidebar.myTasks" })
        .getAttribute("aria-current"),
    ).toBe("true");
    // Inbox must not also report itself as active.
    expect(
      screen
        .getByRole("button", { name: "navigation:sidebar.inbox" })
        .getAttribute("aria-current"),
    ).toBe("false");
  });

  it("still renders the existing Members entry", () => {
    render(<NavMain />);

    expect(
      screen.getByRole("button", { name: "navigation:sidebar.members" }),
    ).toBeTruthy();
  });
});

/**
 * #145: Trash moved out of the sidebar into the profile popup menu. The
 * counterpart assertion — that the entry exists there and routes to the trash
 * page — lives in user-avatar.test.tsx.
 */
describe("NavMain trash entry moved to the profile menu (#145)", () => {
  it("no longer renders a Trash entry in the sidebar nav", () => {
    render(<NavMain />);

    expect(
      screen.queryByRole("button", { name: "navigation:sidebar.trash" }),
    ).toBeNull();
  });
});

/**
 * #93: the sidebar can be minimized to an icon-only rail, so every nav entry
 * needs (a) an icon that survives the collapse and (b) its name exposed as a
 * hover tooltip, which is the only label left once the text is hidden.
 */
describe("NavMain icons and minimized tooltips (#93)", () => {
  const entries = [
    "navigation:sidebar.inbox",
    "navigation:sidebar.myTasks",
    "navigation:sidebar.members",
  ];
  // Trash (#53) used to be listed here as an optional entry; it now lives in
  // the profile popup menu (#145) and is covered by user-avatar.test.tsx.

  it("renders an icon inside every nav entry", () => {
    render(<NavMain />);

    for (const name of entries) {
      const button = screen.getByRole("button", { name });
      expect(button.querySelector("svg")).not.toBeNull();
    }
  });

  it("exposes each nav item name as a tooltip for the icon-only state", () => {
    render(<NavMain />);

    for (const name of entries) {
      // `tooltip` is what the sidebar primitive shows on hover while collapsed.
      expect(screen.getByRole("button", { name }).getAttribute("title")).toBe(
        name,
      );
    }
  });

  it("keeps every entry clickable when only icons are visible", () => {
    render(<NavMain />);

    fireEvent.click(screen.getByRole("button", { name: entries[0] }));

    expect(navigate).toHaveBeenCalledWith({
      to: "/dashboard/organization/org-1/inbox",
    });
  });
});
