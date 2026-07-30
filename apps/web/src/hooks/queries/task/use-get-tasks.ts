import { useQuery } from "@tanstack/react-query";
import { tasksQueryOptions } from "@/lib/navigation-prefetch";

export function useGetTasks(boardId: string) {
  return useQuery({
    ...tasksQueryOptions(boardId),
    refetchInterval: 30000,
    enabled: !!boardId,
  });
}
