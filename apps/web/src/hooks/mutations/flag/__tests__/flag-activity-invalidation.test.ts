import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * #107 root cause regression.
 *
 * "flag history only show up after flag is unflagged" — the API wrote the
 * flag_raised activity entry immediately, but useCreateTaskFlag invalidated
 * only ["task-flags"]. useResolveTaskFlag invalidated ["activities"] too, so
 * the raised entry only appeared once the flag was resolved and the feed
 * happened to refetch.
 */

const invalidateQueries = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries }),
  useMutation: (options: {
    onSuccess?: (data: unknown, variables: unknown) => void;
  }) => ({
    mutate: (variables: unknown) => options.onSuccess?.({}, variables),
  }),
}));

vi.mock("@/fetchers/flag/create-task-flag", () => ({ default: vi.fn() }));
vi.mock("@/fetchers/flag/resolve-task-flag", () => ({ default: vi.fn() }));

import useCreateTaskFlag from "@/hooks/mutations/flag/use-create-task-flag";
import useResolveTaskFlag from "@/hooks/mutations/flag/use-resolve-task-flag";

function invalidatedKeys() {
  return invalidateQueries.mock.calls.map(
    (call) => (call[0] as { queryKey: unknown[] }).queryKey,
  );
}

describe("flag mutations refresh the activity feed (#107)", () => {
  it("invalidates activities when a flag is RAISED", () => {
    invalidateQueries.mockReset();
    const { result } = renderHook(() => useCreateTaskFlag());

    result.current.mutate({
      taskId: "task-1",
      flagTypeId: "type-1",
      targetUserId: "user-b",
      targetTeamId: null,
      note: null,
    });

    expect(invalidatedKeys()).toContainEqual(["activities", "task-1"]);
    expect(invalidatedKeys()).toContainEqual(["task-flags", "task-1"]);
  });

  it("still invalidates activities when a flag is RESOLVED", () => {
    invalidateQueries.mockReset();
    const { result } = renderHook(() => useResolveTaskFlag());

    result.current.mutate({ flagId: "flag-1", taskId: "task-1" });

    expect(invalidatedKeys()).toContainEqual(["activities", "task-1"]);
  });
});
