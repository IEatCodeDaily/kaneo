import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  intentPrefetchHandlers,
  prefetchBoardNavigation,
  prefetchRepoNavigation,
  prefetchTaskNavigation,
  repoPullRequestsQueryOptions,
} from "./navigation-prefetch";

vi.mock("@/fetchers/board/get-board", () => ({
  default: vi.fn(async () => ({ id: "board-1" })),
}));
vi.mock("@/fetchers/task/get-tasks", () => ({
  default: vi.fn(async () => ({ id: "board-1", columns: [] })),
}));
vi.mock("@/fetchers/task/get-task", () => ({
  default: vi.fn(async () => ({ id: "task-1" })),
}));
vi.mock("@/fetchers/repo/get-repo", () => ({
  default: vi.fn(async () => ({ id: "repo-1" })),
}));
vi.mock("@/fetchers/repo/get-repo-issues", () => ({
  default: vi.fn(async () => ({ items: [], pagination: {} })),
}));
vi.mock("@/fetchers/repo/get-repo-pull-requests", () => ({
  default: vi.fn(async () => ({ items: [], pagination: {} })),
}));

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 30_000 },
    },
  });

/** Record every key handed to prefetchQuery without stubbing the cache away. */
const spyOnPrefetch = (queryClient: QueryClient) => {
  const keys: unknown[][] = [];
  const original = queryClient.prefetchQuery.bind(queryClient);
  vi.spyOn(queryClient, "prefetchQuery").mockImplementation((options) => {
    keys.push(options.queryKey as unknown[]);
    return original(options);
  });
  return keys;
};

describe("navigation intent prefetch", () => {
  it.each(["onMouseEnter", "onFocus", "onPointerEnter"] as const)(
    "%s prefetches the board's own task queryKey",
    async (intent) => {
      const queryClient = createQueryClient();
      const keys = spyOnPrefetch(queryClient);
      const handlers = intentPrefetchHandlers(() =>
        prefetchBoardNavigation(queryClient, "org-1", "board-1"),
      );

      handlers[intent]();
      await queryClient.ensureQueryData({ queryKey: ["tasks", "board-1"] });

      expect(keys).toContainEqual(["tasks", "board-1"]);
      expect(keys).toContainEqual(["boards", "org-1", "board-1"]);
      expect(queryClient.getQueryData(["tasks", "board-1"])).toEqual({
        id: "board-1",
        columns: [],
      });
    },
  );

  it.each(["onMouseEnter", "onFocus", "onPointerEnter"] as const)(
    "%s prefetches the repository's issue and pull-request lists",
    async (intent) => {
      const queryClient = createQueryClient();
      const keys = spyOnPrefetch(queryClient);
      const handlers = intentPrefetchHandlers(() =>
        prefetchRepoNavigation(queryClient, "repo-1"),
      );

      handlers[intent]();
      await queryClient.ensureQueryData({ queryKey: ["repo", "repo-1"] });

      expect(keys).toContainEqual(["repo", "repo-1"]);
      // Defaults must match useGetRepoIssues / useGetRepoPullRequests exactly,
      // or the route mounts on a different key and refetches anyway.
      expect(keys).toContainEqual(["repo-issues", "repo-1", "open", 1, 50]);
      expect(keys).toContainEqual([
        "repo-pull-requests",
        "repo-1",
        "open",
        1,
        50,
      ]);
    },
  );

  it("prefetches a single task row on intent", async () => {
    const queryClient = createQueryClient();
    const keys = spyOnPrefetch(queryClient);

    await intentPrefetchHandlers(() =>
      prefetchTaskNavigation(queryClient, "task-1"),
    ).onPointerEnter();
    await queryClient.ensureQueryData({ queryKey: ["task", "task-1"] });

    expect(keys).toContainEqual(["task", "task-1"]);
  });

  it("serves the prefetched entry to the destination instead of refetching", async () => {
    const queryClient = createQueryClient();
    const boardRequest = vi.fn(async () => ({ id: "board-1" }));
    const query = {
      queryKey: ["tasks", "board-1"] as const,
      queryFn: boardRequest,
      staleTime: 10_000,
    };

    await queryClient.prefetchQuery(query);
    await queryClient.ensureQueryData(query);

    expect(boardRequest).toHaveBeenCalledTimes(1);
  });

  it("serves prefetched pull requests to the route without a second fetch", async () => {
    const queryClient = createQueryClient();
    const options = repoPullRequestsQueryOptions("repo-1", "open", 1, 50);

    await prefetchRepoNavigation(queryClient, "repo-1");
    const cached = await queryClient.ensureQueryData(options);

    expect(cached).toEqual({ items: [], pagination: {} });
    expect(queryClient.getQueryState(options.queryKey)?.fetchStatus).toBe(
      "idle",
    );
  });
});
