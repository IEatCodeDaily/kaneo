import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * #96: the avatar popup is now the home for the organization selector and the
 * dark/light toggle, both of which used to live in the sidebar chrome.
 */

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ clear: vi.fn() }),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/components/providers/auth-provider/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: "u-1", name: "Ada", email: "ada@example.com", role: "member" },
  }),
}));
vi.mock("@/hooks/mutations/use-sign-out", () => ({
  default: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/queries/config/use-get-config", () => ({
  default: () => ({ data: {} }),
}));
vi.mock("@/hooks/queries/invitation/use-pending-invitations", () => ({
  usePendingInvitations: () => ({ data: [] }),
}));
vi.mock("@/store/board", () => ({
  default: () => ({ setBoard: vi.fn() }),
}));

vi.mock("@/components/organization-switcher", () => ({
  OrganizationMenuSection: () => <div data-testid="organization-selector" />,
}));
vi.mock("@/components/theme-toggle-dropdown", () => ({
  ThemeToggleDropdown: () => <div data-testid="theme-toggle" />,
}));

import { UserAvatar } from "./user-avatar";

afterEach(() => cleanup());

function openMenu() {
  render(<UserAvatar />);
  fireEvent.click(screen.getByRole("button", { name: "Open profile menu" }));
}

describe("UserAvatar menu (#96)", () => {
  it("shows the user info in the popup", () => {
    openMenu();

    expect(screen.getByText("Ada")).toBeTruthy();
    expect(screen.getByText("ada@example.com")).toBeTruthy();
  });

  it("contains the organization selector", () => {
    openMenu();

    expect(screen.getByTestId("organization-selector")).toBeTruthy();
  });

  it("contains the theme toggle", () => {
    openMenu();

    const row = screen.getByTestId("user-menu-theme-toggle");
    expect(row.querySelector("[data-testid='theme-toggle']")).not.toBeNull();
  });

  it("renders no notification bell in the avatar menu", () => {
    openMenu();

    expect(screen.queryByTestId("notification-bell")).toBeNull();
    expect(screen.queryByLabelText(/notification/i)).toBeNull();
  });
});
