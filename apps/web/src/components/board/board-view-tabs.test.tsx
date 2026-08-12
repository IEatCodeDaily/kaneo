import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardViewTabs } from "./board-view-tabs";

afterEach(cleanup);

const views = [
  { value: "table", label: "Table", icon: <span>table icon</span> },
  { value: "timeline", label: "Timeline", icon: <span>timeline icon</span> },
];

describe("BoardViewTabs", () => {
  it("uses accessible tabs and preserves mobile overflow", () => {
    const onValueChange = vi.fn();
    render(
      <BoardViewTabs
        aria-label="Board overview views"
        value="table"
        views={views}
        onValueChange={onValueChange}
      />,
    );

    const table = screen.getByRole("tab", { name: /Table/ });
    const timeline = screen.getByRole("tab", { name: /Timeline/ });

    expect(
      screen.getByRole("tablist", { name: "Board overview views" }),
    ).toBeTruthy();
    expect(table.getAttribute("aria-selected")).toBe("true");
    fireEvent.click(timeline);
    expect(onValueChange.mock.calls[0]?.[0]).toBe("timeline");
    expect(table.getAttribute("tabindex")).toBe("0");
    expect(screen.getByTestId("view-tabs-scroller").className).toContain(
      "overflow-x-auto",
    );
    const tabList = timeline.closest("[data-slot=tabs-list]");
    // Board and repo switchers now render ONE shared control, so the geometry
    // asserted here is the repo switcher's: a square-cornered `rounded-lg` nav
    // rather than the board's former fully-rounded pill.
    expect(tabList?.className.split(/\s+/)).toContain("rounded-lg");
    expect(tabList?.className).not.toContain("overflow-x-auto");
    expect(table.className.split(/\s+/)).toContain("rounded-md");
    expect(table).toHaveAccessibleName(/Table/);
    expect(screen.getByText("Table")).toHaveClass("hidden", "2xl:inline");
  });

  it("renders the same control the repo switcher uses", () => {
    // Guards the unification: if board tabs ever regrow their own markup, the
    // shared component's testid disappears and this fails.
    render(
      <BoardViewTabs
        aria-label="Board overview views"
        value="table"
        views={views}
        onValueChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId("view-tabs")).toBeTruthy();
    expect(screen.getByTestId("view-tab-table")).toBeTruthy();
    expect(screen.getByTestId("view-tab-timeline")).toBeTruthy();
  });

  it("marks only the inactive tabs out of the tab order", () => {
    render(
      <BoardViewTabs
        aria-label="Board overview views"
        value="table"
        views={views}
        onValueChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId("view-tab-table").getAttribute("tabindex")).toBe(
      "0",
    );
    expect(
      screen.getByTestId("view-tab-timeline").getAttribute("tabindex"),
    ).toBe("-1");
  });
});
