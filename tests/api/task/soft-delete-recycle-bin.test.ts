import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockPublishEvent = vi.fn();
const mockBoardFindFirst = vi.fn();
const mockIntegrationFindFirst = vi.fn();
const mockGetTaskAssetKeys = vi.fn();
const mockDeleteS3Keys = vi.fn();

vi.mock("../../../apps/api/src/database", () => ({
  default: {
    query: {
      boardTable: {
        findFirst: (...args: unknown[]) => mockBoardFindFirst(...args),
      },
      integrationTable: {
        findFirst: (...args: unknown[]) => mockIntegrationFindFirst(...args),
      },
    },
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

vi.mock("../../../apps/api/src/events", () => ({
  publishEvent: (...args: unknown[]) => mockPublishEvent(...args),
}));

vi.mock("../../../apps/api/src/storage/cleanup-assets", () => ({
  getTaskAssetKeys: (...args: unknown[]) => mockGetTaskAssetKeys(...args),
  deleteS3Keys: (...args: unknown[]) => mockDeleteS3Keys(...args),
}));

import { isNotNull, isNull } from "drizzle-orm";
import { taskTable } from "../../../apps/api/src/database/schema";
import deleteTask from "../../../apps/api/src/task/controllers/delete-task";
import getTasks from "../../../apps/api/src/task/controllers/get-tasks";
import getTrashedTasks from "../../../apps/api/src/task/controllers/get-trashed-tasks";
import permanentlyDeleteTask from "../../../apps/api/src/task/controllers/permanently-delete-task";
import restoreTask from "../../../apps/api/src/task/controllers/restore-task";

const TASK_ROW = {
  id: "task-1",
  title: "Fix the bug",
  number: 7,
  description: "desc",
  descriptionHistory: null,
  status: "todo",
  priority: "high",
  startDate: null,
  dueDate: null,
  position: 1000,
  createdAt: new Date("2026-01-01"),
  userId: "user-1",
  teamId: null,
  assigneeName: "Ann",
  assigneeId: "user-1",
  teamAssigneeName: null,
  boardId: "board-1",
  deletedAt: null,
  deletedBy: null,
};

/**
 * Flatten a drizzle SQL condition into a readable string like
 * `task.deleted_at is null`, walking `queryChunks` without tripping over the
 * circular table<->column references.
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

    // drizzle Column: has a name and a table
    if (typeof obj.name === "string" && "table" in obj) {
      const tableName =
        (obj.table as Record<string, unknown> | undefined) &&
        Object.getOwnPropertySymbols(obj.table as object).length >= 0
          ? "task"
          : "";
      parts.push(`${tableName}.${obj.name}`);
      return;
    }

    // StringChunk
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
 * `db.select(...).from(...).leftJoin(...)*.where(...)` chain.
 * Captures every `.where()` argument so tests can assert on the real
 * task query rather than an unrelated permission lookup.
 */
function makeSelectChain(rows: unknown[], captured: unknown[]) {
  const chain: Record<string, Mock> = {
    from: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    orderBy: vi.fn(() => Promise.resolve(rows)),
    limit: vi.fn(() => Promise.resolve(rows)),
    offset: vi.fn(() => Promise.resolve(rows)),
    execute: vi.fn(() => Promise.resolve(rows)),
    // biome-ignore lint/suspicious/noThenProperty: drizzle query builders are thenable; the mock must mimic that.
    then: undefined as unknown as Mock,
  };
  chain.where = vi.fn((cond: unknown) => {
    captured.push(cond);
    return chain;
  });
  // Make the chain awaitable (drizzle queries are thenable) while keeping
  // further chaining (.orderBy/.limit) available.
  // biome-ignore lint/suspicious/noThenProperty: drizzle query builders are thenable; the mock must mimic that.
  chain.then = vi.fn((resolve: (value: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve),
  );
  return chain;
}

function makeUpdateChain(returnedRow: unknown, captured: unknown[]) {
  const chain: Record<string, Mock> = {};
  chain.set = vi.fn((values: unknown) => {
    captured.push({ kind: "set", values });
    return chain;
  });
  chain.where = vi.fn((cond: unknown) => {
    captured.push({ kind: "where", cond });
    return chain;
  });
  chain.returning = vi.fn(() => chain);
  chain.execute = vi.fn(() =>
    Promise.resolve(returnedRow === undefined ? [] : [returnedRow]),
  );
  return chain;
}

function makeDeleteChain(returnedRow: unknown, captured: unknown[]) {
  const chain: Record<string, Mock> = {};
  chain.where = vi.fn((cond: unknown) => {
    captured.push({ kind: "where", cond });
    return chain;
  });
  chain.returning = vi.fn(() => chain);
  chain.execute = vi.fn(() =>
    Promise.resolve(returnedRow === undefined ? [] : [returnedRow]),
  );
  return chain;
}

describe("task soft delete + recycle bin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTaskAssetKeys.mockResolvedValue([]);
    mockBoardFindFirst.mockResolvedValue({ id: "board-1", name: "Board" });
    mockIntegrationFindFirst.mockResolvedValue(null);
    mockDeleteS3Keys.mockResolvedValue(undefined);
  });

  describe("deleteTask (soft delete)", () => {
    it("stamps deletedAt/deletedBy via UPDATE and never issues a DB delete", async () => {
      const selectCaptured: unknown[] = [];
      const updateCaptured: unknown[] = [];

      // 1st select = getTask, 2nd select = task relations
      mockSelect
        .mockReturnValueOnce(makeSelectChain([TASK_ROW], selectCaptured))
        .mockReturnValue(makeSelectChain([], selectCaptured));
      mockUpdate.mockReturnValue(
        makeUpdateChain({ ...TASK_ROW, deletedAt: new Date() }, updateCaptured),
      );

      const result = await deleteTask("task-1", "user-99");

      expect(mockDelete).not.toHaveBeenCalled();
      expect(mockUpdate).toHaveBeenCalledTimes(1);

      const setCall = updateCaptured.find(
        (c) => (c as { kind: string }).kind === "set",
      ) as { values: { deletedAt: Date | null; deletedBy: string | null } };

      expect(setCall.values.deletedAt).toBeInstanceOf(Date);
      expect(setCall.values.deletedBy).toBe("user-99");
      expect(result.id).toBe("task-1");
      expect(mockPublishEvent).toHaveBeenCalledWith("task.deleted", {
        taskId: "task-1",
        boardId: "board-1",
        userId: "user-99",
        title: "Fix the bug",
      });
    });

    it("does not fire S3 asset cleanup on a soft delete", async () => {
      const captured: unknown[] = [];
      mockGetTaskAssetKeys.mockResolvedValue(["key-a"]);
      mockSelect
        .mockReturnValueOnce(makeSelectChain([TASK_ROW], captured))
        .mockReturnValue(makeSelectChain([], captured));
      mockUpdate.mockReturnValue(makeUpdateChain(TASK_ROW, captured));

      await deleteTask("task-1", "user-99");

      expect(mockDeleteS3Keys).not.toHaveBeenCalled();
    });
  });

  describe("read paths exclude trashed tasks", () => {
    it("getTasks filters on isNull(task.deletedAt)", async () => {
      const captured: unknown[] = [];
      // board lookup uses db.select too in this controller path
      mockSelect.mockReturnValue(makeSelectChain([{ count: 0 }], captured));

      await getTasks("board-1").catch(() => {
        // board lookup may reject in the mocked env; the where clause is
        // still captured, which is what we assert on.
      });

      const expected = describeSql(isNull(taskTable.deletedAt));
      expect(expected).toContain("deleted_at");
      expect(expected).toContain("is null");
      const renderedConditions = captured.map(describeSql);
      const found = renderedConditions.some(
        (sql) => sql.includes("deleted_at") && sql.includes("is null"),
      );
      expect(found).toBe(true);
    });

    it("getTrashedTasks filters on isNotNull(task.deletedAt)", async () => {
      const captured: unknown[] = [];
      mockSelect.mockReturnValue(makeSelectChain([], captured));

      await getTrashedTasks({ boardId: "board-1" });

      const expected = describeSql(isNotNull(taskTable.deletedAt));
      expect(expected).toContain("deleted_at");
      expect(expected).toContain("is not null");
      const found = captured.some((cond) =>
        describeSql(cond).includes(expected),
      );
      expect(found).toBe(true);
    });
  });

  describe("restoreTask", () => {
    it("clears deletedAt/deletedBy", async () => {
      const captured: unknown[] = [];
      mockUpdate.mockReturnValue(
        makeUpdateChain({ ...TASK_ROW, deletedAt: null }, captured),
      );

      const restored = await restoreTask("task-1", "user-99");

      const setCall = captured.find(
        (c) => (c as { kind: string }).kind === "set",
      ) as { values: { deletedAt: Date | null; deletedBy: string | null } };

      expect(setCall.values.deletedAt).toBeNull();
      expect(setCall.values.deletedBy).toBeNull();
      expect(restored.id).toBe("task-1");
      expect(mockPublishEvent).toHaveBeenCalledWith(
        "task.restored",
        expect.objectContaining({ taskId: "task-1", userId: "user-99" }),
      );
    });

    it("throws 404 when the task is not in the trash", async () => {
      const captured: unknown[] = [];
      mockUpdate.mockReturnValue(makeUpdateChain(undefined, captured));

      await expect(restoreTask("task-1", "user-99")).rejects.toThrow(
        "Trashed task not found",
      );
    });
  });

  describe("permanentlyDeleteTask", () => {
    it("issues a real DB delete restricted to trashed rows and cleans up assets", async () => {
      const captured: unknown[] = [];
      mockGetTaskAssetKeys.mockResolvedValue(["key-a", "key-b"]);
      mockDelete.mockReturnValue(makeDeleteChain(TASK_ROW, captured));

      await permanentlyDeleteTask("task-1", "user-99");

      expect(mockDelete).toHaveBeenCalledTimes(1);

      const whereCall = captured.find(
        (c) => (c as { kind: string }).kind === "where",
      ) as { cond: unknown };
      expect(describeSql(whereCall.cond)).toContain(
        describeSql(isNotNull(taskTable.deletedAt)),
      );
      expect(mockDeleteS3Keys).toHaveBeenCalledWith(["key-a", "key-b"]);
    });

    it("throws 404 when the task is not in the trash", async () => {
      const captured: unknown[] = [];
      mockDelete.mockReturnValue(makeDeleteChain(undefined, captured));

      await expect(permanentlyDeleteTask("task-1", "user-99")).rejects.toThrow(
        "Trashed task not found",
      );
    });
  });
});
