import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  setActive: vi.fn(async () => ({ error: null })),
  invalidate: vi.fn(async () => undefined),
  shortcuts: vi.fn(),
  resetTeam: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("react-i18next", async (original) => ({
  ...(await original<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useLocation: () => ({ pathname: "/dashboard/organization/first/my-tasks" }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}));
vi.mock("@/hooks/queries/organization/use-active-organization", () => ({
  default: () => ({ data: { id: "one", slug: "first", name: "First" } }),
}));
vi.mock("@/hooks/queries/organization/use-get-organizations", () => ({
  default: () => ({
    data: [
      { id: "one", slug: "first", name: "First" },
      { id: "two", slug: "second", name: "Second" },
    ],
  }),
}));
vi.mock("@/hooks/use-keyboard-shortcuts", () => ({
  getModifierKeyText: () => "Ctrl",
  useRegisterShortcuts: mocks.shortcuts,
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: { organization: { setActive: mocks.setActive } },
}));
vi.mock("@/components/ui/menu", () => ({
  DropdownMenuGroup: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuShortcut: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  DropdownMenuItem: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
  }) => (
    <button disabled={disabled} onClick={onClick} type="button">
      {children}
    </button>
  ),
}));

vi.mock("@/store/team-view", () => ({
  useTeamViewStore: { getState: () => ({ setTeamView: mocks.resetTeam }) },
}));
vi.mock("@/lib/toast", () => ({ toast: { error: mocks.toastError } }));

import { OrganizationMenuSection } from "./organization-switcher";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("switches by slug, preserves My Tickets, and registers real W-digit shortcuts", async () => {
  render(<OrganizationMenuSection onCreateOrganization={() => undefined} />);
  fireEvent.click(screen.getByRole("button", { name: /Second/ }));
  await waitFor(() =>
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/dashboard/organization/$organizationSlug/my-tasks",
      params: { organizationSlug: "second" },
    }),
  );
  expect(mocks.setActive).toHaveBeenCalledWith({ organizationId: "two" });
  expect(mocks.invalidate).toHaveBeenCalled();
  expect(mocks.navigate.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.invalidate.mock.invocationCallOrder[0],
  );
  expect(mocks.resetTeam).toHaveBeenCalledWith(null, null);
  expect(
    mocks.shortcuts.mock.calls[mocks.shortcuts.mock.calls.length - 1]?.[0]
      .sequentialShortcuts.w["2"],
  ).toBeTypeOf("function");
});
