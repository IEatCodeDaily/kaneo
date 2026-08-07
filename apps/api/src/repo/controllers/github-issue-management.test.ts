import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActingOctokit: vi.fn(),
  getRepoIssue: vi.fn(),
  syncGitHubRepo: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../services/sync-github-repo", () => ({
  syncGitHubRepo: mocks.syncGitHubRepo,
}));
vi.mock("./get-repo-issue", () => ({ getRepoIssue: mocks.getRepoIssue }));
vi.mock("./manage-github-repo", () => ({
  getActingOctokit: mocks.getActingOctokit,
  getGitHubRepoClient: vi.fn(),
}));

import { reopenGitHubIssue } from "./github-issue-management";

describe("reopenGitHubIssue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActingOctokit.mockResolvedValue({
      octokit: { rest: { issues: { update: mocks.update } } },
      repo: { name: "kaneo", owner: "usekaneo" },
    });
    mocks.getRepoIssue.mockResolvedValue({ number: 29, state: "open" });
  });

  it("reopens with the authorized member's delegated GitHub client and refreshes the mirror", async () => {
    await expect(
      reopenGitHubIssue({ repoId: "repo-1", number: 29, userId: "member-1" }),
    ).resolves.toEqual({ number: 29, state: "open" });

    expect(mocks.getActingOctokit).toHaveBeenCalledWith("repo-1", "member-1");
    expect(mocks.update).toHaveBeenCalledWith({
      owner: "usekaneo",
      repo: "kaneo",
      issue_number: 29,
      state: "open",
    });
    expect(mocks.syncGitHubRepo).toHaveBeenCalledWith("repo-1");
    expect(mocks.getRepoIssue).toHaveBeenCalledWith("repo-1", 29);
  });
});
