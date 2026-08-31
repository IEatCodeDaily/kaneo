import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const assignMutate = vi.fn();
vi.mock("@/fetchers/project/assign-project-ticket-milestone", () => ({
  default: (...args: unknown[]) => assignMutate(...args),
}));

import useAssignProjectTicketMilestone from "./use-assign-project-ticket-milestone";

// NOTE: the shared invalidation helper (project-sync-invalidation) is NOT
// mocked — the hook must route success through the real helper, and the
// assertions below read the keys it actually invalidates on a live
// QueryClient. Helper-level mocks would stay green if the hook ever stopped
// calling the helper.

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe("useAssignProjectTicketMilestone", () => {
  beforeEach(() => {
    assignMutate.mockReset();
    assignMutate.mockResolvedValue({ id: "ticket-1" });
  });

  it("invalidates Project and milestone query families on assignment success", async () => {
    const { queryClient, wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useAssignProjectTicketMilestone(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        projectId: "project-1",
        taskId: "task-1",
        projectMilestoneId: "milestone-1",
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidateSpy.mock.calls.map(
      (call) => (call[0]?.queryKey ?? []) as unknown[],
    );
    expect(keys).toContainEqual(["projects"]);
    expect(keys).toContainEqual(["project", "project-1"]);
    expect(keys).toContainEqual(["project-tickets", "project-1"]);
    expect(keys).toContainEqual(["project-milestones", "project-1"]);
    expect(keys).toContainEqual(["project-tickets"]);
    expect(keys).toContainEqual(["project-milestones"]);
    expect(keys).toContainEqual(["sidebar"]);
  });

  it("does not invalidate anything when the assignment fails", async () => {
    assignMutate.mockRejectedValue(new Error("boom"));
    const { queryClient, wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useAssignProjectTicketMilestone(), {
      wrapper,
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          projectId: "project-1",
          taskId: "task-1",
          projectMilestoneId: null,
        }),
      ).rejects.toThrow("boom");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
