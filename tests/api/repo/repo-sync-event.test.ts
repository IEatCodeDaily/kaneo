import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Every successful mirror must publish repo.synced. The leaf sync functions
 * (GitHub here, Gitea equivalently) are the single choke points all sync paths
 * funnel through — the manual resync route, provider webhooks, the stale-repo
 * scheduler and the issue-management controllers. Without this event the
 * frontend only ever refreshes by full page reload (reported: "repos not
 * updating the frontend automatically on sync").
 */

const mocks = vi.hoisted(() => ({
  paginate: vi.fn(async () => []),
  repoRow: {
    id: "repo-1",
    provider: "github",
    organizationId: "org-1",
    owner: "acme",
    name: "widgets",
    config: { installationId: 7 },
  },
}));

vi.mock("../../../apps/api/src/plugins/github/utils/github-app", () => ({
  getGithubApp: vi.fn(() => null),
  getInstallationOctokit: vi.fn(async () => ({
    paginate: mocks.paginate,
    request: vi.fn(),
  })),
}));

// manage-github-repo transitively imports github-delegation → auth → the real
// database schema; stub the only symbol syncGitHubRepo needs from it.
vi.mock("../../../apps/api/src/repo/controllers/manage-github-repo", () => ({
  resolveInstallationId: vi.fn(async () => 7),
}));

vi.mock("../../../apps/api/src/database", () => ({
  default: {
    query: {
      repoTable: { findFirst: vi.fn(async () => mocks.repoRow) },
    },
    update: () => ({ set: () => ({ where: vi.fn(async () => {}) }) }),
    insert: () => ({
      values: () => ({ onConflictDoUpdate: vi.fn(async () => {}) }),
    }),
  },
}));

import { subscribeToEvent } from "../../../apps/api/src/events";
import { syncGitHubRepo } from "../../../apps/api/src/repo/services/sync-github-repo";

describe("syncGitHubRepo completion event", () => {
  beforeEach(() => {
    mocks.paginate.mockClear();
  });

  it("publishes repo.synced with repo and organization ids after a successful mirror", async () => {
    const events: Array<{ repoId: string; organizationId: string }> = [];
    await subscribeToEvent<{ repoId: string; organizationId: string }>(
      "repo.synced",
      async (data) => {
        events.push(data);
      },
    );

    const result = await syncGitHubRepo("repo-1");

    expect(result).toEqual({ issues: 0, pullRequests: 0 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toContainEqual(
      expect.objectContaining({ repoId: "repo-1", organizationId: "org-1" }),
    );
  });
});
