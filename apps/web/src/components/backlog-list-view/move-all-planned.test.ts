import { describe, expect, it } from "vitest";
import type { BoardWithTasks } from "@/types/board";
import { planMoveAllPlannedToTodo } from "./move-all-planned";

/**
 * #143: "Proper Move All modal in Backlog".
 *
 * The old flow called the browser's native `confirm()` and then mutated the
 * board inline. That was untestable and told the user nothing — no ticket
 * count, no destination. The move itself now lives here so it can be asserted
 * directly, and the route wraps it in a real AlertDialog.
 */
function board(planned: number): BoardWithTasks {
  return {
    id: "board-1",
    name: "Board",
    slug: "B",
    columns: [
      {
        id: "to-do",
        name: "To Do",
        tasks: [{ id: "existing", status: "to-do" }],
      },
      { id: "in-progress", name: "In Progress", tasks: [] },
    ],
    plannedTasks: Array.from({ length: planned }, (_, i) => ({
      id: `planned-${i}`,
      status: "planned",
    })),
  } as unknown as BoardWithTasks;
}

describe("planMoveAllPlannedToTodo (#143)", () => {
  it("reports the exact number of tickets that will move", () => {
    const plan = planMoveAllPlannedToTodo(board(3));
    expect(plan?.count).toBe(3);
    expect(plan?.movedTasks).toHaveLength(3);
  });

  it("moves every planned ticket to to-do", () => {
    const plan = planMoveAllPlannedToTodo(board(2));
    for (const task of plan?.movedTasks ?? []) {
      expect(task.status).toBe("to-do");
    }
  });

  it("empties the planned list and appends to the To Do column", () => {
    const plan = planMoveAllPlannedToTodo(board(2));
    expect(plan?.updatedBoard.plannedTasks).toHaveLength(0);
    const todo = plan?.updatedBoard.columns?.find((c) => c.id === "to-do");
    // One pre-existing ticket plus the two that moved.
    expect(todo?.tasks).toHaveLength(3);
  });

  // The caller must be able to tell "nothing to do" from "moved zero", so the
  // dialog is never opened on an empty backlog.
  it("returns null when there is nothing planned", () => {
    expect(planMoveAllPlannedToTodo(board(0))).toBeNull();
  });

  it("returns null without a board", () => {
    expect(planMoveAllPlannedToTodo(null)).toBeNull();
  });

  // Guards the optimistic update: mutating the input board in place would make
  // the UI and the server disagree if a request later failed.
  it("does not mutate the board it was given", () => {
    const original = board(2);
    planMoveAllPlannedToTodo(original);
    expect(original.plannedTasks).toHaveLength(2);
    expect(original.columns?.find((c) => c.id === "to-do")?.tasks).toHaveLength(
      1,
    );
  });
});
