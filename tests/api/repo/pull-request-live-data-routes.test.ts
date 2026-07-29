import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  files: vi.fn().mockResolvedValue({
    files: [],
    totals: { additions: 0, deletions: 0, changedFiles: 0 },
  }),
  commits: vi.fn().mockResolvedValue({ commits: [] }),
  checks: vi.fn().mockResolvedValue({
    conclusion: null,
    headSha: "head-sha",
    checks: [],
    runs: [],
  }),
}));

vi.mock("../../../apps/api/src/repo/repo-organization-access", () => ({
  repoOrganizationAccess:
    () => async (_context: unknown, next: () => Promise<void>) =>
      next(),
}));
vi.mock(
  "../../../apps/api/src/repo/controllers/get-repo-pull-request-files",
  () => ({ getRepoPullRequestFiles: mocks.files }),
);
vi.mock(
  "../../../apps/api/src/repo/controllers/get-repo-pull-request-commits",
  () => ({ getRepoPullRequestCommits: mocks.commits }),
);
vi.mock(
  "../../../apps/api/src/repo/controllers/get-repo-pull-request-checks",
  () => ({ getRepoPullRequestChecks: mocks.checks }),
);

import repo from "../../../apps/api/src/repo";

describe("pull request live-data routes", () => {
  it.each([
    [
      "files",
      mocks.files,
      { files: [], totals: { additions: 0, deletions: 0, changedFiles: 0 } },
    ],
    ["commits", mocks.commits, { commits: [] }],
    [
      "checks",
      mocks.checks,
      { conclusion: null, headSha: "head-sha", checks: [], runs: [] },
    ],
  ])(
    "routes /%s with normalized numeric parameters",
    async (suffix, controller, body) => {
      const response = await repo.request(`/repo-1/pull-requests/7/${suffix}`);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual(body);
      expect(controller).toHaveBeenCalledWith({ repoId: "repo-1", number: 7 });
    },
  );

  it("rejects an invalid pull request number before invoking a controller", async () => {
    mocks.files.mockClear();
    const response = await repo.request("/repo-1/pull-requests/0/files");

    expect(response.status).toBe(400);
    expect(mocks.files).not.toHaveBeenCalled();
  });
});
