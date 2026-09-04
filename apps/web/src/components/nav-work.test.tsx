import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * KFL-378 polish pass, driven by the better-ui / better-accessibility /
 * better-colors / better-layout review skills.
 *
 * Each test pins a measured live defect:
 *  - HIGH   focus: the Settings row was a raw <button> with no
 *           focus-visible ring, so keyboard users got the browser default
 *           (outline auto 1px @ 50% alpha) which is invisible on #0a0a0b.
 *  - MEDIUM disabled placeholders leaned on opacity-50 alone (~1.9:1).
 *           better-accessibility: never rely on one channel; add a text cue.
 *  - MEDIUM group rhythm: inter-group gap measured 4px against a 4px
 *           intra-group gap. better-layout wants >= 2x separation.
 *  - LOW    icon stroke was 2px beside 12px/400 text; better-ui matches
 *           1.5px stroke to regular text weight.
 */

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: "/dashboard/organization/acme/projects" }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));
vi.mock("@/hooks/queries/organization/use-active-organization", () => ({
  default: () => ({ data: { id: "org-1", slug: "acme", name: "Acme" } }),
}));
vi.mock("./nav-projects", () => ({
  NavProjects: () => <div data-testid="nav-projects" />,
}));

import { SidebarProvider } from "@/components/ui/sidebar";
import { NavWork } from "./nav-work";

// jsdom has no matchMedia; SidebarProvider -> useIsMobile needs it.
beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

const renderWork = () =>
  render(
    <SidebarProvider>
      <NavWork />
    </SidebarProvider>,
  );

afterEach(cleanup);

describe("sidebar polish contracts", () => {
  it("gives disabled Work placeholders a non-colour cue and a real disabled role", () => {
    renderWork();
    for (const label of ["Initiatives", "Digest", "Views"]) {
      const row = screen.getByRole("button", { name: new RegExp(label) });
      // better-accessibility: state must not be carried by opacity alone.
      expect(row).toHaveAttribute("aria-disabled", "true");
      expect(row.textContent).toMatch(/Soon/i);
    }
  });

  it("keeps placeholder icons at the stroke weight of the label text", () => {
    renderWork();
    const row = screen.getByRole("button", { name: /Initiatives/ });
    const svg = row.querySelector("svg");
    // better-ui: 1.5px stroke beside regular (400) 12px text.
    expect(svg?.getAttribute("stroke-width")).toBe("1.5");
  });

  it("separates the Work group from its neighbours by more than the row gap", () => {
    const { container } = renderWork();
    const group = container.querySelector('[data-sidebar="group"]');
    // better-layout: inter-group space must beat the 2px/gap-0.5 intra-group step.
    expect(group?.className).toContain("pt-2");
  });
});
