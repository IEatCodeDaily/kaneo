import { describe, expect, it } from "vitest";
import type { BoardWithTasks } from "@/types/board";
import type Task from "@/types/task";
import { buildListGroups, taskStatus } from "./list-grouping";

const task = (
  id: string,
  status: string,
  milestone?: [string, string],
): Task => ({
  id,
  title: id,
  number: 1,
  status,
  priority: null,
  startDate: null,
  dueDate: null,
  position: 0,
  createdAt: "",
  userId: null,
  assigneeId: null,
  assigneeName: null,
  boardId: "b",
  milestoneId: milestone?.[0] ?? null,
  milestoneName: milestone?.[1] ?? null,
});

const board = {
  id: "b",
  slug: "B",
  columns: [
    {
      id: "todo",
      name: "To Do",
      isFinal: false,
      icon: null,
      tasks: [task("a", "todo", ["m1", "Launch"]), task("b", "todo")],
    },
    {
      id: "done",
      name: "Done",
      isFinal: true,
      icon: null,
      tasks: [task("c", "done", ["m1", "Launch"])],
    },
  ],
} as BoardWithTasks;

describe("list grouping", () => {
  it("defaults to one flat group rather than forced status sections", () => {
    const groups = buildListGroups(board, "none");
    expect(groups).toHaveLength(1);
    expect(groups[0]?.tasks.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("groups by status in board column order", () => {
    expect(
      buildListGroups(board, "status").map((group) => [
        group.label,
        group.tasks.length,
      ]),
    ).toEqual([
      ["To Do", 2],
      ["Done", 1],
    ]);
  });

  it("groups by milestone and keeps no-milestone last", () => {
    // the unset bucket is now an i18n key resolved by the caller's `t`, so it
    // reads "No milestone" instead of rendering as an empty heading
    const groups = buildListGroups(board, "milestone", (key) => key);
    expect(
      groups.map((group) => [group.label, group.tasks.map((item) => item.id)]),
    ).toEqual([
      ["Launch", ["a", "c"]],
      ["tasks:gantt.noMilestone", ["b"]],
    ]);
  });

  it("offers the same vocabulary the board does", () => {
    /*
      List used to accept only none/status/milestone. Board and List now share
      one vocabulary, so every board grouping must bucket here too rather than
      silently collapsing to a single group.
    */
    for (const groupBy of [
      "assignee",
      "priority",
      "label",
      "dueDate",
    ] as const) {
      const groups = buildListGroups(board, groupBy, (key) => key);
      const total = groups.reduce((sum, group) => sum + group.tasks.length, 0);
      expect(total, `${groupBy} must keep every task`).toBe(3);
      expect(groups.length, `${groupBy} must produce groups`).toBeGreaterThan(
        0,
      );
    }
  });

  it("groups by assignee with an unassigned bucket", () => {
    const groups = buildListGroups(board, "assignee", (key) => key);
    // every task in the fixture is unassigned, so one bucket carries them all
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe("tasks:assignee.unassigned");
    expect(groups[0]?.tasks.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("resolves status independently of grouping", () => {
    expect(taskStatus(board, board.columns[1].tasks[0]).name).toBe("Done");
  });
});
