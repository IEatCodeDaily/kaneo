import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * #107 rejection: "use the generic member-user selector used in board
 * visibility setting", "make the topbar be just Flags with icons, similar
 * style as milestone", "it should be a dropdown similar to milestone, not a
 * modal", "make the flag type more fun ... makes it more popping".
 */

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const createTaskFlagMock = vi.fn();
const resolveTaskFlagMock = vi.fn();
const taskFlags: unknown[] = [];

const flagTypes = [
  {
    id: "type-blocked",
    boardId: "board-1",
    name: "Blocked",
    color: "#ef4444",
    icon: "ban",
    position: 0,
  },
  {
    id: "type-help",
    boardId: "board-1",
    name: "Need Help",
    color: "#3b82f6",
    icon: "life-buoy",
    position: 1,
  },
];

vi.mock("@/hooks/queries/flag/use-get-task-flags", () => ({
  default: () => ({ data: taskFlags }),
}));
vi.mock("@/hooks/queries/flag/use-get-board-flag-types", () => ({
  default: () => ({ data: flagTypes }),
}));
vi.mock("@/hooks/mutations/flag/use-create-task-flag", () => ({
  default: () => ({ mutate: createTaskFlagMock, isPending: false }),
}));
vi.mock("@/hooks/mutations/flag/use-resolve-task-flag", () => ({
  default: () => ({ mutate: resolveTaskFlagMock }),
}));

import TaskFlagPicker from "@/components/flag/task-flag-picker";

const principals = [
  { id: "user-b", kind: "member" as const, name: "User B" },
  { id: "team-1", kind: "team" as const, name: "Team One" },
];

afterEach(() => {
  cleanup();
  createTaskFlagMock.mockReset();
  resolveTaskFlagMock.mockReset();
  taskFlags.length = 0;
});

function open() {
  render(
    <TaskFlagPicker
      taskId="task-1"
      boardId="board-1"
      principals={principals}
    />,
  );
  fireEvent.click(screen.getByTestId("task-flag-trigger"));
}

describe("TaskFlagPicker (#107)", () => {
  it("opens as a popover from the topbar rather than a modal dialog", () => {
    open();

    expect(screen.getByTestId("flag-type-options")).toBeTruthy();
    // Base UI popovers legitimately use role="dialog"; the real distinction is
    // the popover slot vs the modal dialog surface the ticket rejected.
    expect(
      document.querySelector("[data-slot='popover-popup']"),
    ).not.toBeNull();
    expect(document.querySelector("[data-slot='dialog-popup']")).toBeNull();
  });

  it("renders each flag type as a coloured chip, not a native dropdown", () => {
    open();

    const blocked = screen.getByTestId("flag-type-type-blocked");
    expect(blocked.querySelector("svg")).not.toBeNull();
    expect(blocked.getAttribute("style")).toContain("rgb(239, 68, 68)");
    expect(screen.getByTestId("flag-type-type-help")).toBeTruthy();
    // A <select> would mean the old dropdown survived.
    expect(document.querySelector("select")).toBeNull();
  });

  it("targets a team through the shared principal selector", () => {
    open();

    fireEvent.click(screen.getByTestId("flag-type-type-blocked"));
    fireEvent.click(screen.getByLabelText("flags:dialog.targetUser"));
    fireEvent.click(screen.getByRole("option", { name: /Team One/ }));
    fireEvent.click(screen.getByText("flags:dialog.submit"));

    expect(createTaskFlagMock).toHaveBeenCalledWith({
      taskId: "task-1",
      flagTypeId: "type-blocked",
      targetUserId: null,
      targetTeamId: "team-1",
      note: null,
    });
  });

  it("shows the active flag's own type and colour on the trigger", () => {
    taskFlags.push({
      id: "flag-1",
      taskId: "task-1",
      flagTypeId: "type-blocked",
      flagTypeName: "Blocked",
      flagTypeColor: "#ef4444",
      flagTypeIcon: "ban",
      flaggedBy: "user-a",
      flaggedByName: "User A",
      targetUserId: "user-b",
      targetUserName: "User B",
      targetTeamId: null,
      targetTeamName: null,
      note: null,
      resolvedAt: null,
      resolvedBy: null,
      resolvedByName: null,
      createdAt: "2026-08-01T00:00:00.000Z",
    });

    render(
      <TaskFlagPicker
        taskId="task-1"
        boardId="board-1"
        principals={principals}
      />,
    );

    const trigger = screen.getByTestId("task-flag-trigger");
    expect(trigger.textContent).toContain("Blocked");
    expect(
      trigger.querySelector('span[style*="rgb(239, 68, 68)"]'),
    ).not.toBeNull();

    // #107: unflagging needs a mandatory note, and that field lives in the
    // activity feed — the picker no longer resolves flags directly.
    fireEvent.click(trigger);
    expect(screen.getByTestId("flag-unflag-flag-1")).toBeTruthy();
    expect(resolveTaskFlagMock).not.toHaveBeenCalled();
  });
});
