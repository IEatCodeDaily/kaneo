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
  }: {
    children: React.ReactNode;
    isActive?: boolean;
    onClick?: () => void;
  }) => (
    <button type="button" aria-current={isActive} onClick={onClick}>
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
