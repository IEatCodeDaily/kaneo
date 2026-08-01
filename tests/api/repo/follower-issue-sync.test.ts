import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #2 "Fix Non-repo-board-synced Task-Issue Sync".
 *
 * Kaneo links tasks to GitHub issues two different ways:
 *
 *   external_link         board synced to a repo; carries integration_id
 *   task_repo_item_link   a single task linked to one issue; NO integration
 *
 * Every webhook handler resolved work through external_link only, so a task
 * whose board has no repo sync received nothing. These tests pin the
 * follower path that fixes it.
 */

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockPublishEvent = vi.fn();
const mockResolveTargetStatus = vi.fn();

vi.mock("../../../apps/api/src/database", () => ({
  default: {
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

vi.mock("../../../apps/api/src/events", () => ({
  publishEvent: (...args: unknown[]) => mockPublishEvent(...args),
}));

vi.mock("../../../apps/api/src/plugins/github/utils/resolve-column", () => ({
  resolveTargetStatus: (...args: unknown[]) => mockResolveTargetStatus(...args),
}));

import { syncFollowerStatusForIssue } from "../../../apps/api/src/repo/controllers/sync-follower-status-for-issue";

/** Minimal drizzle select chain: .from().innerJoin()*.where() -> rows */
function makeSelectChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "innerJoin"]) {
    chain[method] = () => chain;
  }
  chain.where = () => Promise.resolve(rows);
  return chain;
}

/** Minimal drizzle update chain: .set().where().returning() -> rows */
function makeUpdateChain(rows: unknown[], setCaptured: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.set = (values: unknown) => {
    setCaptured.push(values);
    return chain;
  };
  chain.where = () => chain;
  chain.returning = () => Promise.resolve(rows);
  return chain;
}

const FOLLOWER = {
  taskId: "task-unsynced",
  boardId: "board-no-integration",
  status: "in-progress",
  title: "Fix the thing",
  userId: "user-a",
};

beforeEach(() => {
  mockSelect.mockReset();
  mockUpdate.mockReset();
  mockPublishEvent.mockReset();
  mockResolveTargetStatus.mockReset();
  mockResolveTargetStatus.mockResolvedValue("done");
});

describe("syncFollowerStatusForIssue (#2)", () => {
  it("syncs a task linked to an issue even though its board has no integration", async () => {
    const setCaptured: unknown[] = [];
    mockSelect.mockReturnValue(makeSelectChain([FOLLOWER]));
    mockUpdate.mockReturnValue(
      makeUpdateChain(
        [{ ...FOLLOWER, id: FOLLOWER.taskId, status: "done" }],
        setCaptured,
      ),
    );

    const updated = await syncFollowerStatusForIssue({
      owner: "acme",
      repo: "widgets",
      issueNumber: 42,
      eventType: "issue_closed",
      fallbackStatus: "done",
    });

    expect(updated).toEqual(["task-unsynced"]);
    expect(setCaptured[0]).toEqual({ status: "done" });

    // The follower's own board decides the target column.
    expect(mockResolveTargetStatus).toHaveBeenCalledWith(
      "board-no-integration",
      "issue_closed",
      "done",
    );

    // Activity/automation still fire for a task-level link.
    expect(mockPublishEvent).toHaveBeenCalledWith(
      "task.status_changed",
      expect.objectContaining({
        taskId: "task-unsynced",
        oldStatus: "in-progress",
        newStatus: "done",
      }),
    );
  });

  it("does not double-update a task the integration path already handled", async () => {
    mockSelect.mockReturnValue(makeSelectChain([FOLLOWER]));
    mockUpdate.mockReturnValue(makeUpdateChain([], []));

    const updated = await syncFollowerStatusForIssue({
      owner: "acme",
      repo: "widgets",
      issueNumber: 42,
      eventType: "issue_closed",
      fallbackStatus: "done",
      alreadyHandledTaskIds: ["task-unsynced"],
    });

    expect(updated).toEqual([]);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockPublishEvent).not.toHaveBeenCalled();
  });

  it("leaves a task alone when it already holds the target status", async () => {
    mockSelect.mockReturnValue(
      makeSelectChain([{ ...FOLLOWER, status: "done" }]),
    );
    mockUpdate.mockReturnValue(makeUpdateChain([], []));

    const updated = await syncFollowerStatusForIssue({
      owner: "acme",
      repo: "widgets",
      issueNumber: 42,
      eventType: "issue_closed",
      fallbackStatus: "done",
    });

    expect(updated).toEqual([]);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockPublishEvent).not.toHaveBeenCalled();
  });

  it("resolves each follower against its own board", async () => {
    const second = {
      taskId: "task-other",
      boardId: "board-two",
      status: "to-do",
      title: "Second follower",
      userId: null,
    };
    mockSelect.mockReturnValue(makeSelectChain([FOLLOWER, second]));
    mockUpdate.mockImplementation(() =>
      makeUpdateChain(
        [{ id: "x", boardId: "b", status: "done", title: "t" }],
        [],
      ),
    );

    await syncFollowerStatusForIssue({
      owner: "acme",
      repo: "widgets",
      issueNumber: 42,
      eventType: "issue_closed",
      fallbackStatus: "done",
    });

    // Two followers on different boards => two independent column lookups.
    expect(mockResolveTargetStatus).toHaveBeenCalledTimes(2);
    expect(mockResolveTargetStatus).toHaveBeenNthCalledWith(
      2,
      "board-two",
      "issue_closed",
      "done",
    );
  });
});
