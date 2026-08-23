import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

const mockSelect = vi.fn();
const mockExecute = vi.fn(async () => ({ rows: [] }));

vi.mock("../../../apps/api/src/database", () => ({
  default: {
    select: (...args: unknown[]) => mockSelect(...args),
    execute: (...args: unknown[]) => mockExecute(...args),
  },
}));

import getMyTasks from "../../../apps/api/src/task/controllers/get-my-tasks";

/**
 * Flatten a drizzle condition into readable SQL-ish text (same approach as
 * my-tasks.test.ts so assertions read like the emitted SQL).
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

function makeChain(rows: unknown[], captured: unknown[]) {
  const chain: Record<string, Mock> = {
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    offset: vi.fn(() => Promise.resolve(rows)),
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

/**
 * KFL-363: the Followed selection in My Tickets. A user's followed tickets are
 * those with an explicit row in task_follower for them — durable interest they
 * can revoke by unfollowing. The org-membership gate must still apply, and the
 * relation must not silently degrade into assignment.
 */
describe("getMyTasks — followed relation (KFL-363)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setup(teamRows: Array<{ teamId: string }> = []) {
    const taskCaptured: unknown[] = [];
    const taskChain = makeChain([], taskCaptured);
    mockExecute.mockResolvedValueOnce({
      rows: teamRows.map((row) => ({ id: row.teamId })),
    });
    mockSelect.mockReturnValue(taskChain);
    return { taskCaptured, taskChain };
  }

  it("restricts results to tickets with an explicit follower row for the user", async () => {
    const { taskCaptured } = setup();

    await getMyTasks({ userId: "user-1", relation: "followed" });

    const sql = describeSql(taskCaptured[0]);
    expect(sql).toContain("user_id = user-1");
    expect((sql.match(/exists/g) ?? []).length).toBe(2);
  });

  it("does not degrade the followed filter into plain assignment", async () => {
    const { taskCaptured } = setup();

    await getMyTasks({ userId: "user-1", relation: "followed" });

    const sql = describeSql(taskCaptured[0]).toLowerCase();
    expect(sql).not.toContain("task.user_id = user-1");
    expect(sql).not.toContain(
      "task_follower.user_id = user-1 and task.user_id = user-1",
    );
  });

  it("keeps the organization-membership gate on followed results", async () => {
    const { taskCaptured } = setup();

    await getMyTasks({ userId: "user-1", relation: "followed" });

    const sql = describeSql(taskCaptured[0]);
    expect(sql).toContain("organization_id = organization_id");
    expect(sql).toContain("user_id = user-1");
  });
});
