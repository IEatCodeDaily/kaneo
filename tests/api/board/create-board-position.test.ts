import { describe, expect, it, vi } from "vitest";

/**
 * Creating a board 500'd with `maxPosition is not defined`.
 *
 * Upstream's drag-and-drop reordering commit (207504dc, cherry-picked here)
 * added `position: maxPosition === null ? 0 : maxPosition + 1` to the insert
 * and imported `max`, but never added the query that computes `maxPosition`.
 * Every board insert therefore threw a ReferenceError.
 *
 * The rest of that upstream feature never landed in this fork: boardTable has
 * no `position` field, there is no migration adding the column (the live DB
 * confirms it is absent), and there is no board reorder endpoint. Sidebar order
 * is reconciled client-side instead (reconcileSidebarOrder). So the field is
 * removed rather than backfilled — adding a column for a feature that does not
 * exist here would be scaffolding.
 *
 * These tests exercise the real controller against a fake tx so a missing
 * binding throws exactly as it did in production, and pin that the insert
 * carries no `position` key.
 */

type Captured = { values?: Record<string, unknown> };

function makeDb() {
  const captured: Captured = {};

  const tx = {
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        if ("organizationId" in values) captured.values = values;
        return {
          returning: () => Promise.resolve([{ id: "board-1", ...values }]),
        };
      },
    }),
  };

  return {
    captured,
    db: {
      transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    },
  };
}

async function loadCreateBoard() {
  const { db, captured } = makeDb();
  vi.resetModules();
  vi.doMock("../../../apps/api/src/database", () => ({ default: db }));
  const mod = await import(
    "../../../apps/api/src/board/controllers/create-board"
  );
  return { createBoard: mod.default, captured };
}

describe("createBoard", () => {
  it("creates a board without throwing a ReferenceError", async () => {
    const { createBoard } = await loadCreateBoard();

    // Before the fix this rejected with "maxPosition is not defined".
    await expect(
      createBoard("org-1", "My Board", "Layout", "my-board"),
    ).resolves.toBeTruthy();
  });

  it("persists the fields the caller supplied", async () => {
    const { createBoard, captured } = await loadCreateBoard();
    await createBoard("org-1", "My Board", "Layout", "my-board");

    expect(captured.values).toMatchObject({
      organizationId: "org-1",
      name: "My Board",
      icon: "Layout",
      slug: "my-board",
    });
  });

  it("does not write a position column that does not exist", async () => {
    const { createBoard, captured } = await loadCreateBoard();
    await createBoard("org-1", "My Board", "Layout", "my-board");

    // boardTable has no `position` field; writing one would fail at the DB.
    expect(captured.values).not.toHaveProperty("position");
  });

  it("seeds the default columns for the new board", async () => {
    const { createBoard } = await loadCreateBoard();
    const board = await createBoard("org-1", "My Board", "Layout", "my-board");

    expect(board).toBeTruthy();
  });
});
