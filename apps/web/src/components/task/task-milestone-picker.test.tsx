import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TaskMilestonePicker from "./task-milestone-picker";

const mocks = vi.hoisted(() => ({
  milestones: [] as Array<{ id: string; name: string; status: string }>,
  assign: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/hooks/queries/milestone/use-get-milestones-by-board", () => ({
  default: () => ({ data: mocks.milestones, isLoading: false }),
}));

vi.mock("@/hooks/mutations/milestone/use-assign-milestone-to-task", () => ({
  default: () => ({ mutateAsync: mocks.assign, isPending: false }),
}));

vi.mock("@/lib/toast", () => ({
  toast: {
    success: (...args: unknown[]) => mocks.toastSuccess(...args),
    error: (...args: unknown[]) => mocks.toastError(...args),
  },
}));

function renderPicker(milestoneId: string | null = null) {
  return render(
    <TaskMilestonePicker
      taskId="task-1"
      boardId="board-1"
      milestoneId={milestoneId}
    />,
  );
}

describe("TaskMilestonePicker", () => {
  afterEach(() => {
    mocks.milestones.length = 0;
    mocks.assign.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
    cleanup();
  });

  it("shows the assigned milestone name on the trigger", () => {
    mocks.milestones.push({ id: "m-1", name: "Beta", status: "active" });

    renderPicker("m-1");

    expect(screen.getByTestId("task-milestone-trigger")).toHaveTextContent(
      "Beta",
    );
  });

  it("lists the board milestones as selectable options", () => {
    mocks.milestones.push(
      { id: "m-1", name: "Beta", status: "active" },
      { id: "m-2", name: "GA", status: "planned" },
    );

    renderPicker(null);
    fireEvent.click(screen.getByTestId("task-milestone-trigger"));

    expect(screen.getByTestId("task-milestone-option-m-1")).toHaveTextContent(
      "Beta",
    );
    expect(screen.getByTestId("task-milestone-option-m-2")).toHaveTextContent(
      "GA",
    );
  });

  it("assigns the picked milestone to the task", async () => {
    mocks.milestones.push({ id: "m-2", name: "GA", status: "planned" });

    renderPicker(null);
    fireEvent.click(screen.getByTestId("task-milestone-trigger"));
    fireEvent.click(screen.getByTestId("task-milestone-option-m-2"));

    await vi.waitFor(() => {
      expect(mocks.assign).toHaveBeenCalledWith({
        boardId: "board-1",
        taskId: "task-1",
        milestoneId: "m-2",
      });
    });
  });

  it("unassigns via the clear row by sending a null milestoneId", async () => {
    mocks.milestones.push({ id: "m-1", name: "Beta", status: "active" });

    renderPicker("m-1");
    fireEvent.click(screen.getByTestId("task-milestone-trigger"));
    fireEvent.click(screen.getByTestId("task-milestone-clear"));

    await vi.waitFor(() => {
      expect(mocks.assign).toHaveBeenCalledWith({
        boardId: "board-1",
        taskId: "task-1",
        milestoneId: null,
      });
    });
  });

  it("re-picking the current milestone unassigns it", async () => {
    mocks.milestones.push({ id: "m-1", name: "Beta", status: "active" });

    renderPicker("m-1");
    fireEvent.click(screen.getByTestId("task-milestone-trigger"));
    fireEvent.click(screen.getByTestId("task-milestone-option-m-1"));

    await vi.waitFor(() => {
      expect(mocks.assign).toHaveBeenCalledWith({
        boardId: "board-1",
        taskId: "task-1",
        milestoneId: null,
      });
    });
  });

  it("uses translation keys instead of hardcoded English", () => {
    renderPicker(null);

    expect(screen.getByTestId("task-milestone-trigger")).toHaveTextContent(
      "tasks:milestone.none",
    );
  });
});
