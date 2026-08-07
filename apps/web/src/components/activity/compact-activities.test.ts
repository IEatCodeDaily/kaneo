import { describe, expect, it } from "vitest";
import {
  compactActivities,
  isCollapsedRun,
  isNoOpRun,
} from "./compact-activities";

/**
 * #116: "if user move a task from todo to in progress to todo -> in review ->
 * done in a short period (within a minute), keep only the total delta ... or
 * just compact all of that into a single entry ... with a dropdown showing all
 * the actions."
 */
const BASE = new Date("2026-08-02T10:00:00.000Z").getTime();

function status(
  seconds: number,
  oldStatus: string,
  newStatus: string,
  userId = "u1",
) {
  return {
    id: `s-${seconds}-${newStatus}`,
    type: "status_changed",
    userId,
    createdAt: new Date(BASE + seconds * 1000).toISOString(),
    eventData: { oldStatus, newStatus },
  };
}

function comment(seconds: number, userId = "u1") {
  return {
    id: `c-${seconds}`,
    type: "comment",
    userId,
    createdAt: new Date(BASE + seconds * 1000).toISOString(),
    eventData: null,
  };
}

describe("#116 activity compaction", () => {
  it("collapses the reported sequence into one entry", () => {
    // to-do -> in progress -> to-do -> in review -> done, all within a minute.
    const groups = compactActivities([
      status(0, "to-do", "in-progress"),
      status(10, "in-progress", "to-do"),
      status(20, "to-do", "in-review"),
      status(30, "in-review", "done"),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(4);
    // The net delta is what the user cares about.
    expect(groups[0].fromStatus).toBe("to-do");
    expect(groups[0].toStatus).toBe("done");
  });

  it("keeps every original entry so the dropdown can show them", () => {
    const groups = compactActivities([
      status(0, "to-do", "in-progress"),
      status(5, "in-progress", "done"),
    ]);

    expect(isCollapsedRun(groups[0])).toBe(true);
    expect(groups[0].entries.map((e) => e.id)).toEqual([
      "s-0-in-progress",
      "s-5-done",
    ]);
  });

  it("does not collapse changes further apart than the window", () => {
    const groups = compactActivities([
      status(0, "to-do", "in-progress"),
      status(120, "in-progress", "done"),
    ]);

    expect(groups).toHaveLength(2);
  });

  /**
   * The gap is measured between ADJACENT entries, so a slow drip never folds:
   * 0s -> 50s -> 100s is 100s end to end but each step is inside the window.
   * That IS one continuous run and should collapse.
   */
  it("collapses a continuous run even when the ends are far apart", () => {
    const groups = compactActivities([
      status(0, "to-do", "in-progress"),
      status(50, "in-progress", "in-review"),
      status(100, "in-review", "done"),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].fromStatus).toBe("to-do");
    expect(groups[0].toStatus).toBe("done");
  });

  /**
   * Two people moving a ticket is two distinct facts, even inside the window.
   * The control case below is identical except for the user, and DOES fold —
   * so this test fails if the same-user check is removed.
   */
  it("never collapses changes made by different people", () => {
    const differentUsers = compactActivities([
      status(0, "to-do", "in-progress", "u1"),
      status(5, "in-progress", "done", "u2"),
    ]);
    const sameUser = compactActivities([
      status(0, "to-do", "in-progress", "u1"),
      status(5, "in-progress", "done", "u1"),
    ]);

    expect(differentUsers).toHaveLength(2);
    // Control: the only difference is the actor, and that one folds.
    expect(sameUser).toHaveLength(1);
  });

  // Losing a comment inside a fold would be far worse than a long feed.
  it("never folds comments or other event types", () => {
    const groups = compactActivities([
      status(0, "to-do", "in-progress"),
      comment(5),
      status(10, "in-progress", "done"),
    ]);

    expect(groups).toHaveLength(3);
    expect(groups.map((g) => g.head.type)).toEqual([
      "status_changed",
      "comment",
      "status_changed",
    ]);
  });

  it("reports a run that ended where it started as a no-op", () => {
    const groups = compactActivities([
      status(0, "to-do", "in-progress"),
      status(10, "in-progress", "to-do"),
    ]);

    expect(isNoOpRun(groups[0])).toBe(true);
  });

  it("does not mark a genuine move as a no-op", () => {
    const groups = compactActivities([
      status(0, "to-do", "in-progress"),
      status(10, "in-progress", "done"),
    ]);

    expect(isNoOpRun(groups[0])).toBe(false);
  });

  it("leaves a single change untouched", () => {
    const groups = compactActivities([status(0, "to-do", "done")]);

    expect(groups).toHaveLength(1);
    expect(isCollapsedRun(groups[0])).toBe(false);
  });

  // Feeds render newest-first; the delta must still read correctly.
  it("computes the delta correctly for a newest-first feed", () => {
    const groups = compactActivities([
      status(30, "in-review", "done"),
      status(20, "to-do", "in-review"),
      status(0, "to-do", "in-progress"),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].fromStatus).toBe("to-do");
    expect(groups[0].toStatus).toBe("done");
  });

  it("handles an empty feed", () => {
    expect(compactActivities([])).toEqual([]);
  });
});
