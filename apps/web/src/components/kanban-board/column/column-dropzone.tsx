import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CalendarDays, ChevronDown, ChevronRight, Tag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { groupTasks } from "@/hooks/use-task-filters-with-labels-support";
import { cn } from "@/lib/cn";
import { getInitials } from "@/lib/get-initials";
import {
  collapseToggleLabel,
  groupSameBucketSubtasks,
} from "@/lib/group-subtasks";
import { getPriorityIcon } from "@/lib/priority";
import type { BoardWithTasks } from "@/types/board";
import { useBoardGroupBy } from "../board-view-context";
import TaskCard from "../task-card";

type ColumnDropzoneProps = {
  column: BoardWithTasks["columns"][number];
  disableDragDrop?: boolean;
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

export function ColumnDropzone({
  column,
  disableDragDrop = false,
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
  // Board-level group-by sections the user has hidden (#61 rework). Keyed by
  // group key so toggling one group never touches another's state.
  const [collapsedTaskGroups, setCollapsedTaskGroups] = useState<Set<string>>(
    new Set(),
  );
  const groups = useMemo(
    () => groupSameBucketSubtasks(column.tasks),
    [column.tasks],
  );

  const taskGroups = useMemo(
    () => (groupBy === "none" ? [] : groupTasks(column.tasks, groupBy)),
    [column.tasks, groupBy],
  );
  const totalGroups =
    groupBy === "none"
      ? groups.length
      : taskGroups.reduce((total, group) => total + group.tasks.length, 0);

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
  const visibleTaskGroups = useMemo(() => {
    let remaining = mountCount;
    return taskGroups.flatMap((group) => {
      if (remaining <= 0) return [];
      const tasks = group.tasks.slice(0, remaining);
      remaining -= tasks.length;
      return [{ ...group, tasks }];
    });
  }, [mountCount, taskGroups]);

  // Reserve height for not-yet-mounted groups so the scrollbar doesn't jump as
  // chunks land.
  const pendingCards = useMemo(
    () =>
      groups
        .slice(mountCount)
        .reduce((sum, group) => sum + 1 + group.children.length, 0),
    [groups, mountCount],
  );

  /** Per-card Framer Motion cost ~1s on a 180-task column. Keep this plain. */
  const renderCard = (task: (typeof column.tasks)[number], nested = false) => (
    <div
      key={task.id}
      className={nested ? "ml-4 border-l-2 border-border pl-2" : undefined}
    >
      <TaskCard task={task} disableDragDrop={disableDragDrop} />
    </div>
  );

  return (
    <div
      className={cn(
        "min-h-0 flex-1 rounded-lg transition-colors duration-100",
        isOver && "bg-accent/25",
      )}
      data-column-id={column.id}
      ref={setNodeRef}
    >
      <SortableContext
        items={column.tasks}
        strategy={verticalListSortingStrategy}
      >
        {groupBy !== "none" ? (
          <div className="flex flex-col gap-3" data-slot="task-group-list">
            {visibleTaskGroups.map((group) => {
              const groupKey = group.key || "unset";
              const groupCollapsed = collapsedTaskGroups.has(groupKey);
              const groupTitle = group.labelKey
                ? t(group.labelKey)
                : group.label;
              const regionId = `${column.id}-task-group-${encodeURIComponent(groupKey)}`;
              const firstTask = group.tasks[0];
              const groupIcon =
                groupBy === "assignee" ? (
                  <Avatar className="size-4">
                    <AvatarImage alt="" src={firstTask?.assigneeImage ?? ""} />
                    <AvatarFallback className="text-[8px]">
                      {getInitials(groupTitle)}
                    </AvatarFallback>
                  </Avatar>
                ) : groupBy === "priority" && groupKey ? (
                  <span className="flex size-4 items-center justify-center [&>svg]:size-3.5">
                    {getPriorityIcon(groupKey)}
                  </span>
                ) : groupBy === "label" ? (
                  <Tag className="size-3.5" />
                ) : groupBy === "dueDate" ? (
                  <CalendarDays className="size-3.5" />
                ) : null;
              return (
                <section
                  className="flex flex-col gap-2"
                  data-slot="task-group"
                  key={groupKey}
                >
                  {/* The whole heading is the show/hide affordance: the user
                      asked for each grouping to be a collapsible section, not
                      a flat separator line. */}
                  <button
                    aria-controls={regionId}
                    aria-expanded={!groupCollapsed}
                    className="flex h-7 w-full items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2 text-left font-medium text-xs text-foreground/80 uppercase tracking-wide transition-colors hover:bg-muted hover:text-foreground"
                    data-slot="task-group-toggle"
                    onClick={() =>
                      setCollapsedTaskGroups((current) => {
                        const next = new Set(current);
                        if (groupCollapsed) next.delete(groupKey);
                        else next.add(groupKey);
                        return next;
                      })
                    }
                    type="button"
                  >
                    {groupCollapsed ? (
                      <ChevronRight className="size-3" />
                    ) : (
                      <ChevronDown className="size-3" />
                    )}
                    {groupIcon}
                    <span>{groupTitle}</span>
                    <span className="ml-1.5 text-muted-foreground/70">
                      {group.tasks.length}
                    </span>
                  </button>
                  {!groupCollapsed ? (
                    <div className="flex flex-col gap-2" id={regionId}>
                      {group.tasks.map((task) => renderCard(task))}
                    </div>
                  ) : null}
                </section>
              );
            })}
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
