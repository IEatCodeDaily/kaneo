import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { addDays } from "date-fns";
import { afterEach, describe, expect, it, vi } from "vitest";
import type Task from "@/types/task";
import { GanttTaskBar, resolveResizeHandleWidth } from "./gantt-task-bar";

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

function renderBar(overrides?: {
  task?: Partial<Task & { scheduleStart: Date; scheduleEnd: Date }>;
  pixelsPerDay?: number;
  dayCount?: number;
}) {
  const pixelsPerDay = overrides?.pixelsPerDay ?? 40;
  const dayCount = overrides?.dayCount ?? 7;
  return render(
    <GanttTaskBar
      task={{ ...task, ...overrides?.task } as typeof task}
      timeline={{
        days: Array.from({ length: dayCount }, (_, index) =>
          addDays(start, index),
        ),
        rangeStart: start,
        gridTemplateColumns: `repeat(${dayCount}, ${pixelsPerDay}px)`,
      }}
      pixelsPerDay={pixelsPerDay}
      onOpenTask={vi.fn()}
    />,
  );
}

describe("resolveResizeHandleWidth", () => {
  it("sizes the handle as ~15% of a single day column", () => {
    expect(resolveResizeHandleWidth(40)).toBe(6);
    expect(resolveResizeHandleWidth(60)).toBe(9);
  });

  it("stays slim on very wide day columns", () => {
    // Capped, so a zoomed-in timeline doesn't get a chunky slab of handle.
    expect(resolveResizeHandleWidth(400)).toBe(10);
  });

  it("stays hittable on very narrow day columns", () => {
    expect(resolveResizeHandleWidth(4)).toBe(4);
    expect(resolveResizeHandleWidth(0)).toBe(4);
  });

  it("leaves room to drag inside a single-day bar", () => {
    // Regression: two 24px handles inside a ~32px single-day bar swallowed the
    // whole bar, so every pointerdown hit a resize edge and drag-to-reschedule
    // was impossible.
    const pixelsPerDay = 40;
    const singleDayBarWidth = pixelsPerDay - 8; // `mx-1` trims 4px per side
    const handle = resolveResizeHandleWidth(pixelsPerDay, singleDayBarWidth);
    const moveZone = singleDayBarWidth - handle * 2;
    expect(handle).toBeGreaterThan(0);
    expect(moveZone).toBeGreaterThanOrEqual(12);
  });

  it("never starves the move zone at any zoom level", () => {
    // Real column widths: day 2.75rem, week 1rem, month 0.375rem (see
    // COLUMN_WIDTH_REM in gantt-timeline.ts). At week/month a single-day bar is
    // only 8px/-2px wide, so handles must drop out rather than eat the bar.
    for (const pixelsPerDay of [44, 50, 16, 20, 6, 8]) {
      for (const dayCount of [1, 2, 5, 30]) {
        const barWidth = pixelsPerDay * dayCount - 8;
        const handle = resolveResizeHandleWidth(pixelsPerDay, barWidth);
        if (handle === 0) continue; // move-only bar, nothing to starve
        expect(barWidth - handle * 2).toBeGreaterThanOrEqual(12);
      }
    }
  });

  it("drops handles on a single-day bar at week and month zoom", () => {
    // 1rem/day -> an 8px bar; 0.375rem/day -> a negative bar. Neither can host
    // two handles AND stay draggable, and dragging wins.
    expect(resolveResizeHandleWidth(16, 16 - 8)).toBe(0);
    expect(resolveResizeHandleWidth(6, 6 - 8)).toBe(0);
  });
});

describe("GanttTaskBar resize handles", () => {
  it("keeps a large pointer target around a compact visible handle", () => {
    renderBar();

    for (const handle of [
      screen.getByRole("button", { name: "tasks:gantt.resizeStart" }),
      screen.getByRole("button", { name: "tasks:gantt.resizeDue" }),
    ]) {
      expect(handle).toHaveClass("touch-none", "after:w-1.5");
      expect(handle.style.width).toBe("6px");
    }
  });

  it("keeps BOTH resize handles and a move zone on a single-day bar", () => {
    renderBar({
      task: { dueDate: start.toISOString(), scheduleEnd: start },
      pixelsPerDay: 40,
    });

    // Handles must survive — a single-day task still needs to be resizable.
    expect(
      screen.getByRole("button", { name: "tasks:gantt.resizeStart" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "tasks:gantt.resizeDue" }),
    ).toBeInTheDocument();
    // ...and so does the move target, which is what makes the bar draggable.
    expect(
      screen.getByRole("button", { name: "tasks:gantt.taskAriaLabel" }),
    ).toBeInTheDocument();
  });

  it("drags a single-day bar to a new day", async () => {
    updateTask.mockResolvedValue(undefined);
    renderBar({
      task: { dueDate: start.toISOString(), scheduleEnd: start },
      pixelsPerDay: 40,
    });

    const bar = screen.getByRole("button", {
      name: "tasks:gantt.taskAriaLabel",
    });
    fireEvent.pointerDown(bar, { button: 0, clientX: 20 });
    fireEvent.pointerMove(window, { clientX: 100 });
    fireEvent.pointerUp(window, { clientX: 100 });

    await vi.waitFor(() => expect(updateTask).toHaveBeenCalledOnce());
    const saved = updateTask.mock.calls[0]?.[0];
    expect(new Date(saved.startDate).getDate()).toBe(start.getDate() + 2);
    expect(new Date(saved.dueDate).getDate()).toBe(start.getDate() + 2);
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
