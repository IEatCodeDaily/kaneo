import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Posting a comment on a GitHub-synced task must NOT re-mirror the whole
 * repository. createGitHubItemComment used to call syncGitHubRepo(repoId) —
 * paginating every issue and every PR in the repo — inside the comment
 * request, so a single comment took as long as an initial repo sync (reported
 * as "commenting on a github synced task is really slow"). It now refreshes
 * only the issue it commented on.
 */

const mocks = vi.hoisted(() => {
  const createComment = vi.fn(async () => ({
    data: {
      id: 1,
      html_url: "https://x",
      created_at: new Date().toISOString(),
    },
  }));
  const request = vi.fn(async () => ({
    data: { number: 42, id: 9, title: "t", state: "open", comments: 7 },
  }));
  return {
    createComment,
    request,
    octokit: {
      request,
      rest: { issues: { createComment } },
    },
    syncGitHubRepo: vi.fn(async () => ({ issues: 0, pullRequests: 0 })),
    syncGitHubIssue: vi.fn(async () => 42),
  };
});

vi.mock("../../../apps/api/src/repo/services/sync-github-repo", () => ({
  syncGitHubRepo: mocks.syncGitHubRepo,
  syncGitHubIssue: mocks.syncGitHubIssue,
}));

vi.mock("../../../apps/api/src/plugins/github/utils/github-app", () => ({
  getGithubApp: vi.fn(() => null),
  getInstallationOctokit: vi.fn(async () => mocks.octokit),
}));

vi.mock("../../../apps/api/src/github-delegation", () => ({
  getUsableDelegatedToken: vi.fn(async () => null),
}));

vi.mock("../../../apps/api/src/database", () => {
  const repoRow = {
    id: "r1",
    provider: "github",
    owner: "noovoleum",
    name: "ucollect",
    config: { installationId: 1 },
  };
  return {
    default: {
      query: { repoTable: { findFirst: vi.fn(async () => repoRow) } },
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => [{ name: "Tester" }] }),
        }),
      }),
    },
  };
});

import { createGitHubItemComment } from "../../../apps/api/src/repo/controllers/manage-github-repo";

describe("createGitHubItemComment", () => {
  beforeEach(() => {
    mocks.syncGitHubRepo.mockClear();
    mocks.syncGitHubIssue.mockClear();
    mocks.request.mockClear();
  });

  it("refreshes only the commented issue, never the whole repo", async () => {
    await createGitHubItemComment({
      repoId: "r1",
      number: 42,
      body: "hello",
      userId: "u1",
    });
    // the refresh is fire-and-forget; let the microtask chain drain
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.syncGitHubRepo).not.toHaveBeenCalled();
    expect(mocks.syncGitHubIssue).toHaveBeenCalledWith(
      "r1",
      expect.objectContaining({ number: 42 }),
    );
    // exactly one issue GET for the refresh — not a paginate over everything
    expect(mocks.request).toHaveBeenCalledWith(
      "GET /repos/{owner}/{repo}/issues/{issue_number}",
      expect.objectContaining({ issue_number: 42 }),
    );
  });

  it("does not fail the comment when the refresh fails", async () => {
    mocks.syncGitHubIssue.mockRejectedValueOnce(new Error("boom"));
    await expect(
      createGitHubItemComment({
        repoId: "r1",
        number: 42,
        body: "hello",
        userId: "u1",
      }),
    ).resolves.toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("returns without waiting for the refresh (fire-and-forget)", async () => {
    // a refresh that never resolves must not block the comment response
    mocks.request.mockImplementationOnce(() => new Promise(() => {}));
    await expect(
      createGitHubItemComment({
        repoId: "r1",
        number: 42,
        body: "hello",
        userId: "u1",
      }),
    ).resolves.toBeDefined();
  });
});
