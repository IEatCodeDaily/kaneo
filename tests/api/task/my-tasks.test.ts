import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

const mockSelect = vi.fn();

vi.mock("../../../apps/api/src/database", () => ({
  default: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

import { isNull } from "drizzle-orm";
import { taskTable } from "../../../apps/api/src/database/schema";
import getMyTasks from "../../../apps/api/src/task/controllers/get-my-tasks";

/**
 * Flatten a drizzle condition into readable SQL-ish text, walking queryChunks
 * without tripping over the circular table<->column references.
 */
function describeSql(condition: unknown): string {
  const parts: string[] = [];

  const walk = (node: unknown, seen: Set<object>) => {
    if (node == null) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, seen);
      return;
    }
    if (typeof node !== "object") {
      parts.push(String(node));
      return;
    }
    if (seen.has(node as object)) return;
    seen.add(node as object);

    const obj = node as Record<string, unknown>;

    if (typeof obj.name === "string" && "table" in obj) {
      parts.push(String(obj.name));
      return;
    }
    if (Array.isArray(obj.value)) {
      parts.push(obj.value.join(""));
      return;
    }
    if (Array.isArray(obj.queryChunks)) {
      walk(obj.queryChunks, seen);
      return;
    }
  };

  walk(condition, new Set());
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Chainable stub for the two shapes this controller uses:
 * the team lookup (`select().from().where()` awaited) and the main task query
 * (`select().from().innerJoin()...where().orderBy().limit()`).
 */
function makeChain(rows: unknown[], captured: unknown[]) {
  const chain: Record<string, Mock> = {
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(rows)),
    execute: vi.fn(() => Promise.resolve(rows)),
    // biome-ignore lint/suspicious/noThenProperty: drizzle query builders are thenable; the mock must mimic that.
    then: undefined as unknown as Mock,
  };
  chain.where = vi.fn((cond: unknown) => {
    captured.push(cond);
    return chain;
  });
  // biome-ignore lint/suspicious/noThenProperty: drizzle query builders are thenable; the mock must mimic that.
  chain.then = vi.fn((resolve: (value: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve),
  );
  return chain;
}

describe("getMyTasks (#58 cross-board My Tasks)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * The controller issues the team lookup first, then the task query, so the
   * SECOND captured `where` is the one under test. Asserting on the last
   * condition rather than the first avoids the classic trap of proving
   * something about an unrelated lookup query.
   */
  function setup(teamRows: unknown[] = []) {
    const teamCaptured: unknown[] = [];
    const taskCaptured: unknown[] = [];
    mockSelect
      .mockReturnValueOnce(makeChain(teamRows, teamCaptured))
      .mockReturnValue(makeChain([], taskCaptured));
    return { teamCaptured, taskCaptured };
  }

  it("gates results on organization membership so tasks from left orgs cannot leak", async () => {
    const { taskCaptured } = setup();

    await getMyTasks({ userId: "user-1" });

    expect(taskCaptured.length).toBeGreaterThan(0);
    const sql = describeSql(taskCaptured[0]);
    // Table identifiers render as objects rather than names, so assert on the
    // correlated-subquery shape and the columns it joins on.
    expect(sql.toLowerCase()).toContain("exists");
    expect(sql).toContain("organization_id = organization_id");
    expect(sql).toContain("user_id = user-1");
  });

  it("excludes soft-deleted tasks", async () => {
    const { taskCaptured } = setup();

    await getMyTasks({ userId: "user-1" });

    const sql = describeSql(taskCaptured[0]);
    const expected = describeSql(isNull(taskTable.deletedAt));
    expect(expected).toContain("deleted_at");
    expect(sql).toContain(expected);
  });

  it("derives 'created by me' from the activity feed, not a guessed column", async () => {
    const { taskCaptured } = setup();

    await getMyTasks({ userId: "user-1", relation: "created" });

    const sql = describeSql(taskCaptured[0]);
    // The activity-derived authorship check is identifiable by its correlation
    // on task_id plus the literal activity type.
    expect(sql).toContain("task_id = id");
    expect(sql).toContain("type = 'created'");
    // relation=created must NOT fall back to plain assignment.
    expect(sql).not.toContain("assignee_id = user-1");
  });

  it("does not emit an empty IN list when the user has no teams", async () => {
    const { taskCaptured } = setup([]);

    await getMyTasks({ userId: "user-1", relation: "team" });

    // An empty inArray produces invalid SQL, so the guard must emit `false`.
    const sql = describeSql(taskCaptured[0]).toLowerCase();
    expect(sql).toContain("false");
    expect(sql).not.toMatch(/in\s*\(\s*\)/);
  });

  it("filters by team membership when the user belongs to teams", async () => {
    const { taskCaptured } = setup([
      { teamId: "team-a" },
      { teamId: "team-b" },
    ]);

    await getMyTasks({ userId: "user-1", relation: "team" });

    const sql = describeSql(taskCaptured[0]);
    expect(sql).toContain("team_assignee_id");
  });

  it("hides tasks in final columns unless completed are requested", async () => {
    const { taskCaptured } = setup();

    await getMyTasks({ userId: "user-1" });
    const withoutCompleted = describeSql(taskCaptured[0]);
    expect(withoutCompleted).toContain("is_final");

    const second = setup();
    await getMyTasks({ userId: "user-1", includeCompleted: true });
    expect(describeSql(second.taskCaptured[0])).not.toContain("is_final");
  });
});
