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

/**
 * #113: the organization rows ran straight into the theme row with no visual
 * break between the two sections.
 */
describe("UserAvatar organization/theme separator (#113)", () => {
  it("renders a separator between the organization and theme sections", () => {
    openMenu();

    expect(screen.getByTestId("user-menu-theme-separator")).toBeTruthy();
  });

  it("places the separator after the organization section and before the theme row", () => {
    openMenu();

    const separator = screen.getByTestId("user-menu-theme-separator");
    const organization = screen.getByTestId("organization-selector");
    const themeRow = screen.getByTestId("user-menu-theme-toggle");

    expect(
      organization.compareDocumentPosition(separator) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      separator.compareDocumentPosition(themeRow) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("styles the separator as a menu rule", () => {
    openMenu();

    const classes = Array.from(
      screen.getByTestId("user-menu-theme-separator").classList,
    );
    expect(classes).toContain("h-px");
    expect(classes).toContain("bg-border");
  });

  /**
   * Negative control: proves the ordering assertion is real by checking that a
   * separator placed *before* the organization section fails the same check.
   */
  it("negative control: a separator before the organization section is not between the sections", () => {
    render(
      <div>
        <hr data-testid="control-separator" />
        <div data-testid="control-organization" />
        <div data-testid="control-theme" />
      </div>,
    );

    const separator = screen.getByTestId("control-separator");
    const organization = screen.getByTestId("control-organization");

    expect(
      organization.compareDocumentPosition(separator) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeFalsy();
  });
});
