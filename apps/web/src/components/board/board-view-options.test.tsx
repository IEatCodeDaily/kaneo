import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BoardGroupBy } from "@/hooks/use-task-filters-with-labels-support";
import { useUserPreferencesStore } from "@/store/user-preferences";
import BoardViewOptions from "./board-view-options";

afterEach(cleanup);
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const baseProps = {
  groupBy: "none" as BoardGroupBy,
  onGroupByChange: vi.fn(),
};

function renderOptions(props: Partial<typeof baseProps> = {}) {
  render(<BoardViewOptions {...baseProps} {...props} />);
}

describe("BoardViewOptions (#61)", () => {
  it("renders separate Group and Display controls", () => {
    renderOptions();
    expect(
      screen.getByRole("button", { name: "tasks:groupBy.label" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "tasks:display.label" }),
    ).toBeTruthy();
  });

  it("reports grouping from the Group menu", () => {
    const onGroupByChange = vi.fn();
    renderOptions({ onGroupByChange });
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:groupBy.label" }),
    );
    fireEvent.click(
      screen.getByRole("menuitemradio", { name: "tasks:groupBy.priority" }),
    );
    expect(onGroupByChange).toHaveBeenCalledWith("priority");
  });

  it("toggles fields shown on task cards", () => {
    useUserPreferencesStore.getState().setShowTaskNumbers(true);
    renderOptions();
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:display.label" }),
    );
    fireEvent.click(
      screen.getByRole("menuitemcheckbox", {
        name: "tasks:display.taskNumbers",
      }),
    );
    expect(useUserPreferencesStore.getState().showTaskNumbers).toBe(false);
  });
});

describe("shared grouping vocabulary", () => {
  /*
    Board and List used to offer DIFFERENT options under the same "Group by"
    label — the board had assignee/priority/label/dueDate, the list had
    status/milestone — from two separate controls in two separate bars.
    Switching view silently changed both the options and the active grouping.
    There is now ONE vocabulary rendered by ONE control, shared by both views.
  */
  const EXPECTED = [
    "tasks:groupBy.none",
    "tasks:groupBy.status",
    "tasks:groupBy.assignee",
    "tasks:groupBy.priority",
    "tasks:groupBy.byLabel",
    "tasks:groupBy.dueDate",
    "tasks:groupBy.milestone",
  ];

  it("offers every option, board and list alike", () => {
    renderOptions();
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:groupBy.label" }),
    );

    for (const labelKey of EXPECTED) {
      expect(
        screen.getByRole("menuitemradio", { name: labelKey }),
        `${labelKey} must be offered`,
      ).toBeTruthy();
    }
    // exact count: an extra or missing option is a vocabulary drift
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(EXPECTED.length);
  });

  it("reports the formerly list-only options through the same callback", () => {
    for (const [labelKey, value] of [
      ["tasks:groupBy.status", "status"],
      ["tasks:groupBy.milestone", "milestone"],
    ] as const) {
      const onGroupByChange = vi.fn();
      renderOptions({ onGroupByChange });
      fireEvent.click(
        screen.getByRole("button", { name: "tasks:groupBy.label" }),
      );
      fireEvent.click(screen.getByRole("menuitemradio", { name: labelKey }));
      expect(onGroupByChange).toHaveBeenCalledWith(value);
      cleanup();
    }
  });

  it("renders exactly one Group by control", () => {
    renderOptions();
    // the duplicate-bar regression: two controls, one row apart
    expect(
      screen.getAllByRole("button", { name: "tasks:groupBy.label" }),
    ).toHaveLength(1);
  });
});
