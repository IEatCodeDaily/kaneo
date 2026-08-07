import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The Add-repo search must show which repositories are ALREADY connected to
 * the organization and refuse to select them. Connecting a duplicate used to
 * throw the raw failed INSERT back at the user as a 500 (unique constraint
 * repo_org_provider_owner_name_unique); the API now answers 409, and this
 * dialog stops the attempt before it leaves the browser.
 */

const githubRepos = [
  {
    id: 1,
    owner: "noovoleum",
    name: "ucollect-box-edge-compose",
    fullName: "noovoleum/ucollect-box-edge-compose",
    description: "Compose repo",
    isPrivate: true,
    installationId: 151349789,
  },
  {
    id: 2,
    owner: "noovoleum",
    name: "brand-new-repo",
    fullName: "noovoleum/brand-new-repo",
    description: "Not yet connected",
    isPrivate: false,
    installationId: 151349789,
  },
];

vi.mock("@/fetchers/organization-github/organization-github", () => ({
  getOrganizationGithubRepositories: vi.fn(async () => githubRepos),
}));

vi.mock("@/hooks/queries/repo/use-get-repos", () => ({
  default: () => ({
    // OWNER/name case differs on purpose: GitHub search results and the
    // mirror may disagree on casing, and the match must survive that.
    data: [{ owner: "Noovoleum", name: "UCOLLECT-BOX-EDGE-COMPOSE" }],
  }),
}));

import { AddRepoDialog } from "./add-repo-dialog";

function renderDialog() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AddRepoDialog open onOpenChange={vi.fn()} organizationId="org-1" />
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe("AddRepoDialog connected-state", () => {
  it("marks an already-connected repo and disables selecting it", async () => {
    renderDialog();

    const badge = await screen.findByTestId("repo-already-connected");
    expect(badge.textContent).toContain("Connected");

    const connectedRow = screen
      .getByText("noovoleum/ucollect-box-edge-compose")
      .closest("button");
    expect(connectedRow).toHaveProperty("disabled", true);
  });

  it("leaves unconnected repos selectable without the badge", async () => {
    renderDialog();
    await screen.findByTestId("repo-already-connected");

    const freshRow = screen
      .getByText("noovoleum/brand-new-repo")
      .closest("button");
    expect(freshRow).toHaveProperty("disabled", false);
    expect(freshRow?.textContent).not.toContain("Connected");
    expect(freshRow?.textContent).toContain("Public");
  });
});
