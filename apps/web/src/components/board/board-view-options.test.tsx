import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BoardDensity } from "@/components/kanban-board/board-density";
import type { BoardGroupBy } from "@/hooks/use-task-filters-with-labels-support";
import BoardViewOptions from "./board-view-options";

afterEach(cleanup);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

/**
 * Group-by + display density control (#61).
 *
 * Asserts on radio/pressed state and the emitted callback values rather than on
 * class substrings: a class check would still pass if the control stopped
 * reporting the user's choice upward.
 */
describe("BoardViewOptions", () => {
  const baseProps = {
    groupBy: "none" as BoardGroupBy,
    onGroupByChange: vi.fn(),
    density: "comfortable" as BoardDensity,
    onDensityChange: vi.fn(),
  };

  function open(props: Partial<typeof baseProps> = {}) {
    const merged = { ...baseProps, ...props };
    render(<BoardViewOptions {...merged} />);
    fireEvent.click(screen.getByRole("button", { name: /viewOptions\.label/ }));
    return merged;
  }

  it("offers every group-by option", () => {
    open();

    // The selected item renders a check icon inside the label, so match on
    // containment rather than exact text.
    const values = screen
      .getAllByRole("menuitemradio")
      .map((item) => item.textContent ?? "");

    for (const key of [
      "tasks:groupBy.none",
      "tasks:groupBy.assignee",
      "tasks:groupBy.priority",
      "tasks:groupBy.label",
    ]) {
      expect(values.some((value) => value.includes(key))).toBe(true);
    }
  });

  it("reports the chosen group-by upward", () => {
    const onGroupByChange = vi.fn();
    open({ onGroupByChange });

    fireEvent.click(
      screen.getByRole("menuitemradio", { name: "tasks:groupBy.priority" }),
    );

    expect(onGroupByChange).toHaveBeenCalledWith("priority");
  });

  it("marks the active group-by as checked", () => {
    open({ groupBy: "assignee" });

    expect(
      screen
        .getByRole("menuitemradio", { name: "tasks:groupBy.assignee" })
        .getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("exposes density as a pressed pair and reports changes", () => {
    const onDensityChange = vi.fn();
    open({ onDensityChange });

    const comfortable = screen.getByRole("button", {
      name: "tasks:display.comfortable",
    });
    const compact = screen.getByRole("button", {
      name: "tasks:display.compact",
    });

    expect(comfortable.getAttribute("aria-pressed")).toBe("true");
    expect(compact.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(compact);
    expect(onDensityChange).toHaveBeenCalledWith("compact");
  });

  it("reflects compact density when it is the active choice", () => {
    open({ density: "compact" });

    expect(
      screen
        .getByRole("button", { name: "tasks:display.compact" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("routes all labels through translation keys", () => {
    open();

    // Hardcoded English would render real words instead of key paths. The
    // group-by label sits inside its radio group, so scope by text content.
    expect(screen.getAllByText(/tasks:groupBy\.label/).length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText("tasks:display.label")).toBeTruthy();
  });
});
