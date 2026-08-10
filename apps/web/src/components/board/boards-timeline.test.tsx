import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BoardsTimeline, {
  type TimelineBoard,
  type TimelineMilestone,
} from "./boards-timeline";

afterEach(cleanup);

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

const board = (
  id: string,
  startsAt: string | null,
  endsAt: string | null,
  extra: Partial<TimelineBoard["statistics"]> = {},
): TimelineBoard => ({
  id,
  name: `Board ${id}`,
  icon: "Layout",
  statistics: {
    totalTasks: 3,
    completionPercentage: 50,
    startsAt,
    endsAt,
    ...extra,
  },
});

/**
 * A board's span is derived from its tasks (earliest start → latest due), so the
 * interesting cases are the degenerate ones: no dates at all, only one of the
 * two, and a single-day board. Each has to behave predictably rather than
 * silently vanish or render a zero-width bar.
 */
describe("BoardsTimeline", () => {
  it("renders a board-first hierarchy collapsed by default and reveals its scheduled sections", () => {
    const boardWithTasks: TimelineBoard = {
      ...board("a", "2026-06-01T00:00:00.000Z", "2026-06-10T00:00:00.000Z"),
      tasks: [
        {
          id: "milestone-task",
          title: "Milestone ticket",
          milestoneId: "m1",
          startDate: "2026-06-02T00:00:00.000Z",
          dueDate: "2026-06-04T00:00:00.000Z",
        },
        {
          id: "unassigned-task",
          title: "Unassigned ticket",
          dueDate: "2026-06-06T00:00:00.000Z",
        },
      ],
    };

    render(
      <BoardsTimeline
        boards={[boardWithTasks]}
        milestonesByBoardId={{
          a: [{ id: "m1", name: "Release milestone", status: "active" }],
        }}
        onBoardClick={vi.fn()}
        zoom="week"
      />,
    );

    expect(
      screen
        .getByTestId("boards-timeline-toggle-a")
        .getAttribute("aria-expanded"),
    ).toBe("false");
    expect(screen.queryByText("Release milestone")).toBeNull();
    expect(screen.queryByText("Milestone ticket")).toBeNull();

    fireEvent.click(screen.getByTestId("boards-timeline-toggle-a"));

    expect(
      screen
        .getByTestId("boards-timeline-toggle-a")
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(screen.getByText("Release milestone")).toBeTruthy();
    expect(screen.getByText("Scheduled without milestone")).toBeTruthy();
    expect(
      screen.getByTestId("boards-timeline-task-a-milestone-task"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("boards-timeline-task-a-unassigned-task"),
    ).toBeTruthy();

    fireEvent.click(screen.getByTestId("boards-timeline-collapse-all"));
    expect(
      screen
        .getByTestId("boards-timeline-toggle-a")
        .getAttribute("aria-expanded"),
    ).toBe("false");

    fireEvent.click(screen.getByTestId("boards-timeline-expand-all"));
    expect(
      screen
        .getByTestId("boards-timeline-toggle-a")
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("renders a bar per scheduled board", () => {
    render(
      <BoardsTimeline
        boards={[
          board("a", "2026-06-01T00:00:00.000Z", "2026-06-10T00:00:00.000Z"),
          board("b", "2026-06-05T00:00:00.000Z", "2026-06-20T00:00:00.000Z"),
        ]}
        onBoardClick={vi.fn()}
        zoom="week"
      />,
    );

    expect(screen.getByTestId("boards-timeline")).toBeTruthy();
    expect(screen.getByTestId("boards-timeline-bar-a")).toBeTruthy();
    expect(screen.getByTestId("boards-timeline-bar-b")).toBeTruthy();
  });

  it("omits boards with no dates instead of rendering a zero-width bar", () => {
    render(
      <BoardsTimeline
        boards={[
          board(
            "dated",
            "2026-06-01T00:00:00.000Z",
            "2026-06-10T00:00:00.000Z",
          ),
          board("undated", null, null),
        ]}
        onBoardClick={vi.fn()}
        zoom="week"
      />,
    );

    expect(screen.getByTestId("boards-timeline-bar-dated")).toBeTruthy();
    expect(screen.queryByTestId("boards-timeline-bar-undated")).toBeNull();
  });

  it("shows an empty state when nothing is scheduled", () => {
    render(
      <BoardsTimeline
        boards={[board("a", null, null)]}
        onBoardClick={vi.fn()}
        zoom="week"
      />,
    );

    expect(screen.getByTestId("boards-timeline-empty")).toBeTruthy();
    expect(screen.queryByTestId("boards-timeline")).toBeNull();
  });

  it("still renders a board that has only a due date", () => {
    // The API falls back start→due, so this arrives as start === end.
    render(
      <BoardsTimeline
        boards={[
          board(
            "due-only",
            "2026-07-01T00:00:00.000Z",
            "2026-07-01T00:00:00.000Z",
          ),
        ]}
        onBoardClick={vi.fn()}
        zoom="week"
      />,
    );

    expect(screen.getByTestId("boards-timeline-bar-due-only")).toBeTruthy();
  });

  it("spans exactly the number of days the board covers, inclusive", () => {
    // Jun 1 → Jun 10 is 10 inclusive days; week zoom pads the head by 14 days,
    // so the bar must start at column 15 and run 10 columns.
    render(
      <BoardsTimeline
        boards={[
          board("a", "2026-06-01T00:00:00.000Z", "2026-06-10T00:00:00.000Z"),
        ]}
        onBoardClick={vi.fn()}
        zoom="week"
      />,
    );

    expect(screen.getByTestId("boards-timeline-bar-a").style.gridColumn).toBe(
      "15 / span 10",
    );
  });

  it("drops a board whose dates are inverted rather than misplacing its bar", () => {
    render(
      <BoardsTimeline
        boards={[
          board(
            "inverted",
            "2026-07-10T00:00:00.000Z",
            "2026-07-01T00:00:00.000Z",
          ),
        ]}
        onBoardClick={vi.fn()}
        zoom="week"
      />,
    );

    // end < start means the board's own task dates disagree. Rendering it would
    // put a bar somewhere misleading, so it is omitted like an undated board.
    expect(screen.queryByTestId("boards-timeline-bar-inverted")).toBeNull();
    expect(screen.getByTestId("boards-timeline-empty")).toBeTruthy();
  });

  /**
   * The board names sit in a fixed 14rem left column next to a horizontally
   * scrolling grid, so without `position: sticky` they slide out of view and
   * every row becomes an anonymous bar. Class tokens are compared whole:
   * substring checks pass on unrelated classes (e.g. "left-0" contains "left",
   * "w-56" contains "5"), which is exactly how a broken sticky column would
   * still look tested.
   */
  const classTokens = (element: Element) =>
    element.className.split(/\s+/).filter(Boolean);

  it("pins the board-name header cell during horizontal scroll", () => {
    render(
      <BoardsTimeline
        boards={[
          board("a", "2026-06-01T00:00:00.000Z", "2026-06-10T00:00:00.000Z"),
        ]}
        onBoardClick={vi.fn()}
        zoom="week"
      />,
    );

    const tokens = classTokens(
      screen.getByTestId("boards-timeline-name-header"),
    );
    expect(tokens).toContain("sticky");
    expect(tokens).toContain("left-0");
  });

  it("pins every board-name row cell so rows stay aligned with the header", () => {
    render(
      <BoardsTimeline
        boards={[
          board("a", "2026-06-01T00:00:00.000Z", "2026-06-10T00:00:00.000Z"),
          board("b", "2026-06-05T00:00:00.000Z", "2026-06-20T00:00:00.000Z"),
        ]}
        onBoardClick={vi.fn()}
        zoom="week"
      />,
    );

    for (const id of ["a", "b"]) {
      const tokens = classTokens(
        screen.getByTestId(`boards-timeline-name-${id}`),
      );
      expect(tokens).toContain("sticky");
      expect(tokens).toContain("left-0");
    }
  });

  it("filters timeline rows by derived board status without changing zoom or sticky labels", () => {
    render(
      <BoardsTimeline
        boards={[
          board(
            "not-started",
            "2026-06-01T00:00:00.000Z",
            "2026-06-10T00:00:00.000Z",
            {
              totalTasks: 0,
              completionPercentage: 0,
            },
          ),
          board(
            "in-progress",
            "2026-06-05T00:00:00.000Z",
            "2026-06-20T00:00:00.000Z",
            {
              completionPercentage: 50,
            },
          ),
          board(
            "complete",
            "2026-06-10T00:00:00.000Z",
            "2026-06-25T00:00:00.000Z",
            {
              completionPercentage: 100,
            },
          ),
        ]}
        onBoardClick={vi.fn()}
        zoom="week"
      />,
    );

    fireEvent.click(screen.getByTestId("boards-timeline-filter"));
    fireEvent.click(screen.getByTestId("boards-timeline-filter-complete"));

    expect(screen.getByTestId("boards-timeline-bar-complete")).toBeTruthy();
    expect(screen.queryByTestId("boards-timeline-bar-in-progress")).toBeNull();
    expect(screen.queryByTestId("boards-timeline-bar-not-started")).toBeNull();
    expect(
      screen
        .getByTestId("boards-timeline-zoom-month")
        .getAttribute("aria-pressed"),
    ).toBe("true");

    for (const element of [
      screen.getByTestId("boards-timeline-name-header"),
      screen.getByTestId("boards-timeline-name-complete"),
    ]) {
      expect(classTokens(element)).toContain("sticky");
      expect(classTokens(element)).toContain("left-0");
    }
  });

  it("offers Week, Month and Year zoom options with Month selected by default", () => {
    render(
      <BoardsTimeline
        boards={[
          board("a", "2026-06-01T00:00:00.000Z", "2026-06-10T00:00:00.000Z"),
        ]}
        onBoardClick={vi.fn()}
      />,
    );

    const control = screen.getByTestId("boards-timeline-zoom");
    expect(
      Array.from(control.querySelectorAll("button")).map((b) => b.textContent),
    ).toEqual(["Week", "Month", "Year"]);
    // Middle option is the default, so the view opens neither cramped nor tiny.
    expect(
      screen
        .getByTestId("boards-timeline-zoom-month")
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("rebuilds the timeline when the zoom control changes", () => {
    render(
      <BoardsTimeline
        boards={[
          board("a", "2026-06-01T00:00:00.000Z", "2026-06-10T00:00:00.000Z"),
        ]}
        onBoardClick={vi.fn()}
      />,
    );

    // Header cells are grouped per zoom and the column template is derived from
    // the padded day range, so both must move when the level changes.
    const header = () =>
      screen.getByTestId("boards-timeline").querySelectorAll("[style*='span']")
        .length;
    const columns = () =>
      screen.getByTestId("boards-timeline-bar-a").parentElement?.style
        .gridTemplateColumns;

    const monthCells = header();
    const monthColumns = columns();

    fireEvent.click(screen.getByTestId("boards-timeline-zoom-week"));
    expect(columns()).not.toBe(monthColumns);
    expect(header()).not.toBe(monthCells);

    fireEvent.click(screen.getByTestId("boards-timeline-zoom-year"));
    expect(columns()).not.toBe(monthColumns);
    expect(
      screen
        .getByTestId("boards-timeline-zoom-year")
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  /**
   * Milestone diamonds. The overview aggregates milestones in the caller and
   * passes them down, so these cases are all about placement and omission: a
   * diamond on the wrong column is worse than no diamond, and a milestone the
   * timeline cannot place must vanish rather than clamp to an edge.
   *
   * Every positional assertion reads the computed `gridColumn`, because that is
   * the only thing that decides where the marker actually lands. At week zoom
   * the head padding is 14 days and Jun 1 2026 is a Monday, so `rangeStart` is
   * May 18 2026 and the board bar starts at column 15 (asserted above).
   */
  const milestone = (
    id: string,
    dueDate: string | null,
    status = "planned",
  ): TimelineMilestone => ({
    id,
    name: `Milestone ${id}`,
    status,
    dueDate,
  });

  const datedBoard = board(
    "a",
    "2026-06-01T00:00:00.000Z",
    "2026-06-10T00:00:00.000Z",
  );

  it("places a milestone diamond on its due-date column", () => {
    render(
      <BoardsTimeline
        boards={[datedBoard]}
        milestonesByBoardId={{
          a: [milestone("m1", "2026-06-05T00:00:00.000Z")],
        }}
        onBoardClick={vi.fn()}
        zoom="week"
      />,
    );

    // rangeStart is May 18; Jun 5 is 18 days later, so column 19. Anchoring the
    // expectation to the bar's own start column keeps the two in step: the
    // milestone is 4 days after the Jun 1 bar start, i.e. 15 + 4.
    const diamond = screen.getByTestId("boards-timeline-milestone-a-m1");
    expect(diamond.parentElement?.style.gridColumn).toBe("19");

    const barStart = Number.parseInt(
      screen.getByTestId("boards-timeline-bar-a").style.gridColumn,
      10,
    );
    expect(diamond.parentElement?.style.gridColumn).toBe(String(barStart + 4));
    // REGRESSION: the diamond must share the board bar's grid ROW. Without an
    // explicit gridRow, grid resolves the column overlap by pushing the marker
    // onto a new implicit row, adding a phantom row and detaching the diamond
    // from the bar it annotates.
    expect(diamond.parentElement?.style.gridRow).toBe("1");
    expect(screen.getByTestId("boards-timeline-bar-a").style.gridRow).toBe("1");
  });

  it("renders no milestone markers when the prop is omitted", () => {
    render(
      <BoardsTimeline
        boards={[datedBoard]}
        onBoardClick={vi.fn()}
        zoom="week"
      />,
    );

    // The overview's existing callers pass no milestones at all, so the row must
    // be byte-for-byte the old row: a bar and nothing else.
    expect(screen.getByTestId("boards-timeline-bar-a")).toBeTruthy();
    expect(
      screen
        .getByTestId("boards-timeline")
        .querySelectorAll("[data-testid^='boards-timeline-milestone-']").length,
    ).toBe(0);
  });

  it("renders no markers for a board with an empty milestone list", () => {
    render(
      <BoardsTimeline
        boards={[datedBoard]}
        milestonesByBoardId={{ a: [] }}
        onBoardClick={vi.fn()}
        zoom="week"
      />,
    );

    expect(
      screen
        .getByTestId("boards-timeline")
        .querySelectorAll("[data-testid^='boards-timeline-milestone-']").length,
    ).toBe(0);
  });

  it("skips a milestone with no due date while still drawing its dated siblings", () => {
    render(
      <BoardsTimeline
        boards={[datedBoard]}
        milestonesByBoardId={{
          a: [
            milestone("undated", null),
            milestone("dated", "2026-06-05T00:00:00.000Z"),
          ],
        }}
        onBoardClick={vi.fn()}
        zoom="week"
      />,
    );

    // An undated milestone has no column to sit on; dropping it must not take
    // the rest of the board's milestones down with it.
    expect(
      screen.queryByTestId("boards-timeline-milestone-a-undated"),
    ).toBeNull();
    expect(
      screen.getByTestId("boards-timeline-milestone-a-dated").parentElement
        ?.style.gridColumn,
    ).toBe("19");
  });

  it("skips milestones due outside the timeline range instead of clamping them to an edge", () => {
    render(
      <BoardsTimeline
        boards={[datedBoard]}
        milestonesByBoardId={{
          a: [
            milestone("before", "2026-01-01T00:00:00.000Z"),
            milestone("after", "2027-06-01T00:00:00.000Z"),
            milestone("inside", "2026-06-05T00:00:00.000Z"),
          ],
        }}
        onBoardClick={vi.fn()}
        zoom="week"
      />,
    );

    // Clamping would park these on column 1 / the last column and claim a due
    // date the milestone does not have, so they are dropped silently.
    expect(
      screen.queryByTestId("boards-timeline-milestone-a-before"),
    ).toBeNull();
    expect(
      screen.queryByTestId("boards-timeline-milestone-a-after"),
    ).toBeNull();
    expect(
      screen.getByTestId("boards-timeline-milestone-a-inside"),
    ).toBeTruthy();
  });

  it("renders every milestone on a board, each on its own column", () => {
    render(
      <BoardsTimeline
        boards={[datedBoard]}
        milestonesByBoardId={{
          a: [
            milestone("early", "2026-06-02T00:00:00.000Z"),
            milestone("late", "2026-06-09T00:00:00.000Z", "completed"),
          ],
        }}
        onBoardClick={vi.fn()}
        zoom="week"
      />,
    );

    // Jun 2 and Jun 9 are 15 and 22 days after rangeStart (May 18).
    expect(
      screen.getByTestId("boards-timeline-milestone-a-early").parentElement
        ?.style.gridColumn,
    ).toBe("16");
    expect(
      screen.getByTestId("boards-timeline-milestone-a-late").parentElement
        ?.style.gridColumn,
    ).toBe("23");
  });

  it("keys milestones by board so each row only shows its own", () => {
    render(
      <BoardsTimeline
        boards={[
          datedBoard,
          board("b", "2026-06-05T00:00:00.000Z", "2026-06-20T00:00:00.000Z"),
        ]}
        milestonesByBoardId={{
          a: [milestone("m1", "2026-06-05T00:00:00.000Z")],
          b: [milestone("m2", "2026-06-12T00:00:00.000Z")],
        }}
        onBoardClick={vi.fn()}
        zoom="week"
      />,
    );

    // The map is keyed by board id, so a marker must never leak into a sibling
    // row — the testid encodes both ids precisely so this is checkable.
    expect(screen.getByTestId("boards-timeline-milestone-a-m1")).toBeTruthy();
    expect(screen.getByTestId("boards-timeline-milestone-b-m2")).toBeTruthy();
    expect(screen.queryByTestId("boards-timeline-milestone-a-m2")).toBeNull();
    expect(screen.queryByTestId("boards-timeline-milestone-b-m1")).toBeNull();
  });

  it("exposes the milestone name, formatted due date and status as hover info", () => {
    render(
      <BoardsTimeline
        boards={[datedBoard]}
        milestonesByBoardId={{
          a: [milestone("m1", "2026-06-05T00:00:00.000Z", "active")],
        }}
        onBoardClick={vi.fn()}
        zoom="week"
      />,
    );

    // Hover text is the only place the milestone's identity is readable — the
    // marker itself is a bare icon — so it carries name, date and status, and is
    // mirrored to aria-label for anyone not using a pointer.
    const diamond = screen.getByTestId("boards-timeline-milestone-a-m1");
    const title = diamond.getAttribute("title") ?? "";
    expect(title).toContain("Milestone m1");
    expect(title).toContain("Jun 5, 2026");
    expect(title).toContain("active");
    expect(diamond.getAttribute("aria-label")).toBe(title);
  });

  it("keeps the board bar clickable and lets a diamond open the same board", () => {
    const onBoardClick = vi.fn();
    render(
      <BoardsTimeline
        boards={[datedBoard]}
        milestonesByBoardId={{
          a: [milestone("m1", "2026-06-05T00:00:00.000Z")],
        }}
        onBoardClick={onBoardClick}
        zoom="week"
      />,
    );

    // The marker sits above the bar (z-[6] over z-[5]), so it must not become a
    // dead zone that swallows the row's primary action.
    fireEvent.click(screen.getByTestId("boards-timeline-bar-a"));
    expect(onBoardClick).toHaveBeenCalledWith("a");

    onBoardClick.mockClear();
    fireEvent.click(screen.getByTestId("boards-timeline-milestone-a-m1"));
    expect(onBoardClick).toHaveBeenCalledWith("a");
  });

  it("tints the diamond by milestone status and falls back for unknown ones", () => {
    render(
      <BoardsTimeline
        boards={[datedBoard]}
        milestonesByBoardId={{
          a: [
            milestone("done", "2026-06-02T00:00:00.000Z", "completed"),
            milestone("weird", "2026-06-03T00:00:00.000Z", "not-a-status"),
          ],
        }}
        onBoardClick={vi.fn()}
        zoom="week"
      />,
    );

    // Compared as whole class tokens: a substring check on "text-emerald-500"
    // would also match an unrelated "text-emerald-500/20". Read the `class`
    // attribute rather than `className`, which on an SVG element is an
    // SVGAnimatedString and has no .split.
    const iconTokens = (testId: string) =>
      (
        screen
          .getByTestId(testId)
          .querySelector("svg")
          ?.getAttribute("class") ?? ""
      )
        .split(/\s+/)
        .filter(Boolean);

    expect(iconTokens("boards-timeline-milestone-a-done")).toContain(
      "text-emerald-500",
    );
    // An unrecognised status must still be visible, not uncoloured.
    expect(iconTokens("boards-timeline-milestone-a-weird")).toContain(
      "text-violet-500",
    );
  });
});
