import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { differenceInCalendarDays } from "date-fns";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GanttMilestoneRow } from "./gantt-milestone-row";
import type { GanttMilestone } from "./gantt-milestones";
import { buildTimeline } from "./gantt-timeline";

const timeline = buildTimeline({
  earliest: new Date("2026-01-01"),
  latest: new Date("2026-01-31"),
  zoom: "day",
  isMobile: false,
  weekStartsOn: 1,
});

if (!timeline) throw new Error("timeline fixture failed to build");

/**
 * `buildTimeline` pads the range out to whole weeks, so rangeStart is NOT the
 * `earliest` passed in. Derive expected columns from the real rangeStart rather
 * than hardcoding, or the assertions encode the wrong origin.
 */
const columnFor = (date: Date) =>
  String(differenceInCalendarDays(date, timeline.rangeStart) + 1);

const milestone = (
  overrides: Partial<GanttMilestone> = {},
): GanttMilestone => ({
  id: "m1",
  name: "Launch",
  status: "active",
  taskIds: ["t1", "t2"],
  taskCount: 2,
  completedCount: 1,
  percentComplete: 50,
  spanStart: new Date("2026-01-05"),
  spanEnd: new Date("2026-01-20"),
  targetDate: new Date("2026-01-10"),
  targetIsExplicit: true,
  ...overrides,
});

function renderRow(
  props: Partial<Parameters<typeof GanttMilestoneRow>[0]> = {},
) {
  return render(
    <GanttMilestoneRow
      milestone={milestone()}
      timeline={timeline}
      showTaskRail
      taskColumnWidthRem={20}
      isMobile={false}
      {...props}
    />,
  );
}

describe("GanttMilestoneRow", () => {
  // This repo's vitest setup does not auto-cleanup between tests, so repeated
  // render() calls would stack duplicate testids and break getBy* queries.
  afterEach(cleanup);

  it("renders exactly ONE diamond, on the due date column", () => {
    renderRow();
    const target = screen.getByTestId("gantt-milestone-target-m1");
    expect(target).toHaveStyle({
      gridColumn: columnFor(new Date("2026-01-10")),
    });
    // A milestone is a point in time: no span bar competing with task bars.
    expect(screen.queryByTestId("gantt-milestone-span-m1")).toBeNull();
  });

  it("moves the diamond when the due date moves", () => {
    renderRow({
      milestone: milestone({ targetDate: new Date("2026-01-01") }),
    });
    expect(screen.getByTestId("gantt-milestone-target-m1")).toHaveStyle({
      gridColumn: columnFor(new Date("2026-01-01")),
    });
  });

  it("pins the diamond to grid row 1 so it cannot create a new row", () => {
    // REGRESSION: without an explicit gridRow, CSS grid resolves a column
    // conflict between the marker and a bar by pushing one onto a NEW implicit
    // row, which inflates the row height and visually detaches the diamond.
    renderRow();
    expect(screen.getByTestId("gantt-milestone-target-m1")).toHaveStyle({
      gridRow: "1",
    });
  });

  it("renders no diamond without a target date", () => {
    renderRow({ milestone: milestone({ targetDate: null }) });
    expect(screen.queryByTestId("gantt-milestone-target-m1")).toBeNull();
  });

  it("renders no diamond for a date outside the timeline", () => {
    renderRow({
      milestone: milestone({ targetDate: new Date("2027-06-01") }),
    });
    expect(screen.queryByTestId("gantt-milestone-target-m1")).toBeNull();
  });

  it("exposes hover info with the name and due date", () => {
    renderRow();
    expect(screen.getByTestId("gantt-milestone-target-m1")).toHaveAttribute(
      "title",
      expect.stringContaining("Launch"),
    );
    expect(screen.getByTestId("gantt-milestone-target-m1")).toHaveAttribute(
      "title",
      expect.stringContaining("Jan 10, 2026"),
    );
  });

  it("exposes progress in the hover info", () => {
    renderRow();
    expect(
      screen.getByLabelText(/Launch, due Jan 10, 2026/),
    ).toBeInTheDocument();
  });

  it("distinguishes an inferred target from an explicit due date", () => {
    renderRow({ milestone: milestone({ targetIsExplicit: false }) });
    expect(screen.getByTestId("gantt-milestone-target-m1")).toHaveAttribute(
      "title",
      expect.stringContaining("inferred target"),
    );
  });

  it("acts as a section header that toggles collapse", () => {
    const onToggleCollapse = vi.fn();
    renderRow({ onToggleCollapse });
    const toggle = screen.getByTestId("gantt-milestone-toggle-m1");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    expect(onToggleCollapse).toHaveBeenCalledWith("m1");
  });

  it("reports collapsed state for the expand affordance", () => {
    renderRow({ collapsed: true });
    expect(screen.getByTestId("gantt-milestone-toggle-m1")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByTestId("gantt-milestone-m1")).toHaveAttribute(
      "data-collapsed",
      "true",
    );
  });

  it("shows the section's own member count over the API count", () => {
    // The section knows what is actually rendered; milestone.taskCount can be
    // stale or include filtered-out rows.
    renderRow({ milestone: milestone({ taskCount: 99 }), taskCount: 3 });
    expect(screen.getByText(/1\/3/)).toBeInTheDocument();
  });

  it("still renders the diamond when the task rail is hidden", () => {
    renderRow({ showTaskRail: false });
    expect(screen.getByTestId("gantt-milestone-target-m1")).toBeInTheDocument();
    expect(screen.queryByTestId("gantt-milestone-toggle-m1")).toBeNull();
  });
});
