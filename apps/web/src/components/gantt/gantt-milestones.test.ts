import { describe, expect, it } from "vitest";
import {
  buildGanttMilestones,
  milestoneMatchesQuery,
  milestoneTimelineDates,
} from "./gantt-milestones";

const milestones = [
  {
    id: "m-explicit",
    boardId: "board-1",
    name: "Launch",
    description: null,
    status: "active",
    dueDate: "2026-06-30T12:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "m-inferred",
    boardId: "board-1",
    name: "Hardening",
    description: null,
    status: "planned",
    dueDate: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

const tasks = [
  {
    id: "task-1",
    milestoneId: "m-explicit",
    status: "done",
    startDate: "2026-06-01T00:00:00.000Z",
    dueDate: "2026-06-10T00:00:00.000Z",
  },
  {
    id: "task-2",
    milestoneId: "m-explicit",
    status: "in-progress",
    startDate: "2026-06-05T00:00:00.000Z",
    dueDate: "2026-06-20T00:00:00.000Z",
  },
  {
    id: "task-3",
    milestoneId: "m-inferred",
    status: "done",
    startDate: "2026-07-02T00:00:00.000Z",
    dueDate: "2026-07-12T00:00:00.000Z",
  },
];

describe("buildGanttMilestones", () => {
  it("uses explicit due dates for the target while retaining inferred task span and progress", () => {
    const launch = buildGanttMilestones(milestones, tasks)[0];

    expect(launch).toMatchObject({
      id: "m-explicit",
      taskIds: ["task-1", "task-2"],
      taskCount: 2,
      completedCount: 1,
      percentComplete: 50,
      targetIsExplicit: true,
    });
    expect(launch.spanStart?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(launch.spanEnd?.toISOString()).toBe("2026-06-20T00:00:00.000Z");
    expect(launch.targetDate?.toISOString()).toBe("2026-06-30T00:00:00.000Z");
  });

  it("falls back to the related-task range end when no explicit due date exists", () => {
    const inferred = buildGanttMilestones(milestones, tasks)[1];

    expect(inferred.targetIsExplicit).toBe(false);
    expect(inferred.targetDate?.toISOString()).toBe("2026-07-12T00:00:00.000Z");
    expect(inferred.percentComplete).toBe(100);
  });

  it("keeps a due-date-only milestone visible and includes it in timeline bounds", () => {
    const [milestone] = buildGanttMilestones([milestones[0]], []);

    expect(milestone.spanStart).toBeNull();
    expect(milestone.taskCount).toBe(0);
    expect(
      milestoneTimelineDates([milestone]).map((date) => date.toISOString()),
    ).toEqual(["2026-06-30T00:00:00.000Z"]);
  });

  it("matches milestones by their own name or a related matching task", () => {
    const [launch, hardening] = buildGanttMilestones(milestones, tasks);

    expect(milestoneMatchesQuery(launch, "launch", new Set())).toBe(true);
    expect(milestoneMatchesQuery(launch, "backend", new Set(["task-2"]))).toBe(
      true,
    );
    expect(
      milestoneMatchesQuery(hardening, "backend", new Set(["task-2"])),
    ).toBe(false);
  });
});
