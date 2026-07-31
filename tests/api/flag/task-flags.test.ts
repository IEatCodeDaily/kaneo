import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockPublishEvent = vi.fn();

vi.mock("../../../apps/api/src/database", () => ({
  default: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

vi.mock("../../../apps/api/src/events", () => ({
  publishEvent: (...args: unknown[]) => mockPublishEvent(...args),
}));

import getFlagTypesByBoardId from "../../../apps/api/src/flag/controllers/get-flag-types-by-board-id";
import getTaskFlags from "../../../apps/api/src/flag/controllers/get-task-flags";
import resolveTaskFlag from "../../../apps/api/src/flag/controllers/resolve-task-flag";

/**
 * Flatten a drizzle SQL condition into a readable string like
 * `task_flag.resolved_at is null`, walking queryChunks without tripping over
 * the circular table<->column references.
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
      const table = obj.table as Record<symbol, unknown> | undefined;
      const tableName = table
        ? Object.getOwnPropertySymbols(table)
            .map((sym) =>
              sym.description?.includes("Name") ? table[sym] : null,
            )
            .find((value) => typeof value === "string")
        : null;
      parts.push(`${tableName ?? "?"}.${obj.name}`);
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

/** Chainable `db.select().from().joins().where().orderBy()` stub. */
function makeSelectChain(rows: unknown[], captured: unknown[]) {
  const chain: Record<string, Mock> = {
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(rows)),
    orderBy: vi.fn(() => Promise.resolve(rows)),
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

function makeInsertChain(rows: unknown[], captured: unknown[]) {
  const chain: Record<string, Mock> = {};
  chain.values = vi.fn((values: unknown) => {
    captured.push(values);
    return chain;
  });
  chain.onConflictDoNothing = vi.fn(() => chain);
  chain.returning = vi.fn(() => Promise.resolve(rows));
  return chain;
}

function makeUpdateChain(
  rows: unknown[],
  setCaptured: unknown[],
  whereCaptured: unknown[],
) {
  const chain: Record<string, Mock> = {};
  chain.set = vi.fn((values: unknown) => {
    setCaptured.push(values);
    return chain;
  });
  chain.where = vi.fn((cond: unknown) => {
    whereCaptured.push(cond);
    return chain;
  });
  chain.returning = vi.fn(() => Promise.resolve(rows));
  return chain;
}

function makeDeleteChain(rows: unknown[], whereCaptured: unknown[]) {
  const chain: Record<string, Mock> = {};
  chain.where = vi.fn((cond: unknown) => {
    whereCaptured.push(cond);
    return chain;
  });
  chain.returning = vi.fn(() => Promise.resolve(rows));
  return chain;
}

const ACTIVE_FLAG = {
  id: "flag-1",
  taskId: "task-1",
  flagTypeId: "ft-blocked",
  flaggedBy: "user-a",
  targetUserId: "user-b",
  targetTeamId: null,
  note: "waiting on you",
  resolvedAt: null,
  resolvedBy: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

describe("task flags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getTaskFlags active-flag filtering", () => {
    it("filters out resolved flags with a resolved_at IS NULL condition", async () => {
      const captured: unknown[] = [];
      mockSelect.mockReturnValue(makeSelectChain([ACTIVE_FLAG], captured));

      await getTaskFlags("task-1");

      expect(captured.length).toBe(1);
      const rendered = describeSql(captured[0]);
      // The captured condition must be the task_flag query, not some other table.
      expect(rendered).toContain("task_flag.task_id");
      expect(rendered).toContain("task_flag.resolved_at");
      expect(rendered.toLowerCase()).toContain("is null");
    });

    it("includes resolved flags only when explicitly asked", async () => {
      const captured: unknown[] = [];
      mockSelect.mockReturnValue(makeSelectChain([ACTIVE_FLAG], captured));

      await getTaskFlags("task-1", true);

      const rendered = describeSql(captured[0]);
      expect(rendered).toContain("task_flag.task_id");
      expect(rendered).not.toContain("task_flag.resolved_at");
    });
  });

  describe("resolveTaskFlag audit trail", () => {
    it("records resolved_by and resolved_at via UPDATE, never deleting the row", async () => {
      const selectCaptured: unknown[] = [];
      const setCaptured: unknown[] = [];
      const whereCaptured: unknown[] = [];

      mockSelect
        .mockReturnValueOnce(makeSelectChain([ACTIVE_FLAG], selectCaptured))
        .mockReturnValueOnce(
          makeSelectChain(
            [{ id: "task-1", boardId: "board-1" }],
            selectCaptured,
          ),
        );
      mockUpdate.mockReturnValue(
        makeUpdateChain(
          [
            {
              ...ACTIVE_FLAG,
              resolvedAt: new Date("2026-02-01"),
              resolvedBy: "user-c",
            },
          ],
          setCaptured,
          whereCaptured,
        ),
      );
      // A DELETE-based implementation must still run to completion so the
      // assertions below (not a TypeError) are what catches it.
      mockDelete.mockReturnValue(makeDeleteChain([ACTIVE_FLAG], whereCaptured));

      const resolved = await resolveTaskFlag("flag-1", "user-c");

      // The row survives: no DELETE was issued.
      expect(mockDelete).not.toHaveBeenCalled();
      expect(mockUpdate).toHaveBeenCalled();

      const values = setCaptured[0] as {
        resolvedBy?: string;
        resolvedAt?: Date;
      };
      expect(values.resolvedBy).toBe("user-c");
      expect(values.resolvedAt).toBeInstanceOf(Date);

      expect(resolved.id).toBe("flag-1");
      expect(resolved.resolvedBy).toBe("user-c");
      expect(resolved.resolvedAt).not.toBeNull();

      // Activity history gets the unflag event, naming who resolved it.
      expect(mockPublishEvent).toHaveBeenCalledWith(
        "task.flag_resolved",
        expect.objectContaining({ resolvedBy: "user-c", taskId: "task-1" }),
      );
    });

    it("refuses to re-resolve an already resolved flag so the original resolver is preserved", async () => {
      const selectCaptured: unknown[] = [];
      mockSelect.mockReturnValueOnce(
        makeSelectChain(
          [
            {
              ...ACTIVE_FLAG,
              resolvedAt: new Date("2026-01-05"),
              resolvedBy: "user-x",
            },
          ],
          selectCaptured,
        ),
      );

      mockUpdate.mockReturnValue(makeUpdateChain([], [], []));
      mockDelete.mockReturnValue(makeDeleteChain([], []));

      await expect(resolveTaskFlag("flag-1", "user-c")).rejects.toThrow(
        "Flag is already resolved",
      );

      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockDelete).not.toHaveBeenCalled();
    });
  });

  describe("board-scoped flag types", () => {
    it("scopes the flag type listing to the requested board", async () => {
      const captured: unknown[] = [];
      mockSelect.mockReturnValue(
        makeSelectChain(
          [{ id: "ft-blocked", boardId: "board-1", name: "Blocked" }],
          captured,
        ),
      );

      await getFlagTypesByBoardId("board-1");

      expect(captured.length).toBeGreaterThan(0);
      const rendered = describeSql(captured[0]);
      expect(rendered).toContain("flag_type.board_id");
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("lazily seeds the four default flag types for a board that has none", async () => {
      const selectCaptured: unknown[] = [];
      const insertCaptured: unknown[] = [];

      mockSelect
        .mockReturnValueOnce(makeSelectChain([], selectCaptured))
        .mockReturnValueOnce(
          makeSelectChain([{ id: "board-1" }], selectCaptured),
        );
      mockInsert.mockReturnValue(
        makeInsertChain(
          [{ id: "ft-1", boardId: "board-1", name: "Blocked" }],
          insertCaptured,
        ),
      );

      await getFlagTypesByBoardId("board-1");

      const values = insertCaptured[0] as Array<{
        name: string;
        boardId: string;
      }>;
      expect(values.map((row) => row.name)).toEqual([
        "Blocked",
        "Need Approval",
        "Need Help",
        "Need Input",
      ]);
      expect(values.every((row) => row.boardId === "board-1")).toBe(true);
    });
  });
});
