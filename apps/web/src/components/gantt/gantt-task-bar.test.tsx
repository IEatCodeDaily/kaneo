import { render, screen } from "@testing-library/react";
import { addDays } from "date-fns";
import { afterEach, describe, expect, it, vi } from "vitest";
import type Task from "@/types/task";
import { GanttTaskBar } from "./gantt-task-bar";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/hooks/mutations/task/use-update-task", () => ({
  useUpdateTask: () => ({ mutateAsync: vi.fn() }),
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

afterEach(() => vi.clearAllMocks());

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
});
