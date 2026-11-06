import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/keyboard-shortcuts-help", () => ({
  openKeyboardShortcutsHelp: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
const navigate = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ clear: vi.fn() }),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
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
vi.mock("@/hooks/queries/organization/use-active-organization", () => ({
  default: () => ({ data: { slug: "acme" } }),
}));
vi.mock("@/store/board", () => ({ default: () => ({ setBoard: vi.fn() }) }));
vi.mock("@/components/theme-toggle-dropdown", () => ({
  ThemeToggleDropdown: () => <div data-testid="theme-toggle" />,
}));

import { UserAvatar } from "./user-avatar";

afterEach(cleanup);
function openMenu() {
  render(<UserAvatar />);
  fireEvent.click(screen.getByRole("button", { name: "Open profile menu" }));
}
describe("UserAvatar account-only menu", () => {
  it("retains nameplate, invitations, trash, shortcuts, theme, and logout", () => {
    openMenu();
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "navigation:sidebar.invitations" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "navigation:sidebar.trash" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("profile-menu-shortcuts")).toBeInTheDocument();
    expect(screen.getByTestId("theme-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("user-menu-logout")).toBeInTheDocument();
  });
  it("removes organization switching, organization creation, and Settings", () => {
    openMenu();
    expect(screen.queryByTestId("organization-selector")).toBeNull();
    expect(screen.queryByText("navigation:userMenu.settings")).toBeNull();
    expect(screen.queryByText(/add organization/i)).toBeNull();
  });
});
