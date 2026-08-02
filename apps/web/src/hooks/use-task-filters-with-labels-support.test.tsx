import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  groupTasks,
  useTaskFiltersWithLabelsSupport,
} from "./use-task-filters-with-labels-support";

describe("groupTasks", () => {
  it("uses the assignee display name instead of the user id", () => {
    const task = {
      id: "assigned",
      title: "Assigned task",
      status: "to-do",
      priority: null,
      userId: "usr_raw_id",
      assigneeName: "Raisal Wardana",
      labels: [],
    };

    expect(groupTasks([task as never], "assignee")[0]).toMatchObject({
      key: "Raisal Wardana",
      label: "Raisal Wardana",
    });
  });
});

describe("useTaskFiltersWithLabelsSupport", () => {
  const storageKey = "kaneo:board-filters:board-1";

  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("filters board tasks by case-insensitive title, description, and bare or hash-prefixed task number", () => {
    const board = {
      id: "board-1",
      columns: [
        {
          id: "todo",
          tasks: [
            {
              id: "title-match",
              title: "Ship board search",
              description: null,
              number: 1,
              status: "todo",
              priority: null,
              userId: null,
              labels: [],
            },
            {
              id: "description-match",
              title: "Unrelated",
              description: "Find this implementation detail",
              number: 2,
              status: "todo",
              priority: null,
              userId: null,
              labels: [],
            },
            {
              id: "number-match",
              title: "Unrelated too",
              description: null,
              number: 42,
              status: "todo",
              priority: null,
              userId: null,
              labels: [],
            },
          ],
        },
      ],
    };

    const { result, rerender } = renderHook(
      ({ query }) =>
        useTaskFiltersWithLabelsSupport(board as never, "board-1", query),
      { initialProps: { query: "SHIP" } },
    );

    expect(
      result.current.filteredBoard?.columns[0]?.tasks.map((task) => task.id),
    ).toEqual(["title-match"]);

    rerender({ query: "implementation" });
    expect(
      result.current.filteredBoard?.columns[0]?.tasks.map((task) => task.id),
    ).toEqual(["description-match"]);

    rerender({ query: "#42" });
    expect(
      result.current.filteredBoard?.columns[0]?.tasks.map((task) => task.id),
    ).toEqual(["number-match"]);

    rerender({ query: "42" });
    expect(
      result.current.filteredBoard?.columns[0]?.tasks.map((task) => task.id),
    ).toEqual(["number-match"]);
  });

  it("restores persisted label filters from storage and matches tasks from board data", async () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ labels: ["label-bug"] }),
    );

    const board = {
      id: "board-1",
      name: "Board",
      slug: "PROJ",
      icon: null,
      description: null,
      isPublic: false,
      createdAt: "2026-04-16T00:00:00.000Z",
      updatedAt: "2026-04-16T00:00:00.000Z",
      organizationId: "organization-1",
      columns: [
        {
          id: "todo",
          slug: "todo",
          name: "Todo",
          icon: null,
          isFinal: false,
          tasks: [
            {
              id: "task-1",
              title: "Bug task",
              number: 1,
              description: null,
              status: "todo",
              priority: null,
              startDate: null,
              dueDate: null,
              position: 0,
              createdAt: "2026-04-16T00:00:00.000Z",
              updatedAt: "2026-04-16T00:00:00.000Z",
              userId: null,
              assigneeId: null,
              assigneeName: null,
              assigneeImage: null,
              boardId: "board-1",
              labels: [
                {
                  id: "label-bug",
                  name: "bug",
                  color: "red",
                },
              ],
              externalLinks: [],
            },
            {
              id: "task-2",
              title: "Other task",
              number: 2,
              description: null,
              status: "todo",
              priority: null,
              startDate: null,
              dueDate: null,
              position: 1,
              createdAt: "2026-04-16T00:00:00.000Z",
              updatedAt: "2026-04-16T00:00:00.000Z",
              userId: null,
              assigneeId: null,
              assigneeName: null,
              assigneeImage: null,
              boardId: "board-1",
              labels: [],
              externalLinks: [],
            },
          ],
        },
      ],
      plannedTasks: [],
      archivedTasks: [],
    };

    const { result } = renderHook(() =>
      useTaskFiltersWithLabelsSupport(board, "board-1"),
    );

    await waitFor(() => {
      expect(result.current.filters.labels).toEqual(["label-bug"]);
    });

    expect(result.current.filteredBoard?.columns[0]?.tasks).toHaveLength(1);
    expect(result.current.filteredBoard?.columns[0]?.tasks[0]?.id).toBe(
      "task-1",
    );
  });
});
