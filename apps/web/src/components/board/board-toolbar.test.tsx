import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * #61 rework: search, view options and grouping were rejected for living in
 * the page header. They must sit in the SAME bar as Filter and Sort. These
 * tests assert co-location by querying one rendered toolbar for all of them.
 */

afterEach(cleanup);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import BoardToolbar from "./board-toolbar";

const baseProps = {
  board: { id: "b1", name: "Board", columns: [] } as never,
  filters: {} as never,
  updateFilter: vi.fn(),
  updateLabelFilter: vi.fn(),
  clearFilters: vi.fn(),
  hasActiveFilters: false,
  users: { members: [] },
  organizationLabels: [],
  viewMode: "board" as const,
  setViewMode: vi.fn(),
  sort: { field: "position", direction: "asc" } as never,
  onSortChange: vi.fn(),
  searchQuery: "",
  onSearchQueryChange: vi.fn(),
  groupBy: "none" as never,
  onGroupByChange: vi.fn(),
  density: "comfortable" as never,
  onDensityChange: vi.fn(),
};

describe("BoardToolbar", () => {
  it("puts search and view options in the same bar as filter and sort", () => {
    const { container } = render(<BoardToolbar {...baseProps} />);

    const bar = container.firstElementChild as HTMLElement;
    const scope = (name: RegExp) =>
      Array.from(bar.querySelectorAll("button")).filter((button) =>
        name.test(`${button.textContent} ${button.getAttribute("aria-label")}`),
      );

    expect(
      scope(/boardFilters\.filterBy|actions\.filter/).length,
    ).toBeGreaterThan(0);
    expect(scope(/sort/i).length).toBeGreaterThan(0);
    expect(scope(/groupBy\.label/).length).toBeGreaterThan(0);
    expect(scope(/display\.label/).length).toBeGreaterThan(0);
    expect(
      bar.querySelector('input[placeholder="tasks:boardSearchPlaceholder"]'),
    ).toBeTruthy();
  });

  it("reports search typing upward", () => {
    const onSearchQueryChange = vi.fn();
    render(
      <BoardToolbar {...baseProps} onSearchQueryChange={onSearchQueryChange} />,
    );

    fireEvent.change(
      screen.getByPlaceholderText("tasks:boardSearchPlaceholder"),
      { target: { value: "login bug" } },
    );

    expect(onSearchQueryChange).toHaveBeenCalledWith("login bug");
  });

  it("clears an active search from the input", () => {
    const onSearchQueryChange = vi.fn();
    render(
      <BoardToolbar
        {...baseProps}
        onSearchQueryChange={onSearchQueryChange}
        searchQuery="login bug"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "tasks:boardClearSearch" }),
    );

    expect(onSearchQueryChange).toHaveBeenCalledWith("");
  });

  it("exposes grouping from the toolbar view options control", () => {
    const onGroupByChange = vi.fn();
    render(<BoardToolbar {...baseProps} onGroupByChange={onGroupByChange} />);

    fireEvent.click(screen.getByRole("button", { name: /groupBy\.label/ }));
    fireEvent.click(
      screen.getByRole("menuitemradio", { name: "tasks:groupBy.priority" }),
    );

    expect(onGroupByChange).toHaveBeenCalledWith("priority");
  });
});
