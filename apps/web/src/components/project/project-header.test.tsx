import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectHeader } from "./project-header";

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));
vi.mock("@/components/common/mobile-user-fab", () => ({
  MobileUserFab: () => null,
}));
vi.mock("@/components/demo-alert", () => ({ DemoAlert: () => null }));
vi.mock("@/store/user-preferences", () => ({
  useUserPreferencesStore: () => ({
    setSidebarDefaultOpen: vi.fn(),
    sidebarDefaultOpen: false,
  }),
}));
vi.mock("@/components/app-sidebar", () => ({ AppSidebar: () => null }));
vi.mock("@/hooks/queries/organization/use-active-organization", () => ({
  default: () => ({ data: { id: "org-1", slug: "acme", name: "Acme Inc" } }),
}));

const ORIGINAL_INNER_WIDTH = window.innerWidth;

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 375,
  });
  window.dispatchEvent(new Event("resize"));
});

afterEach(() => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: ORIGINAL_INNER_WIDTH,
  });
  cleanup();
});

/**
 * KFL-366 spec: at 375px the Project header, its actions and its content
 * remain usable. ProjectHeader delegates to OrganizationLayout, which keeps
 * the breadcrumb shrinkable/truncatable and header actions non-shrinking
 * (`shrink-0`) so a long title never pushes actions off-screen or under an
 * overflow clip — the same contract Board's overview relies on.
 */
describe("ProjectHeader at 375px viewport", () => {
  it("keeps header actions non-shrinking and reachable", () => {
    render(
      <ProjectHeader
        headerActions={<button type="button">New project</button>}
        title="A very long project title that could overflow on mobile"
      >
        <div>content</div>
      </ProjectHeader>,
    );

    const actionButton = screen.getByRole("button", {
      name: "New project",
    });
    expect(actionButton).toBeVisible();

    const actionsContainer = actionButton.parentElement;
    expect(actionsContainer?.className.split(/\s+/)).toContain("shrink-0");
  });

  it("keeps the breadcrumb title shrinkable and truncated rather than clipped or hidden", () => {
    render(
      <ProjectHeader
        headerActions={<button type="button">New project</button>}
        title="A very long project title that could overflow on mobile"
      >
        <div>content</div>
      </ProjectHeader>,
    );

    const title = screen.getByText(
      "A very long project title that could overflow on mobile",
    );
    expect(title).toBeVisible();
    expect(title.className.split(/\s+/)).toContain("truncate");
  });

  it("renders the header content", () => {
    render(
      <ProjectHeader headerActions={null} title="Growth Initiative">
        <div>Project overview content</div>
      </ProjectHeader>,
    );

    expect(screen.getByText("Project overview content")).toBeVisible();
  });
});
