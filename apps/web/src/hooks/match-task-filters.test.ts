import { describe, expect, it } from "vitest";
import { matchesTaskFilters } from "./use-task-filters-with-labels-support";

const none = {
  status: null,
  priority: null,
  assignee: null,
  dueDate: null,
  labels: null,
};
const task = {
  status: "in-progress",
  priority: "high",
  userId: "u1",
  dueDate: null,
  labels: [{ id: "l1", name: "Bug", color: "red" }],
};

describe("matchesTaskFilters (shared by board and My Tickets)", () => {
  it("passes everything with no filters", () => {
    expect(matchesTaskFilters(task, none, 1)).toBe(true);
  });
  it("is any-of within a facet and all-of across facets", () => {
    expect(
      matchesTaskFilters(
        task,
        { ...none, status: ["to-do", "in-progress"] },
        1,
      ),
    ).toBe(true);
    expect(
      matchesTaskFilters(
        task,
        { ...none, status: ["in-progress"], priority: ["low"] },
        1,
      ),
    ).toBe(false);
  });
  it("matches assignee, labels and no-due-date", () => {
    expect(matchesTaskFilters(task, { ...none, assignee: ["u2"] }, 1)).toBe(
      false,
    );
    expect(matchesTaskFilters(task, { ...none, labels: ["l1"] }, 1)).toBe(true);
    expect(
      matchesTaskFilters(task, { ...none, dueDate: ["noDueDate"] }, 1),
    ).toBe(true);
  });
});
