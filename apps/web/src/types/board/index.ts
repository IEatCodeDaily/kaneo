import type { client } from "@kaneo/libs";
import type { InferResponseType } from "hono/client";
import type Task from "@/types/task";

export type Board = Extract<
  InferResponseType<(typeof client)["board"][":id"]["$get"], 200>,
  { id: string }
>;

type TasksApiResponse = InferResponseType<
  (typeof client)["task"]["tasks"][":boardId"]["$get"],
  200
>;

type BoardWithTasksRaw = TasksApiResponse["data"];

type StatusBucket = Omit<BoardWithTasksRaw["columns"][number], "tasks"> & {
  tasks: Task[];
};

/**
 * Every status is a board row. `columns` are the statuses shown on the board
 * (Kanban lanes); `backlogColumns` are the rest — the Backlog page's sections
 * (Triage, Planned, Duplicate by default). `plannedTasks` is every off-board
 * ticket flattened, for views that union "all tickets".
 */
export type BoardWithTasks = Omit<
  BoardWithTasksRaw,
  "archivedTasks" | "columns" | "backlogColumns" | "plannedTasks"
> & {
  archivedTasks: Task[];
  columns: StatusBucket[];
  backlogColumns: StatusBucket[];
  plannedTasks: Task[];
};
