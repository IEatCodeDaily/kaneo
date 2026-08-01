import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BoardSkeleton } from "./board-skeleton";

afterEach(cleanup);

/**
 * Board loading skeleton (#111).
 *
 * The bug was a skeleton that read as a generic placeholder rather than as the
 * board about to appear, so these assert the properties that make it *look like
 * a board*: four columns, each with header chrome, cards that carry real card
 * anatomy (title lines + avatar + meta), and an uneven distribution.
 *
 * Assertions are on structure and on whole class tokens, never on class
 * substrings — Tailwind variants embed base utility names (`motion-safe:hover:`
 * etc.), so `toContain("w-80")` would pass on markup that never sets that width.
 */

/** Whole-token class match; `toContain` would match inside a variant prefix. */
function hasClass(element: Element, token: string) {
  return element.className.split(/\s+/).includes(token);
}

describe("BoardSkeleton", () => {
  it("renders exactly four column skeletons", () => {
    render(<BoardSkeleton />);

    expect(screen.getAllByTestId("board-skeleton-column")).toHaveLength(4);
  });

  it("gives every column header chrome: a name bar and a count chip", () => {
    render(<BoardSkeleton />);

    expect(screen.getAllByTestId("board-skeleton-column-header")).toHaveLength(
      4,
    );
    expect(screen.getAllByTestId("board-skeleton-column-name")).toHaveLength(4);
    expect(screen.getAllByTestId("board-skeleton-column-count")).toHaveLength(
      4,
    );
  });

  it("fills every column with cards", () => {
    render(<BoardSkeleton />);

    const columns = screen.getAllByTestId("board-skeleton-column");
    const perColumn = columns.map(
      (column) =>
        column.querySelectorAll('[data-testid="board-skeleton-card"]').length,
    );

    // A column with no cards would render as an empty box, which is exactly the
    // "nothing has loaded" look the ticket is about.
    for (const count of perColumn) {
      expect(count).toBeGreaterThan(0);
    }
  });

  it("varies card counts across columns instead of a uniform grid", () => {
    render(<BoardSkeleton />);

    const perColumn = screen
      .getAllByTestId("board-skeleton-column")
      .map(
        (column) =>
          column.querySelectorAll('[data-testid="board-skeleton-card"]').length,
      );

    // Every column holding the same number of identical cards is the tell of a
    // placeholder; a real board tapers toward "done".
    expect(new Set(perColumn).size).toBeGreaterThan(1);
  });

  it("builds each card out of real card anatomy", () => {
    render(<BoardSkeleton />);

    const cards = screen.getAllByTestId("board-skeleton-card");
    expect(cards.length).toBeGreaterThan(4);

    for (const card of cards) {
      // Title block: at least one line, standing in for the wrapped task title.
      expect(
        card.querySelectorAll('[data-testid="board-skeleton-card-title-line"]')
          .length,
      ).toBeGreaterThan(0);
      // Assignee avatar, where TaskCard pins it.
      expect(
        card.querySelector('[data-testid="board-skeleton-card-avatar"]'),
      ).not.toBeNull();
      // Footer chips (priority / due date).
      expect(
        card.querySelector('[data-testid="board-skeleton-card-meta"]'),
      ).not.toBeNull();
    }
  });

  it("varies title line counts so cards are not all the same height", () => {
    render(<BoardSkeleton />);

    const lineCounts = screen
      .getAllByTestId("board-skeleton-card")
      .map(
        (card) =>
          card.querySelectorAll(
            '[data-testid="board-skeleton-card-title-line"]',
          ).length,
      );

    expect(new Set(lineCounts).size).toBeGreaterThan(1);
  });

  it("shows label chips on some cards but not all", () => {
    render(<BoardSkeleton />);

    const cards = screen.getAllByTestId("board-skeleton-card");
    const withLabels = cards.filter(
      (card) =>
        card.querySelectorAll('[data-testid="board-skeleton-card-label"]')
          .length > 0,
    );

    expect(withLabels.length).toBeGreaterThan(0);
    expect(withLabels.length).toBeLessThan(cards.length);
  });

  it("sizes column tracks like the real board so content does not jump", () => {
    render(<BoardSkeleton />);

    // Same track sizing KanbanBoard gives its column wrappers. Whole-token
    // matching: a substring check would pass on `md:min-w-80` too.
    for (const column of screen.getAllByTestId("board-skeleton-column")) {
      expect(hasClass(column, "min-w-80")).toBe(true);
      expect(hasClass(column, "max-w-96")).toBe(true);
      expect(hasClass(column, "flex-1")).toBe(true);
    }
  });

  it("exposes itself to assistive tech as a busy loading region", () => {
    render(<BoardSkeleton />);

    const region = screen.getByTestId("board-skeleton");
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(screen.getByLabelText("Loading board")).toBe(region);
  });

  /**
   * Negative control.
   *
   * Everything above passes against the component as written; the risk is that
   * it would *also* pass against the flat placeholder the ticket replaced. This
   * renders a stand-in for that old markup — four bare columns, no header
   * chrome, no cards — and asserts the suite's core checks go red on it.
   *
   * If any of these expectations start failing, the assertions above have gone
   * hollow and no longer distinguish a board-shaped skeleton from a grey box.
   */
  describe("negative control: flat placeholder must not satisfy the assertions", () => {
    function FlatPlaceholder() {
      return (
        <div data-testid="board-skeleton">
          {["a", "b", "c", "d"].map((key) => (
            <div key={key} data-testid="board-skeleton-column" className="w-72">
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      );
    }

    it("fails the header-chrome assertion", () => {
      render(<FlatPlaceholder />);

      expect(() => screen.getAllByTestId("board-skeleton-column-name")).toThrow(
        /Unable to find an element/,
      );
      expect(() =>
        screen.getAllByTestId("board-skeleton-column-count"),
      ).toThrow(/Unable to find an element/);
    });

    it("fails the card-anatomy assertion", () => {
      render(<FlatPlaceholder />);

      expect(() => screen.getAllByTestId("board-skeleton-card")).toThrow(
        /Unable to find an element/,
      );
    });

    it("fails the column-track sizing assertion", () => {
      render(<FlatPlaceholder />);

      const columns = screen.getAllByTestId("board-skeleton-column");
      expect(columns).toHaveLength(4);
      // Four columns alone is not the bar — they must be board-sized.
      expect(columns.every((column) => hasClass(column, "min-w-80"))).toBe(
        false,
      );
    });

    it("fails the accessible-loading-region assertion", () => {
      render(<FlatPlaceholder />);

      expect(screen.getByTestId("board-skeleton")).not.toHaveAttribute(
        "aria-busy",
      );
      expect(() => screen.getByLabelText("Loading board")).toThrow(
        /Unable to find/,
      );
    });
  });
});
