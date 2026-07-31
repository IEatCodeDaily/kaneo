import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { groupTasks } from "@/hooks/use-task-filters-with-labels-support";
import { cn } from "@/lib/cn";
import {
  collapseToggleLabel,
  groupSameBucketSubtasks,
} from "@/lib/group-subtasks";
import type { BoardWithTasks } from "@/types/board";
import { useBoardGroupBy } from "../board-view-context";
import TaskCard from "../task-card";

type ColumnDropzoneProps = {
  column: BoardWithTasks["columns"][number];
  disableDragDrop?: boolean;
  onIsOverChange?: (isOver: boolean) => void;
};

/**
 * Groups rendered in the first pass. Roughly two screens' worth — enough that
 * the user never sees the boundary, since only ~10 cards fit on screen.
 */
const INITIAL_WINDOW = 30;

/** Groups added per follow-up chunk. */
const CHUNK = 40;

/** Approximate rendered height of one card, for the pending-space reservation. */
const CARD_HEIGHT_PX = 102;

/**
 * Measured rendered heights of a task card, used as the contain-intrinsic-size
 * placeholder for cards whose layout the browser is skipping.
 *
 * These must match reality or the column visibly jitters: content-visibility
 * skips layout for off-screen cards, and the browser then sizes them from
 * contain-intrinsic-size instead. Understating it makes total column height
 * shrink as cards scroll out and snap back as they scroll in — measured at
 * ~600px of scrollHeight thrash on a 77-task board when this was a flat 92px
 * against cards that actually render 101px/121px.
 *
 * A card with labels is one label row (plus its 10px margin) taller.
 */
const CARD_INTRINSIC_HEIGHT_PX = 101;
const CARD_WITH_LABELS_INTRINSIC_HEIGHT_PX = 121;

export function ColumnDropzone({
  column,
  disableDragDrop = false,
  onIsOverChange,
}: ColumnDropzoneProps) {
  const { t } = useTranslation();
  const groupBy = useBoardGroupBy();
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: "column", column },
  });
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(
    new Set(),
  );
  const groups = useMemo(
    () => groupSameBucketSubtasks(column.tasks),
    [column.tasks],
  );

  useEffect(() => {
    onIsOverChange?.(isOver);
  }, [isOver, onIsOverChange]);

  const totalGroups = groups.length;

  /**
   * Progressive mount.
   *
   * Every card calls useSortable, which registers a droppable node with dnd-kit;
   * a 180-task column therefore did 180 registrations in the single synchronous
   * render that a view switch triggers (measured: one 2.2s long task on
   * Gantt -> Tasks). Only ~10 cards are ever on screen, so the first paint
   * renders a small window of groups and the rest are appended in idle chunks.
   *
   * Chunking is per group, not per task, because a parent and its subtasks are
   * one render unit — splitting mid-group would show a parent whose children
   * pop in a frame later.
   *
   * This keeps drag-and-drop working on every card, unlike true windowing which
   * would unmount off-screen cards and break dnd-kit's registry.
   *
   * ponytail: chunked mount, not virtualization. Total work is unchanged, it's
   * just spread across frames so nothing blocks the click. Swap in
   * @tanstack/react-virtual (and rework the SortableContext items) if columns
   * grow past a few thousand cards.
   */
  const [mountCount, setMountCount] = useState(() =>
    Math.min(totalGroups, INITIAL_WINDOW),
  );

  // Reset when the column identity or size changes (board switch, filter).
  // Switching boards can yield the same group count, so column.id is required
  // here even though biome sees it as redundant — without it the window stays
  // wherever the previous board's chunking left it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: column.id resets the window on board switch
  useEffect(() => {
    setMountCount(Math.min(totalGroups, INITIAL_WINDOW));
  }, [column.id, totalGroups]);

  useEffect(() => {
    if (mountCount >= totalGroups) return;
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
      setMountCount((current) => Math.min(totalGroups, current + CHUNK));
    });
    return () => cancel(handle as never);
  }, [mountCount, totalGroups]);

  const visibleGroups = useMemo(
    () => groups.slice(0, mountCount),
    [groups, mountCount],
  );

  // Board-level "group by": buckets this column's tasks under a heading.
  // Only used when grouping is on, so the ungrouped path keeps its
  // progressive-mount behaviour untouched.
  const taskGroups = useMemo(
    () => (groupBy === "none" ? [] : groupTasks(column.tasks, groupBy)),
    [column.tasks, groupBy],
  );

  // Reserve height for not-yet-mounted groups so the scrollbar doesn't jump as
  // chunks land.
  const pendingCards = useMemo(
    () =>
      groups
        .slice(mountCount)
        .reduce((sum, group) => sum + 1 + group.children.length, 0),
    [groups, mountCount],
  );

  /**
   * A card is a plain div, not a motion.div.
   *
   * Per-card Framer Motion cost ~1s of the board render on a 180-task column
   * (185 spring instances, visible as PopChild/PopChildMeasure in a Firefox
   * profile). The container below runs one CSS transition instead, and
   * content-visibility lets the browser skip layout/paint for off-screen cards.
   */
  const renderCard = (task: (typeof column.tasks)[number], nested = false) => (
    <div
      key={task.id}
      className={nested ? "ml-4 border-l-2 border-border pl-2" : undefined}
      style={{
        contentVisibility: "auto",
        // `auto` height alone is not enough: until a card has been rendered once
        // the browser has no last-known size and falls back to the fixed value,
        // so it has to be the real card height or the column jitters on scroll.
        containIntrinsicSize: `auto ${
          task.labels?.length
            ? CARD_WITH_LABELS_INTRINSIC_HEIGHT_PX
            : CARD_INTRINSIC_HEIGHT_PX
        }px`,
      }}
    >
      <TaskCard task={task} disableDragDrop={disableDragDrop} />
    </div>
  );

  return (
    <div className="min-h-0 flex-1" ref={setNodeRef}>
      <SortableContext
        items={column.tasks}
        strategy={verticalListSortingStrategy}
      >
        {groupBy !== "none" ? (
          <div className="flex flex-col gap-3" data-slot="task-group-list">
            {taskGroups.map((group) => (
              <section
                className="flex flex-col gap-2"
                data-slot="task-group"
                key={group.key || "unset"}
              >
                <h3 className="px-1 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                  {group.labelKey ? t(group.labelKey) : group.label}
                  <span className="ml-1.5 text-muted-foreground/70">
                    {group.tasks.length}
                  </span>
                </h3>
                {group.tasks.map((task) => renderCard(task))}
              </section>
            ))}
            {taskGroups.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/70 px-3 py-6 text-center text-xs text-muted-foreground">
                {t("tasks:column.empty")}
              </div>
            ) : null}
          </div>
        ) : (
          <div
            className={cn(
              "flex flex-col gap-2",
              // Container-level entry animation, replacing the old per-card
              // motion.div: one CSS transition on the wrapper reads the same but
              // costs nothing per card.
              "transition-[translate,opacity] duration-150 ease-out",
              "starting:-translate-y-1 starting:opacity-0",
              "motion-reduce:starting:translate-y-0",
            )}
          >
            {visibleGroups.map(({ parent, children }) => {
              const collapsed = collapsedParents.has(parent.id);
              return (
                <div
                  className="flex flex-col gap-2"
                  data-testid={children.length ? "task-group" : undefined}
                  key={parent.id}
                >
                  {renderCard(parent)}
                  {children.length > 0 && (
                    <button
                      aria-expanded={!collapsed}
                      className="flex items-center gap-1 self-start rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() =>
                        setCollapsedParents((current) => {
                          const next = new Set(current);
                          if (collapsed) next.delete(parent.id);
                          else next.add(parent.id);
                          return next;
                        })
                      }
                      type="button"
                    >
                      {collapsed ? (
                        <ChevronRight className="size-3" />
                      ) : (
                        <ChevronDown className="size-3" />
                      )}
                      {collapseToggleLabel({
                        parentId: parent.id,
                        childCount: children.length,
                        collapsed,
                      })}
                    </button>
                  )}
                  {!collapsed &&
                    children.map((child) => renderCard(child, true))}
                </div>
              );
            })}
            {pendingCards > 0 ? (
              <div
                aria-hidden="true"
                style={{ height: `${pendingCards * CARD_HEIGHT_PX}px` }}
              />
            ) : null}
            {totalGroups === 0 ? (
              <div className="rounded-lg border border-dashed border-border/70 px-3 py-6 text-center text-xs text-muted-foreground">
                {t("tasks:column.empty")}
              </div>
            ) : null}
          </div>
        )}
      </SortableContext>
    </div>
  );
}
