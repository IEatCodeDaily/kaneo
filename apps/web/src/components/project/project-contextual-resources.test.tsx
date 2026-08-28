import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectContextualResources } from "./project-contextual-resources";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("./project-resource-link-dialog", () => ({
  default: () => null,
}));

vi.mock("./project-resource-unlink-dialog", () => ({
  default: () => null,
}));

vi.mock("./project-resource-row", () => ({
  default: ({ link }: { link: { resource: { name: string } } }) => (
    <li data-testid="project-resource-row">{link.resource.name}</li>
  ),
}));

const mutationMock = { isPending: false, mutate: vi.fn() };
vi.mock("@/hooks/mutations/project/use-delete-project-resource-link", () => ({
  default: () => mutationMock,
}));

const permissionMock = { canUpdateProjects: () => false };
vi.mock("@/hooks/use-organization-permission", () => ({
  useOrganizationPermission: () => permissionMock,
}));

vi.mock("@/hooks/queries/project/use-get-project-resources", () => ({
  default: () => ({ data: [], isLoading: false }),
}));

afterEach(() => cleanup());

describe("ProjectContextualResources", () => {
  it("renders a titled section distinct from the scoped-work section", () => {
    render(
      <ProjectContextualResources
        organizationId="org-1"
        organizationSlug="org-slug"
        projectId="project-1"
      />,
    );

    expect(
      screen.getByTestId("project-contextual-resources"),
    ).toBeInTheDocument();
    expect(screen.getByText("projects:resources.title")).toBeInTheDocument();
    expect(
      screen.getByText("projects:resources.emptyTitle"),
    ).toBeInTheDocument();
    // Edit controls are gated: no add button when the viewer cannot update.
    expect(
      screen.queryByText("projects:resources.addResource"),
    ).not.toBeInTheDocument();
  });
});
