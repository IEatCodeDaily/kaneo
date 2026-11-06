import type { QueryClient } from "@tanstack/react-query";

type VersionedTask = { id: string; detailVersion?: string };
type TaskVersions = {
  columns: Array<{ tasks: VersionedTask[] }>;
  plannedTasks: VersionedTask[];
  archivedTasks: VersionedTask[];
};

function boardTasks(board: TaskVersions) {
  return [
    ...board.columns.flatMap((column) => column.tasks),
    ...board.plannedTasks,
    ...board.archivedTasks,
  ];
}

export function reconcileTaskDetails(
  queryClient: QueryClient,
  previous: TaskVersions | undefined,
  current: TaskVersions,
) {
  if (!previous) return;
  const previousVersions = new Map(
    boardTasks(previous).map((task) => [task.id, task.detailVersion]),
  );
  for (const task of boardTasks(current)) {
    if (
      previousVersions.has(task.id) &&
      previousVersions.get(task.id) !== task.detailVersion
    ) {
      queryClient.invalidateQueries({ queryKey: ["task", task.id] });
    }
  }
}
