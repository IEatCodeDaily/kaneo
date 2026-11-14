import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./task-topbar-milestone", () => ({
  default: () => <div data-testid="milestone-control">Milestone</div>,
}));

vi.mock("@/components/flag/task-flag-section", () => ({
  default: () => <div data-testid="flag-control">Flag</div>,
}));

vi.mock("./task-synced-issue-property", () => ({
  default: () => <div data-testid="synced-issue">Synced issue</div>,
}));

import TaskTopbarControls from "./task-topbar-controls";

afterEach(cleanup);

describe("TaskTopbarControls", () => {
  it("shows milestone and flag in the header (2026-11 owner direction)", () => {
    render(
      <TaskTopbarControls
        taskId="task-1"
        boardId="board-1"
        organizationId="org-1"
      />,
    );
    const controls = screen.getByTestId("task-topbar-controls");
    expect(within(controls).getByTestId("milestone-control")).toBeTruthy();
    expect(within(controls).getByTestId("flag-control")).toBeTruthy();
  });

  it("shows the synced issue in the header, after milestone and flag", () => {
    render(
      <TaskTopbarControls
        taskId="task-1"
        boardId="board-1"
        organizationId="org-1"
      />,
    );

    const header = screen.getByTestId("task-topbar-controls");
    expect(within(header).getByTestId("synced-issue")).toBeTruthy();
    expect(screen.queryByTestId("task-properties-status-bar")).toBeNull();
    expect(header.lastElementChild).toBe(screen.getByTestId("synced-issue"));
  });
});
