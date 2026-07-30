export const BOARD_VIEWS = ["board", "gantt", "calendar", "backlog"] as const;

export type BoardView = (typeof BOARD_VIEWS)[number];

/**
 * The board view segment of a dashboard URL, defaulting to the kanban board.
 * Used so switching boards keeps whichever view the user is currently in.
 */
export function boardViewFromPathname(pathname: string): BoardView {
  const match = pathname.match(
    /\/board\/[^/]+\/(board|gantt|calendar|backlog)(?:\/|$)/,
  );
  return (match?.[1] as BoardView) ?? "board";
}
