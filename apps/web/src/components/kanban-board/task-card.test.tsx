import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type Task from "@/types/task";
import { TaskCardContent } from "./task-card";

const navigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
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
    selector({ board: { id: "board-1", slug: "KAN" } }),
}));
vi.mock("@/store/bulk-selection", () => ({
  default: (selector: (state: object) => unknown) =>
    selector({
      toggleSelection: vi.fn(),
      selectedTaskIds: new Set(),
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
vi.mock("./task-card-context-menu/task-card-context-menu-content", () => ({
  default: () => (
    <button type="button" role="menuitem">
      Copy task link
    </button>
  ),
}));
vi.mock("./task-labels", () => ({ default: () => null }));

const task = {
  id: "task-1",
  title: "Context menu task",
  boardId: "board-1",
  number: 253,
  status: "todo",
  priority: "medium",
  externalLinks: [],
} as unknown as Task;

describe("TaskCardContent", () => {
  beforeEach(() => {
    navigate.mockClear();
    window.history.replaceState({}, "", "/dashboard");
  });

  it("opens the existing task actions on right click without changing left click", async () => {
    render(<TaskCardContent task={task} isDragging={false} />);

    const card = screen.getByText(task.title).closest("div.group");
    expect(card).not.toBeNull();

    fireEvent.contextMenu(card as HTMLElement);
    expect(
      await screen.findByRole("menuitem", { name: "Copy task link" }),
    ).toBeVisible();
    expect(navigate).not.toHaveBeenCalled();

    fireEvent.click(card as HTMLElement);
    expect(navigate).toHaveBeenCalledWith({
      to: ".",
      search: { taskId: task.id },
    });
  });
});
