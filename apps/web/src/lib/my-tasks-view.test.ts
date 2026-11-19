import { describe, expect, it } from "vitest";
import { isImportantTask } from "./my-tasks-view";

const base = {
  flagged: false,
  priority: "medium" as string | null,
  dueDate: null as string | null,
  isFinal: false,
};

describe("isImportantTask", () => {
  it("flags urgent and high priority", () => {
    expect(isImportantTask({ ...base, priority: "urgent" })).toBe(true);
    expect(isImportantTask({ ...base, priority: "high" })).toBe(true);
    expect(isImportantTask({ ...base, priority: "medium" })).toBe(false);
    expect(isImportantTask({ ...base, priority: null })).toBe(false);
  });

  it("flags flagged tasks regardless of priority", () => {
    expect(isImportantTask({ ...base, flagged: true })).toBe(true);
    expect(isImportantTask({ ...base, flagged: true, priority: "low" })).toBe(
      true,
    );
  });

  it("flags overdue and near-due tickets, but not far ones or final ones", () => {
    const soon = new Date(Date.now() + 2 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const far = new Date(Date.now() + 30 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const past = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    expect(isImportantTask({ ...base, dueDate: soon })).toBe(true);
    expect(isImportantTask({ ...base, dueDate: past })).toBe(true);
    expect(isImportantTask({ ...base, dueDate: far })).toBe(false);
    expect(isImportantTask({ ...base, dueDate: soon, isFinal: true })).toBe(
      false,
    );
  });
});
