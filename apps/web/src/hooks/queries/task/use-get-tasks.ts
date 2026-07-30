import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { tasksQueryOptions } from "@/lib/navigation-prefetch";

export function useGetTasks(boardId: string) {
  return useQuery({
    ...tasksQueryOptions(boardId),
    refetchInterval: 30000,
    enabled: !!boardId,
    // Board switches render the previous board's rows until the new ones land,
    // instead of flashing the empty state. `isPlaceholderData` tells the view
    // it's showing stale rows so it can dim them.
    placeholderData: keepPreviousData,
    // A board's task list rarely changes between two clicks; serving it from
    // cache makes revisiting a board instant while the refetch happens behind.
    staleTime: 10_000,
  });
}
