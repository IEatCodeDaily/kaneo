import { describe, expect, it, vi } from "vitest";

/**
 * repo.synced must fan out to every org member's user socket as REPO_SYNCED.
 *
 * Repos are org-scoped while board sockets are board-scoped, so the only
 * channel that can carry a repo mirror refresh is the user socket. The server
 * resolves the repo's organization members and broadcasts to each.
 */

const mocks = vi.hoisted(() => ({
  broadcastToUser: vi.fn(),
  members: [{ userId: "user-a" }, { userId: "user-b" }],
}));

// Fully mocked: importing the real ws module pulls in the whole app graph
// (redis, auth, github-delegation) which needs a live database.
vi.mock("../../../apps/api/src/ws", () => ({
  broadcastToUser: mocks.broadcastToUser,
}));

vi.mock("../../../apps/api/src/database", () => ({
  default: {
    select: () => ({
      from: () => ({
        where: vi.fn(async () => mocks.members),
      }),
    }),
  },
}));

import { publishEvent } from "../../../apps/api/src/events";
import { registerRepoSyncBroadcast } from "../../../apps/api/src/ws/repo-sync-broadcast";

describe("repo.synced broadcast", () => {
  it("sends REPO_SYNCED to every member of the repo's organization", async () => {
    await registerRepoSyncBroadcast();

    await publishEvent("repo.synced", {
      repoId: "repo-1",
      organizationId: "org-1",
    });
    // subscribeToEvent handlers run on the event loop; flush microtasks.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const calls = mocks.broadcastToUser.mock.calls;
    const users = calls.map((call) => call[0]).sort();
    expect(users).toEqual(["user-a", "user-b"]);
    for (const [, message] of calls) {
      expect(message).toMatchObject({ type: "REPO_SYNCED", repoId: "repo-1" });
    }
  });
});
