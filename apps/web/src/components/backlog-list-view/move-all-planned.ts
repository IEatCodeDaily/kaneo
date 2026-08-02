import { produce } from "immer";
import type { BoardWithTasks } from "@/types/board";
import type Task from "@/types/task";

/**
 * Bulk "move all planned tickets to To Do" for the backlog view (#143).
 *
 * Extracted from the route so the behaviour can be tested directly: the route
 * previously guarded this with a native `confirm()`, which is unreachable from
 * a component test and gave the user no ticket count or destination.
 *
 * Returns the tickets that must be persisted plus the optimistically updated
 * board, or null when there is nothing to move — the caller decides how to
 * surface that.
 */
export function planMoveAllPlannedToTodo(board: BoardWithTasks | null) {
  if (!board) return null;

  const plannedTasks = board.plannedTasks ?? [];
  if (plannedTasks.length === 0) return null;

  const movedTasks: Task[] = plannedTasks.map((task) => ({
    ...task,
    status: "to-do",
  }));

  const updatedBoard = produce(board, (draft) => {
    const todoColumn = draft.columns?.find((col) => col.id === "to-do");
    if (todoColumn && draft.plannedTasks) {
      todoColumn.tasks.push(
        ...draft.plannedTasks.map((task) => ({ ...task, status: "to-do" })),
      );
      draft.plannedTasks = [];
    }
  });

  return { movedTasks, updatedBoard, count: plannedTasks.length };
}

export default planMoveAllPlannedToTodo;
