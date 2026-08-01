import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BoardsTimeline, { type TimelineBoard } from "./boards-timeline";

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
});
