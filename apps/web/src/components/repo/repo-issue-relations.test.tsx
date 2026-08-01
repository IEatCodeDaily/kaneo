import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Repo, RepoIssueGithub } from "@/types/repo";

const repos: Repo[] = [
  {
    id: "repo-synced",
    organizationId: "org-1",
    provider: "github",
    owner: "Acme",
    name: "Widget",
    url: "https://github.com/Acme/Widget",
    description: null,
    defaultBranch: "main",
    isPrivate: false,
    isActive: true,
    lastSyncedAt: null,
    openIssueCount: 2,
    openPullRequestCount: 0,
  },
];

const useGetRepos = vi.fn(() => ({ data: repos, isPending: false }));

vi.mock("@/hooks/queries/repo/use-get-repos", () => ({
  default: () => useGetRepos(),
}));
vi.mock("@/hooks/queries/repo/use-get-repo-issues", () => ({
  default: () => ({
    data: {
      data: [],
      pagination: { total: 0, page: 1, pageSize: 100, totalPages: 0 },
    },
  }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    params,
    ...props
  }: {
    children: ReactNode;
    params: { organizationId: string; repoId: string; number: string };
    [key: string]: unknown;
  }) => (
    <a
      {...props}
      data-router-link="true"
      href={`/dashboard/organization/${params.organizationId}/repo/${params.repoId}/issues/${params.number}`}
    >
      {children}
    </a>
  ),
}));

import RepoIssueRelations from "./repo-issue-relations";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

const github: RepoIssueGithub = {
  comments: [],
  timeline: [],
  parent: {
    number: 12,
    title: "Parent from the issue detail fetcher",
    state: "open",
    html_url: "https://github.com/acme/widget/issues/12",
    repository_url: "https://api.github.com/repos/acme/widget",
  },
  parentSupported: true,
  subIssues: [
    {
      number: 14,
      title: "Child from the issue detail fetcher",
      state: "open",
      html_url: "https://github.com/acme/widget/issues/14",
      repository_url: "https://api.github.com/repos/acme/widget",
    },
    {
      number: 21,
      title: "Child in an unconnected repository",
      state: "open",
      html_url: "https://github.com/acme/external/issues/21",
      repository_url: "https://api.github.com/repos/acme/external",
    },
  ],
  subIssuesSupported: true,
};

afterEach(cleanup);

describe("RepoIssueRelations rendered navigation (#30)", () => {
  it("renders synced parent and sub-issue rows as internal Kaneo router links", () => {
    render(
      <RepoIssueRelations
        github={github}
        number={13}
        organizationId="org-1"
        repoId="repo-synced"
      />,
      { wrapper },
    );

    for (const number of [12, 14]) {
      const link = screen.getByTestId(`relation-link-${number}`);
      expect(link.getAttribute("data-router-link")).toBe("true");
      expect(link.getAttribute("href")).toBe(
        `/dashboard/organization/org-1/repo/repo-synced/issues/${number}`,
      );
      expect(link.getAttribute("target")).toBeNull();
    }
  });

  it("does not expose a transient GitHub link while the synced-repository lookup loads", () => {
    useGetRepos.mockReturnValueOnce({ data: [], isPending: true });

    render(
      <RepoIssueRelations
        github={github}
        number={13}
        organizationId="org-1"
        repoId="repo-synced"
      />,
      { wrapper },
    );

    const relation = screen.getByTestId("relation-link-14");
    expect(relation.tagName).toBe("SPAN");
    expect(relation.getAttribute("href")).toBeNull();
    expect(relation.getAttribute("target")).toBeNull();
  });

  it("keeps a relation from an unconnected repository as an external GitHub link", () => {
    render(
      <RepoIssueRelations
        github={github}
        number={13}
        organizationId="org-1"
        repoId="repo-synced"
      />,
      { wrapper },
    );

    const link = screen.getByTestId("relation-link-21");
    expect(link.getAttribute("data-router-link")).toBeNull();
    expect(link.getAttribute("href")).toBe(
      "https://github.com/acme/external/issues/21",
    );
    expect(link.getAttribute("target")).toBe("_blank");
  });
});
