import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import type { BoardWithTasks } from "@/types/board";
import TaskCard from "../task-card";

type ColumnDropzoneProps = {
  column: BoardWithTasks["columns"][number];
  disableDragDrop?: boolean;
  onIsOverChange?: (isOver: boolean) => void;
};

/**
 * Cards rendered in the first pass. Roughly two screens' worth — enough that
 * the user never sees the boundary, since only ~10 fit on screen.
 */
const INITIAL_WINDOW = 30;

/** Cards added per follow-up chunk. */
const CHUNK = 40;

export function ColumnDropzone({
  column,
  disableDragDrop = false,
  onIsOverChange,
}: ColumnDropzoneProps) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: {
      type: "column",
      column,
    },
  });

  useEffect(() => {
    onIsOverChange?.(isOver);
  }, [isOver, onIsOverChange]);

  const total = column.tasks.length;

  /**
   * Progressive mount.
   *
   * Every card calls useSortable, which registers a droppable node with
   * dnd-kit; a 180-task column therefore does 180 registrations in the single
   * synchronous render that a view switch triggers (measured: one 2.2s long
   * task on Gantt -> Tasks). Only ~10 cards are ever on screen, so the first
   * paint renders a small window and the rest are appended in idle chunks.
   *
   * This keeps drag-and-drop working on every card, unlike true windowing
   * which would unmount off-screen cards and break dnd-kit's registry.
   *
   * ponytail: chunked mount, not virtualization. Total work is unchanged, it's
   * just spread across frames so nothing blocks the click. Swap in
   * @tanstack/react-virtual (and rework the SortableContext items) if columns
   * grow past a few thousand cards.
   */
  const [mountCount, setMountCount] = useState(() =>
    Math.min(total, INITIAL_WINDOW),
  );

  // Reset when the column identity or size changes (board switch, filter).
  // Switching boards can yield the same task count, so column.id is required
  // here even though biome sees it as redundant — without it the window stays
  // wherever the previous board's chunking left it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: column.id resets the window on board switch
  useEffect(() => {
    setMountCount(Math.min(total, INITIAL_WINDOW));
  }, [column.id, total]);

  useEffect(() => {
    if (mountCount >= total) return;
    // requestIdleCallback isn't in Safari; the timeout fallback is fine here
    // because the work is already off the critical path.
    const schedule =
      typeof requestIdleCallback === "function"
        ? requestIdleCallback
        : (cb: () => void) => setTimeout(cb, 16);
    const cancel =
      typeof cancelIdleCallback === "function"
        ? cancelIdleCallback
        : clearTimeout;

    const handle = schedule(() => {
      setMountCount((current) => Math.min(total, current + CHUNK));
    });
    return () => cancel(handle as never);
  }, [mountCount, total]);

  const visibleTasks = useMemo(
    () => column.tasks.slice(0, mountCount),
    [column.tasks, mountCount],
  );

  // Reserve height for not-yet-mounted cards so the scrollbar doesn't jump as
  // chunks land.
  const pendingCount = total - visibleTasks.length;

  return (
    <div ref={setNodeRef} className="flex-1 min-h-0">
      <SortableContext
        items={column.tasks}
        strategy={verticalListSortingStrategy}
      >
        <div
          className={cn(
            "flex flex-col gap-2",
            // Container-level entry animation. This replaces the old per-card
            // motion.div (185 spring instances per render); one CSS transition
            // on the wrapper reads the same but costs nothing per card.
            "transition-[translate,opacity] duration-150 ease-out",
            "starting:-translate-y-1 starting:opacity-0",
            "motion-reduce:starting:translate-y-0",
          )}
        >
          {/* content-visibility lets the browser skip layout/paint for cards
              that are scrolled out of view. */}
          {visibleTasks.map((task) => (
            <div
              key={task.id}
              style={{
                contentVisibility: "auto",
                containIntrinsicSize: "auto 92px",
              }}
            >
              <TaskCard task={task} disableDragDrop={disableDragDrop} />
            </div>
          ))}
          {pendingCount > 0 ? (
            <div
              aria-hidden="true"
              style={{ height: `${pendingCount * 102}px` }}
            />
          ) : null}
          {total === 0 ? (
            <div className="rounded-lg border border-dashed border-border/70 px-3 py-6 text-center text-xs text-muted-foreground">
              {t("tasks:column.empty")}
            </div>
          ) : null}
        </div>
      </SortableContext>
    </div>
  );
}
