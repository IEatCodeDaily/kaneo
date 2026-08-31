import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectDetailRouteComponent } from "./index";

const navigate = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({}),
  useNavigate: () => navigate,
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

vi.mock("@/components/page-title", () => ({ default: () => null }));

vi.mock("@/components/project/project-header", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/project/project-overview", () => ({
  default: () => <div data-testid="project-overview" />,
}));

const useProjectSlugMock = vi.fn();
vi.mock("@/hooks/use-project-slug", () => ({
  useProjectSlug: () => useProjectSlugMock(),
}));

afterEach(() => {
  navigate.mockClear();
  useProjectSlugMock.mockReset();
  cleanup();
});

/**
 * KFL-366: resolving an alias slug must replace the URL with the canonical
 * slug (`replace: true`), not push a new history entry, so the back button
 * does not bounce through the old alias.
 */
describe("Project detail route alias navigation", () => {
  it("replaces the URL with the canonical slug when the resolver reports usedSlugAlias", () => {
    useProjectSlugMock.mockReturnValue({
      project: { id: "project-1", slug: "canonical-slug", name: "Growth" },
      usedSlugAlias: true,
      isLoading: false,
      organizationSlug: "acme",
    });

    render(<ProjectDetailRouteComponent />);

    expect(navigate).toHaveBeenCalledWith({
      to: "/dashboard/organization/$organizationSlug/projects/$projectSlug",
      params: { organizationSlug: "acme", projectSlug: "canonical-slug" },
      replace: true,
    });
  });

  it("never navigates when the slug was already canonical", () => {
    useProjectSlugMock.mockReturnValue({
      project: { id: "project-1", slug: "canonical-slug", name: "Growth" },
      usedSlugAlias: false,
      isLoading: false,
      organizationSlug: "acme",
    });

    render(<ProjectDetailRouteComponent />);

    expect(navigate).not.toHaveBeenCalled();
  });
});
