import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getGitHubRepoClient: vi.fn(),
}));

vi.mock(
  "../../../apps/api/src/repo/controllers/manage-github-repo",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../../../apps/api/src/repo/controllers/manage-github-repo")
    >()),
    getGitHubRepoClient: mocks.getGitHubRepoClient,
  }),
);

import { getRepoPullRequestChecks } from "../../../apps/api/src/repo/controllers/get-repo-pull-request-checks";
import { getRepoPullRequestCommits } from "../../../apps/api/src/repo/controllers/get-repo-pull-request-commits";
import { getRepoPullRequestFiles } from "../../../apps/api/src/repo/controllers/get-repo-pull-request-files";

function client() {
  const listFiles = vi.fn();
  const listCommits = vi.fn();
  const listForRef = vi.fn();
  const listWorkflowRunsForRepo = vi.fn();
  const get = vi.fn().mockResolvedValue({
    data: {
      head: { sha: "head-sha" },
      html_url: "https://github.test/acme/widget/pull/7",
    },
  });
  const paginate = vi.fn(async (endpoint) => {
    if (endpoint === listFiles) {
      return [
        {
          filename: "src/a.ts",
          status: "modified",
          additions: 3,
          deletions: 1,
          changes: 4,
          patch: "@@ patch",
        },
        {
          filename: "logo.png",
          status: "added",
          additions: 0,
          deletions: 0,
          changes: 0,
        },
      ];
    }
    if (endpoint === listCommits) {
      return [
        {
          sha: "abc123",
          commit: {
            message: "ship it",
            author: { name: "Ada", date: "2026-07-28T10:00:00Z" },
            committer: null,
          },
          author: null,
          html_url: "https://github.test/acme/widget/commit/abc123",
        },
      ];
    }
    if (endpoint === listForRef) {
      return [
        {
          name: "unit",
          status: "completed",
          conclusion: "success",
          started_at: null,
          completed_at: "2026-07-28T10:05:00Z",
          html_url: null,
        },
      ];
    }
    if (endpoint === listWorkflowRunsForRepo) {
      return [
        {
          name: null,
          display_title: "CI",
          run_number: 4,
          status: "in_progress",
          conclusion: null,
          run_started_at: "2026-07-28T10:01:00Z",
          created_at: "2026-07-28T10:00:00Z",
          updated_at: "2026-07-28T10:02:00Z",
          html_url: "https://github.test/acme/widget/actions/runs/4",
        },
      ];
    }
    throw new Error("unexpected endpoint");
  });
  return {
    listFiles,
    listCommits,
    listForRef,
    listWorkflowRunsForRepo,
    get,
    octokit: {
      paginate,
      rest: {
        pulls: { listFiles, listCommits, get },
        checks: { listForRef },
        actions: { listWorkflowRunsForRepo },
      },
    },
  };
}

describe("live pull request data controllers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("paginates files and normalizes patches and totals", async () => {
    const github = client();
    mocks.getGitHubRepoClient.mockResolvedValue({
      repo: { owner: "acme", name: "widget" },
      octokit: github.octokit,
    });

    await expect(
      getRepoPullRequestFiles({ repoId: "repo-1", number: 7 }),
    ).resolves.toEqual({
      files: [
        {
          filename: "src/a.ts",
          status: "modified",
          additions: 3,
          deletions: 1,
          changes: 4,
          patch: "@@ patch",
        },
        {
          filename: "logo.png",
          status: "added",
          additions: 0,
          deletions: 0,
          changes: 0,
          patch: null,
        },
      ],
      totals: { additions: 3, deletions: 1, changedFiles: 2 },
    });
    expect(github.octokit.paginate).toHaveBeenCalledWith(github.listFiles, {
      owner: "acme",
      repo: "widget",
      pull_number: 7,
      per_page: 100,
    });
  });

  it("paginates commits and normalizes an unmapped git author", async () => {
    const github = client();
    mocks.getGitHubRepoClient.mockResolvedValue({
      repo: { owner: "acme", name: "widget" },
      octokit: github.octokit,
    });

    await expect(
      getRepoPullRequestCommits({ repoId: "repo-1", number: 7 }),
    ).resolves.toEqual({
      commits: [
        {
          sha: "abc123",
          message: "ship it",
          authorLogin: "Ada",
          authorAvatarUrl: null,
          committedAt: "2026-07-28T10:00:00Z",
          url: "https://github.test/acme/widget/commit/abc123",
        },
      ],
    });
    expect(github.octokit.paginate).toHaveBeenCalledWith(github.listCommits, {
      owner: "acme",
      repo: "widget",
      pull_number: 7,
      per_page: 100,
    });
  });

  it("loads the PR head, queries both CI APIs, and rolls up pending", async () => {
    const github = client();
    mocks.getGitHubRepoClient.mockResolvedValue({
      repo: { owner: "acme", name: "widget" },
      octokit: github.octokit,
    });

    const result = await getRepoPullRequestChecks({
      repoId: "repo-1",
      number: 7,
    });
    expect(github.get).toHaveBeenCalledWith({
      owner: "acme",
      repo: "widget",
      pull_number: 7,
    });
    expect(github.octokit.paginate).toHaveBeenCalledWith(github.listForRef, {
      owner: "acme",
      repo: "widget",
      ref: "head-sha",
      per_page: 100,
    });
    expect(github.octokit.paginate).toHaveBeenCalledWith(
      github.listWorkflowRunsForRepo,
      { owner: "acme", repo: "widget", head_sha: "head-sha", per_page: 100 },
    );
    expect(result).toEqual({
      conclusion: "pending",
      headSha: "head-sha",
      checks: [
        {
          name: "unit",
          status: "completed",
          conclusion: "success",
          startedAt: null,
          completedAt: "2026-07-28T10:05:00Z",
          url: "https://github.test/acme/widget/pull/7",
        },
      ],
      runs: [
        {
          name: "CI",
          status: "in_progress",
          conclusion: null,
          startedAt: "2026-07-28T10:01:00Z",
          completedAt: null,
          url: "https://github.test/acme/widget/actions/runs/4",
        },
      ],
    });
  });
});
