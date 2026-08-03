import { describe, expect, it } from "vitest";
import type Task from "@/types/task";
import {
  countTreeTasks,
  groupSameBucketSubtasks,
  visibleGroupedTasks,
} from "./group-subtasks";

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

const ids = (nodes: ReturnType<typeof groupSameBucketSubtasks>): unknown[] =>
  nodes.map((node) => [node.task.id, ids(node.children)]);

describe("groupSameBucketSubtasks", () => {
  it("builds nested chains through the backend-supported board depth", () => {
    const groups = groupSameBucketSubtasks([
      task("root"),
      task("sibling", "root"),
      task("child", "root"),
      task("grandchild", "child"),
      task("great-grandchild", "grandchild"),
    ]);

    expect(ids(groups)).toEqual([
      [
        "root",
        [
          ["sibling", []],
          ["child", [["grandchild", [["great-grandchild", []]]]]],
        ],
      ],
    ]);
    expect(countTreeTasks(groups)).toBe(5);
  });

  it("keeps a child standalone when its immediate parent is outside the bucket", () => {
    const groups = groupSameBucketSubtasks([
      task("child", "parent-elsewhere"),
      task("grandchild", "child"),
    ]);

    expect(ids(groups)).toEqual([["child", [["grandchild", []]]]]);
  });

  it("preserves root and sibling DnD order without losing identities", () => {
    const tasks = [
      task("first"),
      task("child-2", "last"),
      task("last"),
      task("child-1", "last"),
    ];
    const groups = groupSameBucketSubtasks(tasks);

    expect(groups.map((node) => node.task.id)).toEqual(["first", "last"]);
    expect(groups[1].children.map((node) => node.task.id)).toEqual([
      "child-2",
      "child-1",
    ]);
    expect(countTreeTasks(groups)).toBe(tasks.length);
  });

  it("keeps malformed cyclic records visible instead of dropping IDs", () => {
    const groups = groupSameBucketSubtasks([
      task("one", "two"),
      task("two", "one"),
    ]);

    expect(groups.map((node) => node.task.id)).toEqual(["one", "two"]);
    expect(countTreeTasks(groups)).toBe(2);
  });
});

describe("visibleGroupedTasks", () => {
  it("collapses descendants at any nested parent independently", () => {
    const groups = groupSameBucketSubtasks([
      task("root"),
      task("child", "root"),
      task("grandchild", "child"),
      task("other"),
    ]);

    expect(
      visibleGroupedTasks(groups, new Set(["child"])).map((entry) => entry.id),
    ).toEqual(["root", "child", "other"]);
    expect(
      visibleGroupedTasks(groups, new Set(["root"])).map((entry) => entry.id),
    ).toEqual(["root", "other"]);
    expect(
      visibleGroupedTasks(groups, new Set()).map((entry) => entry.id),
    ).toEqual(["root", "child", "grandchild", "other"]);
  });
});
