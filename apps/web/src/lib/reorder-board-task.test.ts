import { describe, expect, it } from "vitest";
import type { BoardWithTasks } from "@/types/board";
import { reorderBoardTask } from "./reorder-board-task";

const task = (id: string, status: string, position: number) =>
  ({
    id,
    status,
    position,
  }) as BoardWithTasks["columns"][number]["tasks"][number];

const board = {
  id: "board",
  organizationId: "org",
  columns: [
    { id: "todo", tasks: [task("a", "todo", 0), task("b", "todo", 1)] },
    { id: "done", tasks: [task("c", "done", 0)] },
  ],
} as BoardWithTasks;

describe("reorderBoardTask", () => {
  it("returns one compact update list for all affected task positions", () => {
    const result = reorderBoardTask(board, "a", "done");

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

  it("adjusts the destination index when moving down within one column", () => {
    const result = reorderBoardTask(board, "a", "b");
    expect(result?.board.columns[0].tasks.map((item) => item.id)).toEqual([
      "b",
      "a",
    ]);
  });

  it("preserves every card exactly once after a longer downward move", () => {
    const longBoard = {
      ...board,
      columns: [
        {
          id: "todo",
          tasks: ["a", "b", "c", "d"].map((id, position) =>
            task(id, "todo", position),
          ),
        },
      ],
    } as BoardWithTasks;

    const result = reorderBoardTask(longBoard, "a", "c");
    const ids = result?.board.columns[0].tasks.map((item) => item.id);
    expect(ids).toEqual(["b", "c", "a", "d"]);
    expect(new Set(ids).size).toBe(4);
  });
});
