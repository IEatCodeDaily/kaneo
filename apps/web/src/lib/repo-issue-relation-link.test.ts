import { describe, expect, it } from "vitest";
import { getRepoIssueRelationLink } from "./repo-issue-relation-link";

const repos = [
  {
    id: "repo-synced",
    organizationId: "org-1",
    provider: "github",
    owner: "Acme",
    name: "Widget",
    url: "https://github.com/Acme/Widget",
    description: null,
    defaultBranch: null,
    isPrivate: false,
    isActive: true,
    lastSyncedAt: null,
    openIssueCount: 0,
    openPullRequestCount: 0,
  },
];

describe("getRepoIssueRelationLink", () => {
  it("resolves a related issue from a synced GitHub repository to the Kaneo issue route data", () => {
    expect(
      getRepoIssueRelationLink(
        {
          number: 42,
          repository_url: "https://api.github.com/repos/acme/widget",
          html_url: "https://github.com/acme/widget/issues/42",
        },
        repos,
      ),
    ).toEqual({ number: 42, repoId: "repo-synced" });
  });

  it("falls back to the external URL when the relation repository is not synced", () => {
    expect(
      getRepoIssueRelationLink(
        {
          number: 42,
          repository_url: "https://api.github.com/repos/acme/external",
          html_url: "https://github.com/acme/external/issues/42",
        },
        repos,
      ),
    ).toBeNull();
  });

  it("uses the issue URL for older GitHub relation payloads without repository_url", () => {
    expect(
      getRepoIssueRelationLink(
        { number: 42, html_url: "https://github.com/acme/widget/issues/42" },
        repos,
      ),
    ).toEqual({ number: 42, repoId: "repo-synced" });
  });
});
