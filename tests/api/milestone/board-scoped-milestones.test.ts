import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock("../../../apps/api/src/database", () => ({
  default: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

import { eq } from "drizzle-orm";
import { milestoneTable } from "../../../apps/api/src/database/schema";
import createMilestone from "../../../apps/api/src/milestone/controllers/create-milestone";
import getMilestonesByBoardId from "../../../apps/api/src/milestone/controllers/get-milestones-by-board-id";

/**
 * Flatten a drizzle SQL condition into a readable string such as
 * `milestone.board_id = ?`, walking queryChunks without tripping over the
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

    if (typeof obj.name === "string" && "table" in obj) {
      parts.push(`milestone.${obj.name}`);
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

/** Chainable `db.select().from().where().orderBy()` stub. */
function makeSelectChain(rows: unknown[], captured: unknown[]) {
  const chain: Record<string, Mock> = {
    from: vi.fn(() => chain),
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

function makeInsertChain(returnedRow: unknown, captured: unknown[]) {
  const chain: Record<string, Mock> = {};
  chain.values = vi.fn((values: unknown) => {
    captured.push(values);
    return chain;
  });
  chain.returning = vi.fn(() =>
    Promise.resolve(returnedRow === undefined ? [] : [returnedRow]),
  );
  return chain;
}

const MILESTONE_ROW = {
  id: "ms-1",
  boardId: "board-1",
  name: "v1.0",
  description: null,
  dueDate: null,
  status: "planned",
  position: 0,
  completedAt: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

describe("board-scoped milestones", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getMilestonesByBoardId", () => {
    it("filters the query by boardId so other boards' milestones cannot leak", async () => {
      const captured: unknown[] = [];
      mockSelect.mockReturnValue(makeSelectChain([MILESTONE_ROW], captured));

      await getMilestonesByBoardId("board-1");

      expect(captured.length).toBeGreaterThan(0);
      const expected = describeSql(eq(milestoneTable.boardId, "board-1"));
      expect(expected).toContain("milestone.board_id");

      const found = captured.some((cond) =>
        describeSql(cond).includes("milestone.board_id"),
      );
      expect(found).toBe(true);
    });
  });

  describe("createMilestone", () => {
    it("persists the milestone against the requested board", async () => {
      const selectCaptured: unknown[] = [];
      const insertCaptured: unknown[] = [];

      // 1st select = board existence check, 2nd = duplicate-name check
      mockSelect
        .mockReturnValueOnce(
          makeSelectChain([{ id: "board-1" }], selectCaptured),
        )
        .mockReturnValueOnce(makeSelectChain([], selectCaptured));
      mockInsert.mockReturnValue(
        makeInsertChain(MILESTONE_ROW, insertCaptured),
      );

      const created = await createMilestone({
        boardId: "board-1",
        name: "v1.0",
      });

      expect(created.id).toBe("ms-1");
      const values = insertCaptured[0] as { boardId: string; name: string };
      expect(values.boardId).toBe("board-1");
      expect(values.name).toBe("v1.0");
    });

    it("rejects a duplicate milestone name on the same board with 409", async () => {
      const selectCaptured: unknown[] = [];
      mockSelect
        .mockReturnValueOnce(
          makeSelectChain([{ id: "board-1" }], selectCaptured),
        )
        .mockReturnValueOnce(
          makeSelectChain([{ id: "ms-existing" }], selectCaptured),
        );

      await expect(
        createMilestone({ boardId: "board-1", name: "v1.0" }),
      ).rejects.toThrow(
        "A milestone with this name already exists on this board",
      );

      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("404s when the board does not exist", async () => {
      const selectCaptured: unknown[] = [];
      mockSelect.mockReturnValueOnce(makeSelectChain([], selectCaptured));

      await expect(
        createMilestone({ boardId: "nope", name: "v1.0" }),
      ).rejects.toThrow("Board not found");

      expect(mockInsert).not.toHaveBeenCalled();
    });
  });
});
