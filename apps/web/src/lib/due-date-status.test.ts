import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getDueDateOutcome,
  getDueDateStatus,
  isCompletedStatus,
} from "./due-date-status";

/**
 * #178: a ticket in Done still rendered the destructive red "overdue" badge,
 * shouting about a deadline that no longer matters. Completed tickets must be
 * styled quietly and carry an Early / On time / Late remark instead.
 */
const NOW = new Date("2026-08-02T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function daysFromNow(days: number) {
  return new Date(NOW.getTime() + days * 86_400_000).toISOString();
}

describe("isCompletedStatus", () => {
  it("treats done and archived as finished", () => {
    expect(isCompletedStatus("done")).toBe(true);
    expect(isCompletedStatus("archived")).toBe(true);
  });

  // NEGATIVE CONTROL: in-flight statuses must not be treated as finished, or
  // every badge would go quiet.
  it("treats live statuses as unfinished", () => {
    for (const status of [
      "to-do",
      "in-progress",
      "in-review",
      "planned",
      null,
      undefined,
    ]) {
      expect(isCompletedStatus(status)).toBe(false);
    }
  });
});

describe("getDueDateStatus", () => {
  it("reports overdue for a past date on a live ticket", () => {
    expect(getDueDateStatus(daysFromNow(-5), "in-progress")).toBe("overdue");
  });

  /** The regression: this used to return "overdue" and render red. */
  it.each(["done", "archived"])(
    "reports completed for a past date on a %s ticket",
    (status) => {
      expect(getDueDateStatus(daysFromNow(-5), status)).toBe("completed");
    },
  );

  it("reports completed even when the due date is still in the future", () => {
    expect(getDueDateStatus(daysFromNow(10), "done")).toBe("completed");
  });

  it("keeps the existing buckets for live tickets", () => {
    expect(getDueDateStatus(daysFromNow(1), "to-do")).toBe("due-soon");
    expect(getDueDateStatus(daysFromNow(30), "to-do")).toBe("far-future");
    expect(getDueDateStatus(null, "to-do")).toBe("no-due-date");
  });

  // Callers that don't pass a status must behave exactly as before.
  it("is backwards compatible when no status is given", () => {
    expect(getDueDateStatus(daysFromNow(-5))).toBe("overdue");
    expect(getDueDateStatus(daysFromNow(30))).toBe("far-future");
  });
});

describe("getDueDateOutcome", () => {
  it("is early when finished well before the due date", () => {
    expect(getDueDateOutcome(daysFromNow(10), NOW)).toBe("early");
  });

  it("is late when finished well after the due date", () => {
    expect(getDueDateOutcome(daysFromNow(-10), NOW)).toBe("late");
  });

  /** The ticket defines on-time as within 24 hours of the due date. */
  it("is on time within a day either side", () => {
    expect(getDueDateOutcome(daysFromNow(0), NOW)).toBe("on-time");
    expect(getDueDateOutcome(daysFromNow(0.5), NOW)).toBe("on-time");
    expect(getDueDateOutcome(daysFromNow(-0.5), NOW)).toBe("on-time");
  });

  it("crosses from on-time to late just past the 24-hour window", () => {
    expect(getDueDateOutcome(daysFromNow(-1), NOW)).toBe("on-time");
    expect(getDueDateOutcome(daysFromNow(-1.01), NOW)).toBe("late");
  });

  // NEGATIVE CONTROL: no due date means no remark to make.
  it("returns null without a due date", () => {
    expect(getDueDateOutcome(null, NOW)).toBeNull();
  });

  it("returns null for an unparseable date", () => {
    expect(getDueDateOutcome("not-a-date", NOW)).toBeNull();
  });

  it("falls back to now when no completion time is known", () => {
    // Due 10 days ago and only observed as done now: late.
    expect(getDueDateOutcome(daysFromNow(-10))).toBe("late");
  });
});
