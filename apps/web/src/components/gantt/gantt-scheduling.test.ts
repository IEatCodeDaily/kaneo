import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  matchesTaskQuery,
  partitionTasksBySchedule,
  resolveScheduleRange,
} from "./gantt-scheduling";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

afterEach(cleanup);

type Row = {
  id: string;
  title: string;
  status: string;
  number: number | null;
  startDate: string | null;
  dueDate: string | null;
};

function task(id: string, over: Partial<Row> = {}): Row {
  return {
    id,
    title: `Task ${id}`,
    status: "planned",
    number: 1,
    startDate: null,
    dueDate: null,
    ...over,
  };
}

describe("resolveScheduleRange", () => {
  it("returns null when both dates are missing", () => {
    expect(resolveScheduleRange(task("a"))).toBeNull();
  });

  it("returns null when both dates are unparseable", () => {
    expect(
      resolveScheduleRange(
        task("a", { startDate: "nope", dueDate: "also-no" }),
      ),
    ).toBeNull();
  });

  it("anchors both ends on a single date", () => {
    const range = resolveScheduleRange(task("a", { dueDate: "2026-08-10" }));
    expect(range).not.toBeNull();
    expect(range?.scheduleStart.getTime()).toBe(range?.scheduleEnd.getTime());
  });

  it("normalises inverted dates so start precedes end", () => {
    const range = resolveScheduleRange(
      task("a", { startDate: "2026-08-20", dueDate: "2026-08-10" }),
    );
    expect(range?.scheduleStart.getTime()).toBeLessThan(
      range?.scheduleEnd.getTime() as number,
    );
  });
});

describe("partitionTasksBySchedule", () => {
  it("keeps dateless tasks instead of dropping them (KFL-117)", () => {
    const tasks = [
      task("scheduled", { startDate: "2026-08-01", dueDate: "2026-08-05" }),
      task("dateless"),
      task("due-only", { dueDate: "2026-08-03" }),
      task("bad-dates", { startDate: "not-a-date" }),
    ];

    const { scheduled, unscheduled } = partitionTasksBySchedule(tasks);

    // Nothing may vanish: every input lands in exactly one bucket.
    expect(scheduled.length + unscheduled.length).toBe(tasks.length);
    expect(unscheduled.map((t) => t.id).sort()).toEqual([
      "bad-dates",
      "dateless",
    ]);
    expect(scheduled.map((t) => t.id).sort()).toEqual([
      "due-only",
      "scheduled",
    ]);
  });

  it("orders scheduled tasks by start date", () => {
    const { scheduled } = partitionTasksBySchedule([
      task("late", { startDate: "2026-09-01" }),
      task("early", { startDate: "2026-08-01" }),
      task("mid", { startDate: "2026-08-15" }),
    ]);
    expect(scheduled.map((t) => t.id)).toEqual(["early", "mid", "late"]);
  });

  it("preserves incoming order of unscheduled tasks", () => {
    const { unscheduled } = partitionTasksBySchedule([
      task("c"),
      task("a"),
      task("b"),
    ]);
    expect(unscheduled.map((t) => t.id)).toEqual(["c", "a", "b"]);
  });

  it("attaches a usable range to every scheduled task", () => {
    const { scheduled } = partitionTasksBySchedule([
      task("x", { startDate: "2026-08-01", dueDate: "2026-08-04" }),
    ]);
    expect(scheduled[0].scheduleStart).toBeInstanceOf(Date);
    expect(scheduled[0].scheduleEnd).toBeInstanceOf(Date);
  });

  it("returns an empty unscheduled bucket when everything has dates", () => {
    const { unscheduled } = partitionTasksBySchedule([
      task("a", { dueDate: "2026-08-01" }),
      task("b", { startDate: "2026-08-02" }),
    ]);
    expect(unscheduled).toEqual([]);
  });

  // Negative control: proves these assertions can fail. If the buggy
  // "filter out dateless tasks" behaviour came back, the partition below is
  // exactly what the old code produced — and the KFL-117 expectations reject it.
  it("negative control: the old drop-dateless behaviour fails these expectations", () => {
    const tasks = [
      task("scheduled", { startDate: "2026-08-01" }),
      task("dateless"),
    ];
    const buggy = {
      scheduled: tasks.filter((t) => t.startDate || t.dueDate),
      unscheduled: [] as Row[],
    };
    expect(buggy.scheduled.length + buggy.unscheduled.length).not.toBe(
      tasks.length,
    );
    expect(buggy.unscheduled.map((t) => t.id)).not.toContain("dateless");
    // The real implementation does not behave that way.
    expect(
      partitionTasksBySchedule(tasks).unscheduled.map((t) => t.id),
    ).toContain("dateless");
  });
});

describe("matchesTaskQuery", () => {
  it("matches everything on an empty query", () => {
    expect(matchesTaskQuery(task("a"), "   ", "KAN")).toBe(true);
  });

  it("matches on title, slug-number and status", () => {
    const row = task("a", {
      title: "Ship it",
      status: "in-progress",
      number: 42,
    });
    expect(matchesTaskQuery(row, "ship", "KAN")).toBe(true);
    expect(matchesTaskQuery(row, "kan-42", "KAN")).toBe(true);
    expect(matchesTaskQuery(row, "progress", "KAN")).toBe(true);
    expect(matchesTaskQuery(row, "zzz", "KAN")).toBe(false);
  });

  it("filters unscheduled tasks too, so search stays consistent", () => {
    const { unscheduled } = partitionTasksBySchedule([
      task("a", { title: "Alpha" }),
      task("b", { title: "Beta" }),
    ]);
    const found = unscheduled.filter((t) =>
      matchesTaskQuery(t, "alpha", "KAN"),
    );
    expect(found.map((t) => t.id)).toEqual(["a"]);
  });
});
