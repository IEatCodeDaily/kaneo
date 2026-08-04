import { fireEvent, render, screen } from "@testing-library/react";

import { beforeEach, describe, expect, it, vi } from "vitest";
import type Task from "@/types/task";
import { TaskRowContent } from "./task-row";

const toggleSelection = vi.fn();
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/components/flag/task-flag-badges", () => ({ default: () => null }));
vi.mock("@/components/task/subtask-of-badge", () => ({ default: () => null }));
vi.mock("@/components/task/task-due-date-badge", () => ({
  default: () => null,
}));
vi.mock("@/hooks/mutations/task/use-delete-task", () => ({
  useDeleteTask: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/queries/organization/use-active-organization", () => ({
  default: () => ({ data: { id: "org-1" } }),
}));
vi.mock("@/store/board", () => ({
  default: (selector: (state: object) => unknown) =>
    selector({ board: { id: "board-1" } }),
}));
vi.mock("@/store/bulk-selection", () => ({
  default: (selector: (state: object) => unknown) =>
    selector({
      toggleSelection,
      selectedTaskIds: new Set(),
      isSelectMode: true,
      focusedTaskId: null,
    }),
}));
vi.mock("@/store/user-preferences", () => ({
  useUserPreferencesStore: (selector: (state: object) => unknown) =>
    selector({
      showAssignees: false,
      showPriority: false,
      showDueDates: false,
      showLabels: false,
      showTaskNumbers: false,
    }),
}));
vi.mock(
  "../kanban-board/task-card-context-menu/task-card-context-menu-content",
  () => ({ default: () => null }),
);
vi.mock("../kanban-board/task-labels", () => ({ default: () => null }));

const task = {
  id: "task-1",
  title: "Pointer target",
  boardId: "board-1",
  externalLinks: [],
} as unknown as Task;

describe("list task checkbox", () => {
  beforeEach(() => toggleSelection.mockClear());

  it("lets pointer-down reach the sortable row but owns the click", () => {
    const onPointerDown = vi.fn();
    render(
      <div onPointerDown={onPointerDown}>
        <TaskRowContent task={task} boardSlug="KAN" isDragging={false} />
      </div>,
    );
    const checkbox = screen.getByRole("checkbox", {
      name: `Select ${task.title}`,
    });
    fireEvent.pointerDown(checkbox);

    expect(onPointerDown).toHaveBeenCalledOnce();

    const hiddenInput = checkbox.parentElement?.querySelector(
      'input[type="checkbox"]',
    );
    expect(hiddenInput).not.toBeNull();
    fireEvent.click(hiddenInput as HTMLInputElement);
    expect(toggleSelection).toHaveBeenCalledOnce();
  });
});
