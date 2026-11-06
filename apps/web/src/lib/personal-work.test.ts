import { describe, expect, it } from "vitest";
import { groupMyTasks, type MyTaskViewItem } from "./my-tasks-view";

const task = (id: string, dueDate: string | null) =>
  ({ id, dueDate, labels: [] }) as unknown as MyTaskViewItem;
describe("personal work due buckets", () => {
  it("separates today, next seven days, later and undated", () => {
    const now = new Date(2026, 10, 4, 12);
    const tasks = [
      task("old", "2026-11-03"),
      task("today", "2026-11-04"),
      task("soon", "2026-11-11"),
      task("later", "2026-11-12"),
      task("none", null),
    ];
    expect(groupMyTasks(tasks, "dueDate", now).map(([key]) => key)).toEqual([
      "Overdue",
      "Today",
      "Next 7 days",
      "Later",
      "No due date",
    ]);
  });
  it("rolls today into overdue at local midnight without mutating tasks", () => {
    const tasks = [task("one", "2026-11-04")];
    expect(groupMyTasks(tasks, "dueDate", new Date(2026, 10, 5))[0][0]).toBe(
      "Overdue",
    );
    expect(tasks[0].dueDate).toBe("2026-11-04");
  });
});
