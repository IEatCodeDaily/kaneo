import type { QueryClient } from "@tanstack/react-query";
import getBoard from "@/fetchers/board/get-board";
import getRepo from "@/fetchers/repo/get-repo";
import getRepoIssues from "@/fetchers/repo/get-repo-issues";
import getTasks from "@/fetchers/task/get-tasks";

export const intentPrefetchHandlers = (prefetch: () => unknown) => ({
  onFocus: () => void prefetch(),
  onMouseEnter: () => void prefetch(),
});

export const boardQueryOptions = (organizationId: string, boardId: string) => ({
  queryKey: ["boards", organizationId, boardId] as const,
  queryFn: () => getBoard({ id: boardId, organizationId }),
});

export const tasksQueryOptions = (boardId: string) => ({
  queryKey: ["tasks", boardId] as const,
  queryFn: () => getTasks(boardId),
});

export const repoQueryOptions = (repoId: string) => ({
  queryKey: ["repo", repoId] as const,
  queryFn: () => getRepo(repoId),
});

export const repoIssuesQueryOptions = (
  repoId: string,
  state: "open" | "closed" | "all" = "open",
  page = 1,
  limit?: number,
) => ({
  queryKey: ["repo-issues", repoId, state, page, limit] as const,
  queryFn: () => getRepoIssues({ repoId, state, page, limit }),
});

export function prefetchBoardNavigation(
  queryClient: QueryClient,
  organizationId: string,
  boardId: string,
) {
  return Promise.all([
    queryClient.prefetchQuery(boardQueryOptions(organizationId, boardId)),
    queryClient.prefetchQuery(tasksQueryOptions(boardId)),
  ]);
}

export function prefetchRepoNavigation(
  queryClient: QueryClient,
  repoId: string,
) {
  return Promise.all([
    queryClient.prefetchQuery(repoQueryOptions(repoId)),
    queryClient.prefetchQuery(repoIssuesQueryOptions(repoId)),
  ]);
}
