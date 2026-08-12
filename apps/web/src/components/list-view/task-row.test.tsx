import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
const preferences = {
  showAssignees: false,
  showPriority: false,
  showDueDates: false,
  showLabels: false,
  showTaskNumbers: false,
};
vi.mock("@/store/user-preferences", () => ({
  useUserPreferencesStore: (selector: (state: object) => unknown) =>
    selector(preferences),
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

describe("list row status placement", () => {
  /*
    Status is structural metadata and belongs at the head of the row, left of
    the ticket ID. It used to render after the title alongside labels and PRs,
    so its horizontal position drifted with title length and it read as an
    afterthought rather than a column.
  */
  const numberedTask = {
    id: "task-1",
    number: 42,
    title: "Pointer target",
    boardId: "board-1",
    externalLinks: [],
  } as unknown as Task;

  const statusBadge = <span data-testid="list-task-status">In Progress</span>;

  beforeEach(() => {
    // the ticket ID only renders when this preference is on
    preferences.showTaskNumbers = true;
  });

  afterEach(() => {
    preferences.showTaskNumbers = false;
    // this suite renders the same testid repeatedly; without an explicit
    // cleanup the previous row stays mounted and queries find two matches
    cleanup();
  });

  it("renders status before the ticket ID", () => {
    const { container } = render(
      <TaskRowContent
        task={numberedTask}
        boardSlug="KAN"
        isDragging={false}
        statusBadge={statusBadge}
      />,
    );

    const status = screen.getByTestId("list-task-status");
    const id = screen.getByText("KAN-42");

    // Position, not mere presence: asserting both exist would still pass with
    // the badge back on the right-hand side.
    expect(
      status.compareDocumentPosition(id) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(container).toBeTruthy();
  });

  it("renders status before the title", () => {
    render(
      <TaskRowContent
        task={numberedTask}
        boardSlug="KAN"
        isDragging={false}
        statusBadge={statusBadge}
      />,
    );

    const status = screen.getByTestId("list-task-status");
    const title = screen.getByText("Pointer target");

    expect(
      status.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("omits status entirely when none is supplied", () => {
    render(
      <TaskRowContent task={numberedTask} boardSlug="KAN" isDragging={false} />,
    );

    expect(screen.queryByTestId("list-task-status")).toBeNull();
  });
});
