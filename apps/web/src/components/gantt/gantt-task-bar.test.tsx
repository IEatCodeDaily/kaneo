import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { addDays } from "date-fns";
import { afterEach, describe, expect, it, vi } from "vitest";
import type Task from "@/types/task";
import { GanttTaskBar } from "./gantt-task-bar";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
const updateTask = vi.fn();
vi.mock("@/hooks/mutations/task/use-update-task", () => ({
  useUpdateTask: () => ({ mutateAsync: updateTask }),
}));

const start = new Date("2026-08-03T00:00:00Z");
const task = {
  id: "task-1",
  title: "Compact handles",
  number: 212,
  status: "planned",
  priority: null,
  startDate: start.toISOString(),
  dueDate: addDays(start, 2).toISOString(),
  position: 0,
  createdAt: start.toISOString(),
  userId: null,
  assigneeId: null,
  assigneeName: null,
  boardId: "board-1",
  scheduleStart: start,
  scheduleEnd: addDays(start, 2),
} as Task & { scheduleStart: Date; scheduleEnd: Date };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("GanttTaskBar resize handles", () => {
  it("keeps a large pointer target around a compact visible handle", () => {
    render(
      <GanttTaskBar
        task={task}
        timeline={{
          days: Array.from({ length: 7 }, (_, index) => addDays(start, index)),
          rangeStart: start,
          gridTemplateColumns: "repeat(7, 40px)",
        }}
        pixelsPerDay={40}
        onOpenTask={vi.fn()}
      />,
    );

    for (const handle of [
      screen.getByRole("button", { name: "tasks:gantt.resizeStart" }),
      screen.getByRole("button", { name: "tasks:gantt.resizeDue" }),
    ]) {
      expect(handle).toHaveClass("w-6", "touch-none", "after:w-1.5");
    }
  });

  it("moves both dates by the dropped day while preserving duration", async () => {
    updateTask.mockResolvedValue(undefined);
    render(
      <GanttTaskBar
        task={task}
        timeline={{
          days: Array.from({ length: 7 }, (_, index) => addDays(start, index)),
          rangeStart: start,
          gridTemplateColumns: "repeat(7, 40px)",
        }}
        pixelsPerDay={40}
        onOpenTask={vi.fn()}
      />,
    );

    const bar = screen.getByRole("button", {
      name: "tasks:gantt.taskAriaLabel",
    });
    fireEvent.pointerDown(bar, { button: 0, clientX: 20 });
    fireEvent.pointerMove(window, { clientX: 60 });
    fireEvent.pointerUp(window, { clientX: 60 });

    await vi.waitFor(() => expect(updateTask).toHaveBeenCalledOnce());
    const saved = updateTask.mock.calls[0]?.[0];
    expect(saved).toBeDefined();
    expect(new Date(saved.startDate).getDate()).toBe(start.getDate() + 1);
    expect(new Date(saved.dueDate).getDate()).toBe(start.getDate() + 3);
  });
});
