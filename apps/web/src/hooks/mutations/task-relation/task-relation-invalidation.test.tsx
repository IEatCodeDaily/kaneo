import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression: adding a ticket as a sub-ticket updated the task drawer but the
 * board view kept showing the card un-nested until a manual reload.
 *
 * The drawer reads ["task-relations", id]; the board and list views read the
 * parent off the TASK rows (`task.parentTask`, joined in getTasks) and the
 * timeline reads ["board-task-relations"]. The mutation only invalidated the
 * drawer's key, so every other surface stayed stale.
 */

const createFetcher = vi.fn(async () => ({ id: "relation-1" }));
const deleteFetcher = vi.fn(async () => ({ success: true }));

vi.mock("@/fetchers/task-relation/create-task-relation", () => ({
  default: (...args: unknown[]) => createFetcher(...(args as [])),
}));
vi.mock("@/fetchers/task-relation/delete-task-relation", () => ({
  default: (...args: unknown[]) => deleteFetcher(...(args as [])),
}));

const { default: useCreateTaskRelation } = await import(
  "@/hooks/mutations/task-relation/use-create-task-relation"
);
const { default: useDeleteTaskRelation } = await import(
  "@/hooks/mutations/task-relation/use-delete-task-relation"
);

let client: QueryClient;
let invalidated: unknown[][];

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  invalidated = [];
  vi.spyOn(client, "invalidateQueries").mockImplementation((filters) => {
    invalidated.push((filters?.queryKey ?? []) as unknown[]);
    return Promise.resolve();
  });
});

/** True when some invalidation call targeted this key prefix. */
function invalidatedKey(key: string) {
  return invalidated.some((queryKey) => queryKey[0] === key);
}

describe("useCreateTaskRelation cache invalidation", () => {
  it("invalidates the board/list task rows, not just the drawer", async () => {
    const { result } = renderHook(() => useCreateTaskRelation(), { wrapper });

    result.current.mutate({
      sourceTaskId: "parent-1",
      targetTaskId: "child-1",
      relationType: "subtask",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // The drawer's own key (both endpoints of the relation).
    expect(
      invalidated.filter((key) => key[0] === "task-relations").map((k) => k[1]),
    ).toEqual(expect.arrayContaining(["parent-1", "child-1"]));

    // The surfaces that were stale before the fix.
    expect(invalidatedKey("tasks")).toBe(true);
    expect(invalidatedKey("board-task-relations")).toBe(true);
    expect(invalidatedKey("boards")).toBe(true);
  });
});

describe("useDeleteTaskRelation cache invalidation", () => {
  it("clears the parent badge on the board/list rows when unlinking", async () => {
    const { result } = renderHook(() => useDeleteTaskRelation("child-1"), {
      wrapper,
    });

    result.current.mutate({ id: "relation-1" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidatedKey("task-relations")).toBe(true);
    expect(invalidatedKey("tasks")).toBe(true);
    expect(invalidatedKey("board-task-relations")).toBe(true);
    expect(invalidatedKey("boards")).toBe(true);
  });
});
