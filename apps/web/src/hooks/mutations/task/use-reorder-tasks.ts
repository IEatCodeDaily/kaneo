import { useMutation, useQueryClient } from "@tanstack/react-query";
import reorderTasks from "@/fetchers/task/reorder-tasks";
import type { TaskOrderUpdate } from "@/lib/reorder-board-task";
import type { BoardWithTasks } from "@/types/board";

type ReorderVariables = {
  boardId: string;
  board: BoardWithTasks;
  tasks: TaskOrderUpdate[];
};

export function useReorderTasks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ boardId, tasks }: ReorderVariables) =>
      reorderTasks(boardId, tasks),
    onMutate: async ({ boardId, board }) => {
      await queryClient.cancelQueries({ queryKey: ["tasks", boardId] });
      const previous = queryClient.getQueryData<BoardWithTasks>([
        "tasks",
        boardId,
      ]);
      queryClient.setQueryData(["tasks", boardId], board);
      return { previous };
    },
    onError: (_error, { boardId }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["tasks", boardId], context.previous);
      }
    },
    onSettled: (_, _error, { boardId }) => {
      queryClient.invalidateQueries({ queryKey: ["tasks", boardId] });
      queryClient.invalidateQueries({ queryKey: ["boards"] });
    },
  });
}
