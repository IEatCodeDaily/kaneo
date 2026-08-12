import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockPublishEvent = vi.fn();

vi.mock("../../../apps/api/src/database", () => ({
  default: {
    query: {
      columnTable: { findFirst: vi.fn() },
    },
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

vi.mock("../../../apps/api/src/events", () => ({
  publishEvent: (...args: unknown[]) => mockPublishEvent(...args),
}));

import bulkUpdateTasks from "../../../apps/api/src/task/controllers/bulk-update-tasks";

/**
 * #226: bulk archival must write `archived_at`, never `status`.
 *
 * Migration 0062 moved archival onto `task.archived_at` and dropped
 * `"archived"` from the status vocabulary, but the frontend's bulk archive kept
 * sending `{ operation: "updateStatus", value: "archived" }`, so every archive
 * failed with:
 *
 *   Invalid status "archived". Valid statuses for this board: to-do, ...
 *
 * This calls the REAL controller and inspects the values it hands to drizzle.
 */

const TASK_ROWS = [
  {
    id: "task-1",
    title: "Done ticket",
    boardId: "board-1",
    userId: "user-1",
    dueDate: null,
    organizationId: "org-1",
  },
  {
    id: "task-2",
    title: "In progress ticket",
    boardId: "board-1",
    userId: "user-1",
    dueDate: null,
    organizationId: "org-1",
  },
];

/** `select().from().innerJoin().where()` -> tasks, then membership lookup. */
function primeSelects() {
  mockSelect
    // task rows
    .mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({ where: () => Promise.resolve(TASK_ROWS) }),
      }),
    })
    // organization membership check
    .mockReturnValueOnce({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve([{ id: "member-1" }]) }),
      }),
    });
}

/** Capture every object passed to `.set(...)`. */
function captureUpdates() {
  const sets: Array<Record<string, unknown>> = [];
  mockUpdate.mockImplementation(() => ({
    set: (values: Record<string, unknown>) => {
      sets.push(values);
      return { where: () => Promise.resolve({ rowCount: TASK_ROWS.length }) };
    },
  }));
  return sets;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("bulk archive", () => {
  it("writes archivedAt and never status", async () => {
    primeSelects();
    const sets = captureUpdates();

    const result = await bulkUpdateTasks({
      taskIds: ["task-1", "task-2"],
      operation: "archive",
      userId: "user-1",
    });

    expect(result.success).toBe(true);
    expect(sets).toHaveLength(1);

    const values = sets[0];
    expect(values).toHaveProperty("archivedAt");
    expect(values.archivedAt).toBeInstanceOf(Date);
    // the regression signature: archival encoded as a status write
    expect(values).not.toHaveProperty("status");
    expect(JSON.stringify(values)).not.toContain('archived"');
  });

  it("does not emit task.status_changed", async () => {
    primeSelects();
    captureUpdates();

    await bulkUpdateTasks({
      taskIds: ["task-1"],
      operation: "archive",
      userId: "user-1",
    });

    // status did not move; claiming it did would corrupt the activity trail
    const events = mockPublishEvent.mock.calls.map(([name]) => name);
    expect(events).not.toContain("task.status_changed");
    expect(events).toContain("task-relation.refresh");
  });

  it("requires no value argument", async () => {
    primeSelects();
    captureUpdates();

    // the old call needed value:"archived"; this must succeed with none
    await expect(
      bulkUpdateTasks({
        taskIds: ["task-1"],
        operation: "archive",
        userId: "user-1",
      }),
    ).resolves.toMatchObject({ success: true });
  });
});

describe("bulk unarchive", () => {
  it("clears archivedAt and never sets a status", async () => {
    primeSelects();
    const sets = captureUpdates();

    await bulkUpdateTasks({
      taskIds: ["task-1"],
      operation: "unarchive",
      userId: "user-1",
    });

    expect(sets).toHaveLength(1);
    expect(sets[0]).toHaveProperty("archivedAt", null);
    expect(sets[0]).not.toHaveProperty("status");
  });
});

describe("updateStatus still rejects archived", () => {
  it("refuses archival smuggled in as a status", async () => {
    mockSelect
      .mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({ where: () => Promise.resolve(TASK_ROWS) }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({ limit: () => Promise.resolve([{ id: "member-1" }]) }),
        }),
      })
      // getValidTaskStatuses reads the board's columns
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            orderBy: () =>
              Promise.resolve([{ slug: "to-do" }, { slug: "done" }]),
          }),
        }),
      });
    captureUpdates();

    await expect(
      bulkUpdateTasks({
        taskIds: ["task-1"],
        operation: "updateStatus",
        value: "archived",
        userId: "user-1",
      }),
    ).rejects.toThrow(/Invalid status "archived"/);
  });
});
