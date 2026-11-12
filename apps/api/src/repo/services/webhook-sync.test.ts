import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  syncGitHubRepo: vi.fn(),
}));

vi.mock("../../database", () => ({
  default: { query: { repoTable: { findFirst: mocks.findFirst } } },
}));
vi.mock("./sync-github-repo", () => ({
  syncGitHubRepo: mocks.syncGitHubRepo,
}));
vi.mock("../../events", () => ({ publishEvent: vi.fn() }));

import { shouldMirrorEvent } from "./mirror-events";
import { syncRepo } from "./sync-gitea-repo";

describe("mirror event filter", () => {
  it("mirrors events that can change issues/PRs", () => {
    for (const event of [
      "issues",
      "pull_request",
      "push",
      "label",
      "issue_comment",
    ]) {
      expect(shouldMirrorEvent(event)).toBe(true);
    }
  });

  it("skips CI-storm events that cannot change issues/PRs", () => {
    for (const event of [
      "workflow_job",
      "workflow_run",
      "workflow_dispatch",
      "status",
      "check_run",
      "pull_request_review",
      "pull_request_review_comment",
      "ping",
      "star",
    ]) {
      expect(shouldMirrorEvent(event)).toBe(false);
    }
  });
});

describe("syncRepo single-flight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue({ id: "repo-1", provider: "github" });
  });

  it("shares one running sync per repo and starts a fresh one after it settles", async () => {
    let release!: (v: { issues: number; pullRequests: number }) => void;
    mocks.syncGitHubRepo.mockImplementationOnce(
      () =>
        new Promise<{ issues: number; pullRequests: number }>((resolve) => {
          release = resolve;
        }),
    );

    const first = syncRepo("repo-1");
    const second = syncRepo("repo-1");
    expect(second).toBe(first);

    await vi.waitFor(() =>
      expect(mocks.syncGitHubRepo).toHaveBeenCalledTimes(1),
    );
    release({ issues: 1, pullRequests: 2 });
    await expect(first).resolves.toEqual({ issues: 1, pullRequests: 2 });

    mocks.syncGitHubRepo.mockImplementationOnce(async () => ({
      issues: 0,
      pullRequests: 0,
    }));
    await expect(syncRepo("repo-1")).resolves.toEqual({
      issues: 0,
      pullRequests: 0,
    });
    expect(mocks.syncGitHubRepo).toHaveBeenCalledTimes(2);
  });

  it("lets a failed sync settle the in-flight slot so the next caller retries", async () => {
    mocks.syncGitHubRepo.mockImplementationOnce(async () => {
      throw new Error("boom");
    });
    await expect(syncRepo("repo-1")).rejects.toThrow("boom");

    mocks.syncGitHubRepo.mockImplementationOnce(async () => ({
      issues: 3,
      pullRequests: 4,
    }));
    await expect(syncRepo("repo-1")).resolves.toEqual({
      issues: 3,
      pullRequests: 4,
    });
    expect(mocks.syncGitHubRepo).toHaveBeenCalledTimes(2);
  });
});
