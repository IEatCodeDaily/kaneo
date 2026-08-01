import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./task-topbar-milestone", () => ({
  default: () => <div data-testid="milestone-control">Milestone</div>,
}));

vi.mock("@/components/flag/task-flag-section", () => ({
  default: () => <div data-testid="flag-control">Flag</div>,
}));

import TaskTopbarControls from "./task-topbar-controls";

afterEach(cleanup);

describe("TaskTopbarControls", () => {
  it("keeps the flag control directly beside the milestone in one topbar row", () => {
    render(
      <TaskTopbarControls
        taskId="task-1"
        boardId="board-1"
        organizationId="org-1"
      />,
    );

    const controls = screen.getByTestId("task-topbar-controls");
    const milestone = within(controls).getByTestId("milestone-control");
    const flag = within(controls).getByTestId("flag-control");

    expect(controls).toHaveClass("flex", "items-center");
    expect([...controls.children]).toEqual([milestone, flag]);
    expect(screen.getAllByTestId("flag-control")).toHaveLength(1);
  });
});
