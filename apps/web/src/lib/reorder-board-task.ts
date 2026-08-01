import { produce } from "immer";
import type { BoardWithTasks } from "@/types/board";

export type TaskOrderUpdate = {
  id: string;
  position: number;
  status: string;
};

export const taskOrderUpdates = (board: BoardWithTasks): TaskOrderUpdate[] =>
  board.columns.flatMap((column) =>
    column.tasks.map((task, position) => ({
      id: task.id,
      position,
      status: column.id,
    })),
  );

type ReorderResult = {
  board: BoardWithTasks;
  updates: TaskOrderUpdate[];
};

export function reorderBoardTask(
  board: BoardWithTasks,
  activeId: string,
  overId: string,
): ReorderResult | null {
  if (activeId === overId) return null;
  let updates: TaskOrderUpdate[] = [];
  let moved = false;
  const next = produce(board, (draft) => {
    const source = draft.columns.find((column) =>
      column.tasks.some((task) => task.id === activeId),
    );
    const destination = draft.columns.find(
      (column) =>
        column.id === overId || column.tasks.some((task) => task.id === overId),
    );
    if (!source || !destination) return;

    const sourceIndex = source.tasks.findIndex((task) => task.id === activeId);
    const [task] = source.tasks.splice(sourceIndex, 1);
    const destinationIndex =
      overId === destination.id
        ? destination.tasks.length
        : destination.tasks.findIndex((item) => item.id === overId) + 1;
    destination.tasks.splice(Math.max(0, destinationIndex), 0, task);
    task.status = destination.id;
    moved = true;

    const affected =
      source.id === destination.id ? [source] : [source, destination];
    updates = affected.flatMap((column) =>
      column.tasks.map((item, position) => ({
        id: item.id,
        position,
        status: column.id,
      })),
    );
  });

  return moved ? { board: next, updates } : null;
}
