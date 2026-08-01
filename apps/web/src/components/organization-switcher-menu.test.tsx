import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/menu";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/hooks/queries/organization/use-active-organization", () => ({
  default: () => ({ data: { id: "org-1", name: "NevrLabs" } }),
}));
vi.mock("@/hooks/queries/organization/use-get-organizations", () => ({
  default: () => ({ data: [{ id: "org-1", name: "NevrLabs" }] }),
}));
vi.mock("@/hooks/use-keyboard-shortcuts", () => ({
  getModifierKeyText: () => "Ctrl",
  useRegisterShortcuts: () => undefined,
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: { organization: { setActive: vi.fn() } },
}));
vi.mock("./shared/modals/create-organization-modal", () => ({
  default: () => null,
}));

import { OrganizationMenuSection } from "./organization-switcher";

afterEach(cleanup);

describe("OrganizationMenuSection Base UI contract (#96)", () => {
  it("opens inside the real menu primitives without production error #31", () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Profile</DropdownMenuTrigger>
        <DropdownMenuContent>
          <OrganizationMenuSection />
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    expect(() =>
      fireEvent.click(screen.getByRole("button", { name: "Profile" })),
    ).not.toThrow();
    expect(screen.getByText("NevrLabs")).toBeTruthy();
    expect(
      screen.getByText("navigation:organizationSwitcher.organizations"),
    ).toBeTruthy();
  });
});
