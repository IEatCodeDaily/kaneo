import { describe, expect, it } from "vitest";
import type Task from "@/types/task";
import { groupSameBucketSubtasks, visibleGroupedTasks } from "./group-subtasks";

const task = (id: string, parentId?: string): Task => ({
  id,
  title: id,
  number: 1,
  description: null,
  status: "to-do",
  priority: null,
  startDate: null,
  dueDate: null,
  position: 0,
  createdAt: "2026-07-30T00:00:00Z",
  userId: null,
  assigneeId: null,
  assigneeName: null,
  boardId: "board-1",
  parentTask: parentId
    ? { id: parentId, number: 1, title: parentId, status: "to-do" }
    : null,
});

describe("groupSameBucketSubtasks", () => {
  it("groups children beneath a parent in the same bucket", () => {
    const groups = groupSameBucketSubtasks([
      task("parent"),
      task("child-1", "parent"),
      task("other"),
      task("child-2", "parent"),
    ]);

    expect(groups.map((group) => group.parent.id)).toEqual(["parent", "other"]);
    expect(groups[0].children.map((child) => child.id)).toEqual([
      "child-1",
      "child-2",
    ]);
  });

  it("leaves a child standalone when its parent is in another bucket", () => {
    const groups = groupSameBucketSubtasks([task("child", "parent-elsewhere")]);

    expect(groups).toHaveLength(1);
    expect(groups[0].parent.id).toBe("child");
    expect(groups[0].children).toEqual([]);
  });

  it("preserves top-level order", () => {
    const groups = groupSameBucketSubtasks([
      task("first"),
      task("child", "last"),
      task("last"),
    ]);

    expect(groups.map((group) => group.parent.id)).toEqual(["first", "last"]);
  });
});

describe("visibleGroupedTasks", () => {
  it("hides children only for collapsed parents", () => {
    const groups = groupSameBucketSubtasks([
      task("parent"),
      task("child", "parent"),
      task("other"),
    ]);

    expect(
      visibleGroupedTasks(groups, new Set(["parent"])).map((entry) => entry.id),
    ).toEqual(["parent", "other"]);
    expect(
      visibleGroupedTasks(groups, new Set()).map((entry) => entry.id),
    ).toEqual(["parent", "child", "other"]);
  });
});
