import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrganizationGithubConnection } from "./organization-github-connection";

vi.mock("@/hooks/queries/organization/use-active-organization", () => ({
  default: () => ({ data: { id: "org-1", name: "Noovoleum" } }),
}));
vi.mock("@/hooks/use-organization-permission", () => ({
  useOrganizationPermission: () => ({ canManageOrganization: () => true }),
}));
vi.mock(
  "@/hooks/queries/organization-github/use-organization-github-installations",
  () => ({
    useAvailableOrganizationGithubInstallations: () => ({ data: [] }),
    useOrganizationGithubInstallations: () => ({ data: [], isLoading: false }),
  }),
);
vi.mock(
  "@/hooks/mutations/organization-github/use-organization-github-installations",
  () => ({
    useConnectOrganizationGithubInstallation: () => ({ isPending: false }),
    useDisconnectOrganizationGithubInstallation: () => ({ isPending: false }),
  }),
);
vi.mock("@/fetchers/organization-github/organization-github", () => ({
  getOrganizationGithubInstallUrl: vi.fn(async () => ({
    url: "https://github.com/apps/kaneo-fxcluster/installations/new?state=signed",
  })),
}));

afterEach(cleanup);

describe("OrganizationGithubConnection", () => {
  it("uses the organization-bound install URL returned by the API", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <OrganizationGithubConnection />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole("link", { name: /Install GitHub App/i }),
    ).toHaveAttribute(
      "href",
      "https://github.com/apps/kaneo-fxcluster/installations/new?state=signed",
    );
  });
});
