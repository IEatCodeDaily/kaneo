import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useUpdateTaskPriority } from "./use-update-task-status-priority";

const updateTaskPriority = vi.fn(async () => ({ ok: true }));

vi.mock("@/fetchers/task/update-task-priority", () => ({
  default: (...args: unknown[]) => updateTaskPriority(...(args as [])),
}));

/**
 * Subtask and relation rows embed a copy of the related task, so they carry
 * their own priority value. The priority mutation used to skip the
 * `task-relations` cache, which left those rows showing the previous value
 * (the reported "option stays on the old priority" bug).
 */
describe("useUpdateTaskPriority cache invalidation", () => {
  it("invalidates task-relations so embedded subtask rows refresh", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useUpdateTaskPriority(), { wrapper });

    await result.current.mutateAsync({
      id: "task-1",
      boardId: "board-1",
      priority: "medium",
    } as never);

    await waitFor(() => {
      const keys = invalidate.mock.calls.map(([arg]) =>
        JSON.stringify((arg as { queryKey?: unknown })?.queryKey),
      );
      expect(keys).toContain(JSON.stringify(["task-relations"]));
    });
  });
});
