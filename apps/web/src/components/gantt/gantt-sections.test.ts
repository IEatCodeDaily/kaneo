import { describe, expect, it } from "vitest";
import type { GanttMilestone } from "./gantt-milestones";
import {
  buildGanttSections,
  type GroupableRow,
  resolveRowMilestoneId,
  sortMilestonesForSections,
  visibleSectionRows,
} from "./gantt-sections";

const milestone = (
  id: string,
  name: string,
  targetDate: Date | null,
): GanttMilestone => ({
  id,
  name,
  status: "planned",
  taskIds: [],
  taskCount: 0,
  completedCount: 0,
  percentComplete: 0,
  spanStart: null,
  spanEnd: null,
  targetDate,
  targetIsExplicit: targetDate !== null,
});

const row = (
  id: string,
  milestoneId: string | null = null,
  depth = 0,
  parentId: string | null = null,
): GroupableRow => ({ id, milestoneId, depth, parentId });

const ids = (rows: GroupableRow[]) => rows.map((r) => r.id);

describe("resolveRowMilestoneId", () => {
  it("keeps a row's own milestone", () => {
    const resolved = resolveRowMilestoneId([row("a", "m1")]);
    expect(resolved.get("a")).toBe("m1");
  });

  it("inherits the parent's milestone when the child has none", () => {
    const resolved = resolveRowMilestoneId([
      row("parent", "m1"),
      row("child", null, 1, "parent"),
    ]);
    expect(resolved.get("child")).toBe("m1");
  });

  it("inherits down a 3-level chain", () => {
    const resolved = resolveRowMilestoneId([
      row("a", "m1"),
      row("b", null, 1, "a"),
      row("c", null, 2, "b"),
    ]);
    expect(resolved.get("c")).toBe("m1");
  });

  it("a child's own milestone wins over the parent's", () => {
    const resolved = resolveRowMilestoneId([
      row("parent", "m1"),
      row("child", "m2", 1, "parent"),
    ]);
    expect(resolved.get("child")).toBe("m2");
  });

  it("resolves to null when nothing in the chain has a milestone", () => {
    const resolved = resolveRowMilestoneId([row("a"), row("b", null, 1, "a")]);
    expect(resolved.get("b")).toBeNull();
  });

  it("terminates on a cyclic parent chain", () => {
    // Corrupt data must not hang the view.
    const resolved = resolveRowMilestoneId([
      { id: "a", milestoneId: null, depth: 1, parentId: "b" },
      { id: "b", milestoneId: null, depth: 1, parentId: "a" },
    ]);
    expect(resolved.get("a")).toBeNull();
    expect(resolved.get("b")).toBeNull();
  });
});

describe("sortMilestonesForSections", () => {
  it("orders by target date, undated last", () => {
    const sorted = sortMilestonesForSections([
      milestone("c", "C", null),
      milestone("b", "B", new Date("2026-03-01")),
      milestone("a", "A", new Date("2026-01-01")),
    ]);
    expect(sorted.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("breaks ties by name so order is stable", () => {
    const same = new Date("2026-01-01");
    const sorted = sortMilestonesForSections([
      milestone("z", "Zebra", same),
      milestone("a", "Apple", same),
    ]);
    expect(sorted.map((m) => m.id)).toEqual(["a", "z"]);
  });
});

describe("buildGanttSections", () => {
  const m1 = milestone("m1", "Alpha", new Date("2026-01-01"));
  const m2 = milestone("m2", "Beta", new Date("2026-02-01"));

  it("puts member tasks directly under their milestone", () => {
    const sections = buildGanttSections({
      rows: [row("t1", "m1"), row("t2", "m2"), row("t3", "m1")],
      milestones: [m1, m2],
    });
    expect(sections).toHaveLength(2);
    expect(sections[0].kind).toBe("milestone");
    expect(ids(sections[0].rows)).toEqual(["t1", "t3"]);
    expect(ids(sections[1].rows)).toEqual(["t2"]);
  });

  it("orders sections by milestone target date", () => {
    const sections = buildGanttSections({
      rows: [],
      milestones: [m2, m1],
    });
    expect(
      sections.map((s) =>
        s.kind === "milestone" ? s.milestone.id : "ungrouped",
      ),
    ).toEqual(["m1", "m2"]);
  });

  it("collects unassigned tasks into a trailing ungrouped section", () => {
    const sections = buildGanttSections({
      rows: [row("t1", "m1"), row("loose")],
      milestones: [m1],
    });
    expect(sections).toHaveLength(2);
    const last = sections[sections.length - 1];
    expect(last.kind).toBe("ungrouped");
    expect(ids(last.rows)).toEqual(["loose"]);
    expect(last.kind === "ungrouped" && last.labelled).toBe(true);
  });

  it("does not label ungrouped work when the board has no milestones", () => {
    const sections = buildGanttSections({
      rows: [row("loose")],
      milestones: [],
    });
    expect(sections).toEqual([
      { kind: "ungrouped", rows: [row("loose")], labelled: false },
    ]);
  });

  it("keeps a subtask in its parent's section via inheritance", () => {
    const sections = buildGanttSections({
      rows: [row("parent", "m1"), row("child", null, 1, "parent")],
      milestones: [m1],
    });
    // The child must NOT fall through to "ungrouped".
    expect(sections).toHaveLength(1);
    expect(ids(sections[0].rows)).toEqual(["parent", "child"]);
  });

  it("renders an empty milestone section with no rows", () => {
    const sections = buildGanttSections({ rows: [], milestones: [m1] });
    expect(sections).toHaveLength(1);
    expect(sections[0].rows).toEqual([]);
  });

  it("does not lose a task pointing at an unrendered milestone", () => {
    // Milestone filtered out or deleted: the task still has to appear.
    const sections = buildGanttSections({
      rows: [row("orphan", "gone")],
      milestones: [m1],
    });
    const all = sections.flatMap((s) => ids(s.rows));
    expect(all).toContain("orphan");
  });

  it("preserves the incoming row order within a section", () => {
    const sections = buildGanttSections({
      rows: [row("c", "m1"), row("a", "m1"), row("b", "m1")],
      milestones: [m1],
    });
    expect(ids(sections[0].rows)).toEqual(["c", "a", "b"]);
  });

  it("marks a section collapsed without dropping its rows", () => {
    const sections = buildGanttSections({
      rows: [row("t1", "m1")],
      milestones: [m1],
      collapsedMilestoneIds: new Set(["m1"]),
    });
    expect(sections[0].kind === "milestone" && sections[0].collapsed).toBe(
      true,
    );
    // The section still knows its members, so the header can show a count.
    expect(ids(sections[0].rows)).toEqual(["t1"]);
  });

  it("never duplicates or loses a row", () => {
    const rows = [
      row("t1", "m1"),
      row("t2", "m2"),
      row("t3"),
      row("t4", "m1", 1, "t1"),
    ];
    const sections = buildGanttSections({ rows, milestones: [m1, m2] });
    const all = sections.flatMap((s) => ids(s.rows)).sort();
    expect(all).toEqual(["t1", "t2", "t3", "t4"]);
  });
});

describe("visibleSectionRows", () => {
  const m1 = milestone("m1", "Alpha", new Date("2026-01-01"));
  const m2 = milestone("m2", "Beta", new Date("2026-02-01"));

  it("hides the rows of a collapsed section", () => {
    const sections = buildGanttSections({
      rows: [row("t1", "m1"), row("t2", "m2")],
      milestones: [m1, m2],
      collapsedMilestoneIds: new Set(["m1"]),
    });
    expect(ids(visibleSectionRows(sections))).toEqual(["t2"]);
  });

  it("shows everything when nothing is collapsed", () => {
    const sections = buildGanttSections({
      rows: [row("t1", "m1"), row("t2", "m2"), row("t3")],
      milestones: [m1, m2],
    });
    expect(ids(visibleSectionRows(sections))).toEqual(["t1", "t2", "t3"]);
  });

  it("never hides the ungrouped section", () => {
    const sections = buildGanttSections({
      rows: [row("t1", "m1"), row("loose")],
      milestones: [m1],
      collapsedMilestoneIds: new Set(["m1", "m2"]),
    });
    expect(ids(visibleSectionRows(sections))).toEqual(["loose"]);
  });
});
