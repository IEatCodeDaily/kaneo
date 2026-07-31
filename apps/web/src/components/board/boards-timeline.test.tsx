import { cleanup, render, screen } from "@testing-library/react";
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
});
