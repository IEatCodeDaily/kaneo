import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { addDays } from "date-fns";
import { afterEach, describe, expect, it, vi } from "vitest";
import type Task from "@/types/task";
import { GanttUnscheduledTrack } from "./gantt-unscheduled-track";

/**
 * #244 regression: "timeline drag and drop doesn't work".
 *
 * The move/resize gestures on existing bars did work, but on the real board 200
 * of 201 tickets had no dates, so there were no bars to drag — the feature was
 * unusable in practice. An unscheduled row now exposes a full-width track whose
 * drag paints and PERSISTS a date range.
 *
 * These tests exercise the shipped pointer handlers on the real component (no
 * re-implementation of the maths) and assert the persisted payload.
 */

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) =>
      opts?.defaultValue ?? key,
  }),
}));

const updateTask = vi.fn();
vi.mock("@/hooks/mutations/task/use-update-task", () => ({
  useUpdateTask: () => ({ mutateAsync: updateTask }),
}));
// vi.mock factories are hoisted above const initialisation, so the spy must be
// created inside the factory and read back through the mocked module.
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));
const { toast } = await import("@/lib/toast");
const toastError = vi.mocked(toast.error);

const RANGE_START = new Date("2026-08-03T00:00:00Z");
const DAYS = Array.from({ length: 10 }, (_, index) =>
  addDays(RANGE_START, index),
);
const PX_PER_DAY = 40;

const unscheduledTask = {
  id: "task-1",
  title: "Needs scheduling",
  number: 244,
  status: "to-do",
  priority: "no-priority",
  startDate: null,
  dueDate: null,
  position: 3,
  createdAt: RANGE_START.toISOString(),
  userId: "user-1",
  assigneeId: null,
  assigneeName: null,
  boardId: "board-1",
  description: "",
} as unknown as Task;

function renderTrack(overrides: Partial<{ readOnly: boolean }> = {}) {
  const onOpenTask = vi.fn();
  const view = render(
    <GanttUnscheduledTrack
      task={unscheduledTask}
      timeline={{
        days: DAYS,
        rangeStart: RANGE_START,
        gridTemplateColumns: `repeat(${DAYS.length}, ${PX_PER_DAY}px)`,
      }}
      pixelsPerDay={PX_PER_DAY}
      hint="No dates - drag to schedule"
      onOpenTask={onOpenTask}
      readOnly={overrides.readOnly}
    />,
  );
  return { ...view, onOpenTask };
}

/**
 * jsdom gives every element a zero-size rect, so the component's
 * offset-from-track-left maths would collapse to day 0. Pin a real rect.
 */
function stubTrackRect(track: HTMLElement) {
  track.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: DAYS.length * PX_PER_DAY,
      bottom: 30,
      width: DAYS.length * PX_PER_DAY,
      height: 30,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

/** Drag from one x to another using the real window-level listeners. */
function drag(track: HTMLElement, fromX: number, toX: number) {
  fireEvent.pointerDown(track, { clientX: fromX, button: 0 });
  fireEvent(
    window,
    new PointerEvent("pointermove", { clientX: toX, bubbles: true }),
  );
  fireEvent(
    window,
    new PointerEvent("pointerup", { clientX: toX, bubbles: true }),
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("#244 drag-to-schedule on an unscheduled timeline row", () => {
  it("persists a start and due date spanning the dragged columns", async () => {
    updateTask.mockResolvedValue({});
    renderTrack();
    const track = screen.getByTestId("gantt-unscheduled-track");
    stubTrackRect(track);

    // Drag across day index 1 -> day index 4.
    drag(track, 1.5 * PX_PER_DAY, 4.5 * PX_PER_DAY);
    await vi.waitFor(() => expect(updateTask).toHaveBeenCalledTimes(1));

    const payload = updateTask.mock.calls[0][0];
    expect(payload.id).toBe("task-1");
    expect(new Date(payload.startDate).toISOString()).toBe(
      DAYS[1].toISOString(),
    );
    expect(new Date(payload.dueDate).toISOString()).toBe(DAYS[4].toISOString());
  });

  it("normalises a right-to-left drag so start precedes due", async () => {
    updateTask.mockResolvedValue({});
    renderTrack();
    const track = screen.getByTestId("gantt-unscheduled-track");
    stubTrackRect(track);

    // Same span, dragged backwards.
    drag(track, 6.5 * PX_PER_DAY, 2.5 * PX_PER_DAY);
    await vi.waitFor(() => expect(updateTask).toHaveBeenCalledTimes(1));

    const payload = updateTask.mock.calls[0][0];
    expect(new Date(payload.startDate).getTime()).toBeLessThan(
      new Date(payload.dueDate).getTime(),
    );
    expect(new Date(payload.startDate).toISOString()).toBe(
      DAYS[2].toISOString(),
    );
    expect(new Date(payload.dueDate).toISOString()).toBe(DAYS[6].toISOString());
  });

  it("treats a click with no movement as opening the task, not scheduling it", () => {
    const { onOpenTask } = renderTrack();
    const track = screen.getByTestId("gantt-unscheduled-track");
    stubTrackRect(track);

    drag(track, 3 * PX_PER_DAY, 3 * PX_PER_DAY + 1);

    expect(updateTask).not.toHaveBeenCalled();
    expect(onOpenTask).toHaveBeenCalledTimes(1);
  });

  it("clamps a drag past the end of the track to the last rendered day", async () => {
    updateTask.mockResolvedValue({});
    renderTrack();
    const track = screen.getByTestId("gantt-unscheduled-track");
    stubTrackRect(track);

    drag(track, 8.5 * PX_PER_DAY, 40 * PX_PER_DAY);
    await vi.waitFor(() => expect(updateTask).toHaveBeenCalledTimes(1));

    const payload = updateTask.mock.calls[0][0];
    expect(new Date(payload.dueDate).toISOString()).toBe(
      DAYS[DAYS.length - 1].toISOString(),
    );
  });

  it("surfaces a failed save instead of leaving a phantom bar", async () => {
    updateTask.mockRejectedValue(new Error("nope"));
    renderTrack();
    const track = screen.getByTestId("gantt-unscheduled-track");
    stubTrackRect(track);

    drag(track, 1.5 * PX_PER_DAY, 5.5 * PX_PER_DAY);
    await vi.waitFor(() => expect(toastError).toHaveBeenCalledWith("nope"));
  });

  it("gives foreign read-only rows no drag track at all", () => {
    renderTrack({ readOnly: true });

    expect(screen.queryByTestId("gantt-unscheduled-track")).toBeNull();
    expect(updateTask).not.toHaveBeenCalled();
  });
});
