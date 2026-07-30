import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  intentPrefetchHandlers,
  prefetchBoardNavigation,
  prefetchRepoNavigation,
} from "./navigation-prefetch";

vi.mock("@/fetchers/board/get-board", () => ({
  default: vi.fn(async () => ({ id: "board-1" })),
}));
vi.mock("@/fetchers/task/get-tasks", () => ({
  default: vi.fn(async () => ({ id: "board-1", columns: [] })),
}));
vi.mock("@/fetchers/repo/get-repo", () => ({
  default: vi.fn(async () => ({ id: "repo-1" })),
}));
vi.mock("@/fetchers/repo/get-repo-issues", () => ({
  default: vi.fn(async () => ({ items: [], pagination: {} })),
}));

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 30_000 },
    },
  });

describe("navigation intent prefetch", () => {
  it.each(["onMouseEnter", "onFocus"] as const)(
    "%s populates the exact board route consumer keys",
    async (intent) => {
      const queryClient = createQueryClient();
      const handlers = intentPrefetchHandlers(() =>
        prefetchBoardNavigation(queryClient, "org-1", "board-1"),
      );

      handlers[intent]();
      await Promise.all([
        queryClient.ensureQueryData({
          queryKey: ["boards", "org-1", "board-1"],
        }),
        queryClient.ensureQueryData({ queryKey: ["tasks", "board-1"] }),
      ]);

      expect(queryClient.getQueryData(["boards", "org-1", "board-1"])).toEqual({
        id: "board-1",
      });
      expect(queryClient.getQueryData(["tasks", "board-1"])).toEqual({
        id: "board-1",
        columns: [],
      });
    },
  );

  it.each(["onMouseEnter", "onFocus"] as const)(
    "%s populates the exact repository route consumer keys",
    async (intent) => {
      const queryClient = createQueryClient();
      const handlers = intentPrefetchHandlers(() =>
        prefetchRepoNavigation(queryClient, "repo-1"),
      );

      handlers[intent]();
      await Promise.all([
        queryClient.ensureQueryData({ queryKey: ["repo", "repo-1"] }),
        queryClient.ensureQueryData({
          queryKey: ["repo-issues", "repo-1", "open", 1, undefined],
        }),
      ]);

      expect(queryClient.getQueryData(["repo", "repo-1"])).toEqual({
        id: "repo-1",
      });
      expect(
        queryClient.getQueryData([
          "repo-issues",
          "repo-1",
          "open",
          1,
          undefined,
        ]),
      ).toEqual({ items: [], pagination: {} });
    },
  );

  it("does not duplicate requests when click consumers mount after prefetch", async () => {
    const queryClient = createQueryClient();
    const boardRequest = vi.fn(async () => ({ id: "board-1" }));
    const query = {
      queryKey: ["tasks", "board-1"] as const,
      queryFn: boardRequest,
    };

    await queryClient.prefetchQuery(query);
    await queryClient.ensureQueryData(query);

    expect(boardRequest).toHaveBeenCalledTimes(1);
  });
});
