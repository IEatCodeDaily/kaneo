import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { BoardWithTasks } from "@/types/board";
import { reconcileTaskDetails } from "./reconcile-task-details";

const board = (versions: Record<string, string>) =>
  ({
    columns: [
      {
        tasks: Object.entries(versions).map(([id, detailVersion]) => ({
          id,
          detailVersion,
        })),
      },
    ],
    plannedTasks: [],
    archivedTasks: [],
  }) as BoardWithTasks;

describe("reconcileTaskDetails", () => {
  it("invalidates only detail records whose thin-payload version changed", () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");

    reconcileTaskDetails(
      client,
      board({ a: "v1", b: "v1" }),
      board({ a: "v2", b: "v1" }),
    );

    expect(invalidate).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["task", "a"] });
  });
});
