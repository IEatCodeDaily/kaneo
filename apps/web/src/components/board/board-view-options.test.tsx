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
