import { useMutation, useQueryClient } from "@tanstack/react-query";
import reorderTasks from "@/fetchers/task/reorder-tasks";
import type { TaskOrderUpdate } from "@/lib/reorder-board-task";

export function useReorderTasks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      boardId,
      tasks,
    }: {
      boardId: string;
      tasks: TaskOrderUpdate[];
    }) => reorderTasks(boardId, tasks),
    onSuccess: (_, { boardId }) => {
      queryClient.invalidateQueries({ queryKey: ["tasks", boardId] });
      queryClient.invalidateQueries({ queryKey: ["boards"] });
    },
  });
}
