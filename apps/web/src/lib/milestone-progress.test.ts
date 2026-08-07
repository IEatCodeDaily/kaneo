import { describe, expect, it } from "vitest";
import {
  getMilestoneProgress,
  getMilestoneTasks,
  isCompletedStatus,
} from "./milestone-progress";

const tasks = [
  {
    id: "t1",
    milestoneId: "m-1",
    status: "to-do",
    startDate: "2026-03-02T00:00:00.000Z",
    dueDate: "2026-03-10T00:00:00.000Z",
  },
  {
    id: "t2",
    milestoneId: "m-1",
    status: "done",
    startDate: "2026-02-20T00:00:00.000Z",
    dueDate: "2026-03-05T00:00:00.000Z",
  },
  {
    id: "t3",
    milestoneId: "m-1",
    status: "in-progress",
    startDate: null,
    dueDate: "2026-04-01T00:00:00.000Z",
  },
  {
    id: "t4",
    milestoneId: "m-2",
    status: "done",
    startDate: "2025-01-01T00:00:00.000Z",
    dueDate: "2025-01-02T00:00:00.000Z",
  },
];

describe("getMilestoneTasks", () => {
  it("keeps only the tasks linked to the milestone", () => {
    expect(getMilestoneTasks(tasks, "m-1").map((task) => task.id)).toEqual([
      "t1",
      "t2",
      "t3",
    ]);
  });
});

describe("isCompletedStatus", () => {
  it("treats terminal column names as complete regardless of casing", () => {
    expect(isCompletedStatus("Done")).toBe(true);
    expect(isCompletedStatus("completed")).toBe(true);
    expect(isCompletedStatus("in-progress")).toBe(false);
    expect(isCompletedStatus(null)).toBe(false);
  });
});

describe("getMilestoneProgress", () => {
  it("infers the date range from the earliest and latest related task dates", () => {
    const progress = getMilestoneProgress(tasks, "m-1");

    expect(progress.startDate?.toISOString()).toBe("2026-02-20T00:00:00.000Z");
    expect(progress.endDate?.toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });

  it("infers percent complete from the related tasks' statuses", () => {
    const progress = getMilestoneProgress(tasks, "m-1");

    expect(progress.taskCount).toBe(3);
    expect(progress.completedCount).toBe(1);
    // 1 of 3 done -> 33%
    expect(progress.percentComplete).toBe(33);
  });

  it("reports 100 percent when every related task is done", () => {
    expect(getMilestoneProgress(tasks, "m-2").percentComplete).toBe(100);
  });

  it("returns an empty, zero-percent result when no tasks reference the milestone", () => {
    expect(getMilestoneProgress(tasks, "m-unknown")).toEqual({
      taskCount: 0,
      completedCount: 0,
      percentComplete: 0,
      startDate: null,
      endDate: null,
    });
  });

  it("leaves the range null when related tasks carry no dates", () => {
    const progress = getMilestoneProgress(
      [{ id: "t9", milestoneId: "m-3", status: "done" }],
      "m-3",
    );

    expect(progress.percentComplete).toBe(100);
    expect(progress.startDate).toBeNull();
    expect(progress.endDate).toBeNull();
  });
});
