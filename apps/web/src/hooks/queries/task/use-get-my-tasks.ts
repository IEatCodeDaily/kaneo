import { useQuery } from "@tanstack/react-query";
import getMyTasks, { type MyTasksParams } from "@/fetchers/task/get-my-tasks";

/**
 * Cross-board "My Tasks" list (#58). Keyed on every filter so switching
 * relation or the completed toggle refetches rather than serving the
 * previous filter's rows.
 */
function useGetMyTasks({
  organizationId,
  relation = "all",
  includeCompleted = false,
  limit = 50,
  offset = 0,
}: MyTasksParams = {}) {
  return useQuery({
    queryKey: [
      "my-tasks",
      organizationId,
      relation,
      includeCompleted,
      limit,
      offset,
    ],
    queryFn: () =>
      getMyTasks({ organizationId, relation, includeCompleted, limit, offset }),
    enabled: !!organizationId,
    staleTime: 10_000,
  });
}

export default useGetMyTasks;
