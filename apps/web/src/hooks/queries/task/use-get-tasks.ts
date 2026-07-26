import { useQuery } from "@tanstack/react-query";
import getTasks from "@/fetchers/task/get-tasks";

export function useGetTasks(boardId: string) {
  return useQuery({
    queryKey: ["tasks", boardId],
    queryFn: () => getTasks(boardId),
    refetchInterval: 30000,
    enabled: !!boardId,
  });
}
