import { describe, expect, it } from "vitest";
import type { BoardWithTasks } from "@/types/board";
import { reorderBoardTask, taskOrderUpdates } from "./reorder-board-task";

type Col = { id: string; tasks: string[] };

function makeBoard(cols: Col[]): BoardWithTasks {
  return {
    id: "board-1",
    name: "Board",
    columns: cols.map((col) => ({
      id: col.id,
      name: col.id,
      isFinal: false,
      tasks: col.tasks.map((id, position) => ({
        id,
        title: id,
        status: col.id,
        position,
      })),
    })),
  } as unknown as BoardWithTasks;
}

/** Task ids per column, in order — the shape assertions actually care about. */
function layout(board: BoardWithTasks): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const column of board.columns) {
    out[column.id] = column.tasks.map((task) => task.id);
  }
  return out;
}

describe("reorderBoardTask — same column", () => {
  const board = makeBoard([{ id: "todo", tasks: ["A", "B", "C", "D", "E"] }]);

  it("moves a task DOWN onto a lower task, landing at that task's slot", () => {
    const result = reorderBoardTask(board, "B", "D");
    expect(result).not.toBeNull();
    expect(layout(result!.board).todo).toEqual(["A", "C", "D", "B", "E"]);
  });

  it("moves a task UP onto a higher task, taking that task's slot", () => {
    // Dropping D on B means "put D where B is". D must land at index 1, NOT 2.
    // Regression: inserting after the over-item made every upward drag land one
    // row too low, in both the list view and the kanban board.
    const result = reorderBoardTask(board, "D", "B");
    expect(result).not.toBeNull();
    expect(layout(result!.board).todo).toEqual(["A", "D", "B", "C", "E"]);
  });

  it("can move a task to the very top of the column", () => {
    // Previously unreachable: `findIndex(over) + 1` floored the insert at 1.
    const result = reorderBoardTask(board, "E", "A");
    expect(result).not.toBeNull();
    expect(layout(result!.board).todo).toEqual(["E", "A", "B", "C", "D"]);
  });

  it("can move a task to the very bottom of the column", () => {
    const result = reorderBoardTask(board, "A", "E");
    expect(result).not.toBeNull();
    expect(layout(result!.board).todo).toEqual(["B", "C", "D", "E", "A"]);
  });

  it("is symmetric: moving down then back up restores the original order", () => {
    const down = reorderBoardTask(board, "B", "D");
    expect(down).not.toBeNull();
    const backUp = reorderBoardTask(down!.board, "B", "C");
    expect(backUp).not.toBeNull();
    expect(layout(backUp!.board).todo).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("moves each task onto every other slot without duplicating or losing tasks", () => {
    const ids = ["A", "B", "C", "D", "E"];
    for (const active of ids) {
      for (const over of ids) {
        if (active === over) continue;
        const result = reorderBoardTask(board, active, over);
        expect(result).not.toBeNull();
        const after = layout(result!.board).todo;
        expect(after).toHaveLength(5);
        expect([...after].sort()).toEqual([...ids].sort());
        // The dragged task must end up exactly where the user dropped it: at
        // the index the over-item occupied in the ORIGINAL list.
        expect(after.indexOf(active)).toBe(ids.indexOf(over));
      }
    }
  });

  it("returns null when dropped on itself", () => {
    expect(reorderBoardTask(board, "C", "C")).toBeNull();
  });
});

describe("reorderBoardTask — across columns", () => {
  const board = makeBoard([
    { id: "todo", tasks: ["A", "B", "C"] },
    { id: "doing", tasks: ["X", "Y"] },
    { id: "done", tasks: [] },
  ]);

  it("inserts at the target task's slot in the destination column", () => {
    // Cross-column: removing from the source does NOT shift destination
    // indices, so no adjustment applies — B takes Y's slot.
    const result = reorderBoardTask(board, "B", "Y");
    expect(result).not.toBeNull();
    const after = layout(result!.board);
    expect(after.todo).toEqual(["A", "C"]);
    expect(after.doing).toEqual(["X", "B", "Y"]);
  });

  it("inserts at the top when dropping on the first task of another column", () => {
    const result = reorderBoardTask(board, "B", "X");
    expect(result).not.toBeNull();
    expect(layout(result!.board).doing).toEqual(["B", "X", "Y"]);
  });

  it("appends when dropping on a column container", () => {
    const result = reorderBoardTask(board, "A", "doing");
    expect(result).not.toBeNull();
    const after = layout(result!.board);
    expect(after.todo).toEqual(["B", "C"]);
    expect(after.doing).toEqual(["X", "Y", "A"]);
  });

  it("moves into an empty column", () => {
    const result = reorderBoardTask(board, "A", "done");
    expect(result).not.toBeNull();
    const after = layout(result!.board);
    expect(after.todo).toEqual(["B", "C"]);
    expect(after.done).toEqual(["A"]);
  });

  it("rewrites the moved task's status to the destination column", () => {
    const result = reorderBoardTask(board, "B", "Y");
    const moved = result!.board.columns
      .flatMap((column) => column.tasks)
      .find((task) => task.id === "B");
    expect(moved?.status).toBe("doing");
  });

  it("emits contiguous positions for both affected columns", () => {
    const result = reorderBoardTask(board, "B", "Y");
    const byColumn = new Map<string, number[]>();
    for (const update of result!.updates) {
      byColumn.set(update.status, [
        ...(byColumn.get(update.status) ?? []),
        update.position,
      ]);
    }
    for (const [, positions] of byColumn) {
      expect(positions).toEqual(positions.map((_, index) => index));
    }
  });
});

describe("taskOrderUpdates", () => {
  it("numbers every task by its index within its own column", () => {
    const board = makeBoard([
      { id: "todo", tasks: ["A", "B"] },
      { id: "doing", tasks: ["X"] },
    ]);
    expect(taskOrderUpdates(board)).toEqual([
      { id: "A", position: 0, status: "todo" },
      { id: "B", position: 1, status: "todo" },
      { id: "X", position: 0, status: "doing" },
    ]);
  });
});

/**
 * Cases carried over from the original suite. Note that it only ever exercised
 * DOWNWARD moves ("adjusts the destination index when moving down within one
 * column"), which is why the upward off-by-one survived — the buggy `+1`
 * cancels out when travelling down. Keeping them guards the cross-column
 * update-list shape.
 */
describe("reorderBoardTask — original regression cases", () => {
  const twoColumn = makeBoard([
    { id: "todo", tasks: ["a", "b"] },
    { id: "done", tasks: ["c"] },
  ]);

  it("returns one compact update list for all affected task positions", () => {
    const result = reorderBoardTask(twoColumn, "a", "done");

    expect(
      result?.board.columns.map((column) =>
        column.tasks.map((item) => item.id),
      ),
    ).toEqual([["b"], ["c", "a"]]);
    expect(result?.updates).toEqual([
      { id: "b", position: 0, status: "todo" },
      { id: "c", position: 0, status: "done" },
      { id: "a", position: 1, status: "done" },
    ]);
  });

  it("swaps a two-task column when moving down onto the last task", () => {
    const result = reorderBoardTask(twoColumn, "a", "b");
    expect(result?.board.columns[0].tasks.map((item) => item.id)).toEqual([
      "b",
      "a",
    ]);
  });

  it("preserves every card exactly once after a longer downward move", () => {
    const longBoard = makeBoard([{ id: "todo", tasks: ["a", "b", "c", "d"] }]);
    const result = reorderBoardTask(longBoard, "a", "c");
    const ids = result?.board.columns[0].tasks.map((item) => item.id);
    expect(ids).toEqual(["b", "c", "a", "d"]);
    expect(new Set(ids).size).toBe(4);
  });
});
