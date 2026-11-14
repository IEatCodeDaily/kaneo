import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  type UniqueIdentifier,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { snapCenterToCursor } from "@dnd-kit/modifiers";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useNavigate } from "@tanstack/react-router";
import { produce } from "immer";
import { Archive, ChevronRight, Flag, Plus } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PendingSyncIndicator } from "@/components/common/pending-sync-indicator";
import { Checkbox } from "@/components/ui/checkbox";
import { priorityColorsTaskCard } from "@/constants/priority-colors";
import { useReorderTasks } from "@/hooks/mutations/task/use-reorder-tasks";
import { useSetTaskArchived } from "@/hooks/mutations/task/use-set-task-archived";
import { useRegisterShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { cn } from "@/lib/cn";
import { getColumnIcon } from "@/lib/column";
import { getStatusDisplayLabel } from "@/lib/i18n/domain";
import {
  ARCHIVED_SECTION,
  backlogSectionOf,
  sectionCrossPayload,
} from "@/lib/task-archival";
import { toast } from "@/lib/toast";
import useBacklogBulkSelectionStore from "@/store/backlog-bulk-selection";
import useBoardStore from "@/store/board";
import type { BoardWithTasks } from "@/types/board";
import type Task from "@/types/task";
import BacklogBulkToolbar from "../bulk-selection/backlog-bulk-toolbar";

import BacklogTaskRow from "./backlog-task-row";

const CreateTaskModal = lazy(
  () => import("../shared/modals/create-task-modal"),
);

type BacklogListViewProps = {
  board?: BoardWithTasks;
  disableDragDrop?: boolean;
};

type Section = {
  id: string;
  title: string;
  icon: React.ReactNode;
  tasks: Task[];
  /** Status sections can create tickets in place; Archived cannot. */
  isStatus: boolean;
};

/** Task list of one section inside a board draft (mutable under immer). */
function sectionTasks(draft: BoardWithTasks, sectionId: string): Task[] {
  if (sectionId === ARCHIVED_SECTION) return draft.archivedTasks;
  return (
    draft.backlogColumns.find((column) => column.id === sectionId)?.tasks ?? []
  );
}

function BacklogListView({
  board,
  disableDragDrop = false,
}: BacklogListViewProps) {
  const { t } = useTranslation();
  const { isPending: isReorderPending, mutate: reorderTasks } =
    useReorderTasks();
  const { mutateAsync: setArchived } = useSetTaskArchived();
  const { setBoard } = useBoardStore();
  const {
    setAvailableTasks,
    focusNext,
    focusPrevious,
    focusedTaskId,
    clearFocus,
    clearSelection,
    isSelectMode,
    selectedTaskIds,
    selectTasks,
  } = useBacklogBulkSelectionStore();
  const navigate = useNavigate();
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [overSectionId, setOverSectionId] = useState<string | null>(null);
  // Sections start expanded; the set holds the ones the user collapsed.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [createInStatus, setCreateInStatus] = useState<string | null>(null);

  /*
    Sections = the board's off-board statuses (Triage, Planned, any custom
    backlog-type status — each a board row, in Status-settings order), then
    Archived. Archived wins over status (archival is orthogonal to status).
  */
  const sections: Section[] = useMemo(
    () =>
      board
        ? [
            ...(board.backlogColumns ?? []).map((column) => ({
              id: column.id,
              title: getStatusDisplayLabel(column.slug, column.name),
              icon: getColumnIcon(column.slug, column.isFinal, column.icon),
              tasks: column.tasks,
              isStatus: true,
            })),
            {
              id: ARCHIVED_SECTION,
              title: t("tasks:backlog.sections.archived"),
              icon: (
                <Archive className="h-4 w-4 shrink-0 text-muted-foreground" />
              ),
              tasks: board.archivedTasks ?? [],
              isStatus: false,
            },
          ]
        : [],
    [board, t],
  );

  useEffect(() => {
    setAvailableTasks(
      sections
        .filter((section) => !collapsed.has(section.id))
        .flatMap((section) => section.tasks.map((task) => task.id)),
    );
  }, [sections, collapsed, setAvailableTasks]);

  useEffect(() => {
    clearFocus();
    return () => clearSelection();
  }, [clearFocus, clearSelection]);

  useRegisterShortcuts({
    shortcuts: {
      j: () => {
        focusNext();
        const state = useBacklogBulkSelectionStore.getState();
        if (state.focusedTaskId) {
          navigate({ to: ".", search: { taskId: state.focusedTaskId } });
        }
      },
      k: () => {
        focusPrevious();
        const state = useBacklogBulkSelectionStore.getState();
        if (state.focusedTaskId) {
          navigate({ to: ".", search: { taskId: state.focusedTaskId } });
        }
      },
      Enter: () => {
        if (focusedTaskId && board) {
          navigate({
            to: "/dashboard/organization/$organizationSlug/board/$boardSlug/task/$taskId",
            params: {
              organizationSlug: board.organizationId,
              boardSlug: board.id,
              taskId: focusedTaskId,
            },
          });
        }
      },
    },
  });

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: disableDragDrop ? 999999 : 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: disableDragDrop ? 999999 : 200,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor),
  );

  /** The section an `over` id points at: a section itself, or a row in one. */
  const sectionIdOf = (overId: string) =>
    sections.find(
      (section) =>
        section.id === overId ||
        section.tasks.some((task) => task.id === overId),
    )?.id ?? null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    setOverSectionId(over && activeId ? sectionIdOf(over.id.toString()) : null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverSectionId(null);

    if (!over || !board) return;

    const activeTaskId = active.id.toString();
    const overId = over.id.toString();
    const activeTask = sections
      .flatMap((section) => section.tasks)
      .find((task) => task.id === activeTaskId);
    const targetSection = sectionIdOf(overId);

    if (!activeTask || !targetSection) return;

    const sourceSection = backlogSectionOf(activeTask);
    const crossesSection = sourceSection !== targetSection;
    const crossPayload = sectionCrossPayload({
      task: activeTask,
      targetSection,
    });

    const updatedBoard = produce(board, (draft) => {
      const source = sectionTasks(draft, sourceSection);
      const sourceIndex = source.findIndex((task) => task.id === activeTaskId);
      const [task] = source.splice(sourceIndex, 1);
      if (!task) return;

      const target = sectionTasks(draft, targetSection);
      if (crossesSection) {
        task.status = crossPayload.status;
        task.archivedAt = crossPayload.archived
          ? new Date().toISOString()
          : null;
        target.push(task);
      } else {
        let destinationIndex = target.findIndex((t) => t.id === overId);
        if (destinationIndex === -1) destinationIndex = target.length;
        else if (sourceIndex <= destinationIndex) destinationIndex += 1;
        target.splice(destinationIndex, 0, task);
      }
      draft.plannedTasks = draft.backlogColumns.flatMap((c) => c.tasks);
    });

    setBoard(updatedBoard);

    if (crossesSection) {
      const rollback = (error: unknown) => {
        setBoard(board);
        toast.error(
          error instanceof Error ? error.message : t("tasks:archive.error"),
        );
      };
      /*
        Archive toggles `archived_at` only — status is left alone, so a Done
        ticket dragged into Archived stays Done. A new status (dropping into a
        status section) is persisted by the reorder below, which writes each
        task's status + column.
      */
      if (crossPayload.archived || sourceSection === ARCHIVED_SECTION) {
        setArchived({
          taskId: activeTaskId,
          archived: crossPayload.archived,
          boardId: board.id,
        }).catch(rollback);
      }
    }

    /*
      Reorder persists position within the touched sections, sending each
      task's ACTUAL status — never a section name like "archived".
    */
    const touched = crossesSection
      ? [sourceSection, targetSection]
      : [targetSection];
    reorderTasks({
      boardId: board.id,
      board: updatedBoard,
      tasks: touched.flatMap((sectionId) =>
        sectionTasks(updatedBoard, sectionId).map((task, position) => ({
          id: task.id,
          position,
          status: task.status,
        })),
      ),
    });
  };

  const toggleSection = (sectionId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(sectionId)) next.add(sectionId);
      return next;
    });
  };

  function BacklogSection({ section }: { section: Section }) {
    const { id: sectionId, title, tasks } = section;
    const { setNodeRef } = useDroppable({
      id: sectionId,
      data: {
        type: "column",
        column: { id: sectionId, name: title },
      },
    });

    const showDropIndicator = activeId && overSectionId === sectionId;
    const expanded = !collapsed.has(sectionId);

    return (
      <div
        className={cn(
          "border-b border-border/50 transition-colors duration-150 overflow-auto",
          showDropIndicator && "border-l-4 border-l-ring bg-accent/35",
        )}
        data-testid={`backlog-section-${sectionId}`}
      >
        <div className="flex items-center justify-between py-2 px-4 bg-muted/60 border-b border-border/50">
          <button
            type="button"
            onClick={() => toggleSection(sectionId)}
            className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight
              className={cn(
                "w-3 h-3 transition-transform",
                expanded && "rotate-90",
              )}
            />
            <div className="flex items-center gap-2 h-4">
              {section.icon}
              <div className="flex items-center gap-1">
                <span className="mt-1 mr-1">{title}</span>
                <span className="text-xs text-muted-foreground mt-0.5">
                  {tasks.length}
                </span>
              </div>
            </div>
          </button>

          <div className="flex items-center gap-1">
            {isSelectMode && tasks.length > 0 && (
              <Checkbox
                aria-label={t("tasks:backlog.selectAllInSection", {
                  section: title,
                })}
                checked={tasks.every((task) => selectedTaskIds.has(task.id))}
                indeterminate={
                  tasks.some((task) => selectedTaskIds.has(task.id)) &&
                  !tasks.every((task) => selectedTaskIds.has(task.id))
                }
                onCheckedChange={(checked) => {
                  const ids = new Set(tasks.map((task) => task.id));
                  selectTasks(
                    checked
                      ? [...new Set([...selectedTaskIds, ...ids])]
                      : [...selectedTaskIds].filter((id) => !ids.has(id)),
                  );
                }}
              />
            )}
            {section.isStatus && (
              <button
                type="button"
                onClick={() => setCreateInStatus(sectionId)}
                className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
                title={t("tasks:backlog.addTask")}
              >
                <Plus className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {expanded && (
          <div
            ref={setNodeRef}
            className="bg-card transition-[translate,opacity] duration-150 ease-out starting:-translate-y-1 starting:opacity-0 motion-reduce:starting:translate-y-0"
          >
            <SortableContext
              items={tasks}
              strategy={verticalListSortingStrategy}
            >
              {/* No per-row motion wrapper — see list-view/index.tsx: one
                  Framer Motion instance per row dominates mount cost on large
                  boards. */}
              {tasks.map((task) => (
                <BacklogTaskRow key={task.id} task={task} />
              ))}
            </SortableContext>

            {tasks.length === 0 && (
              <div className="py-6 px-4 text-center text-xs text-muted-foreground">
                {t("tasks:backlog.noTasksInSection", {
                  section: title.toLowerCase(),
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (!board) {
    return null;
  }

  const activeTask = activeId
    ? sections
        .flatMap((section) => section.tasks)
        .find((task) => task.id === activeId)
    : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      modifiers={[snapCenterToCursor]}
    >
      <div className="w-full h-full overflow-auto bg-muted/20">
        <div className="divide-y divide-border/50">
          {sections.map((section) => (
            <BacklogSection key={section.id} section={section} />
          ))}
        </div>
      </div>

      <DragOverlay>
        {activeTask && (
          <div className="bg-card border border-border rounded-lg shadow-lg p-2 max-w-[200px] cursor-grabbing">
            <div className="flex items-center gap-2">
              <div className="flex-shrink-0">
                <Flag
                  className={cn(
                    "w-3 h-3",
                    priorityColorsTaskCard[
                      activeTask.priority as keyof typeof priorityColorsTaskCard
                    ],
                  )}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono text-muted-foreground">
                    {board?.slug}-{activeTask.number}
                  </span>
                  <span className="text-xs text-foreground truncate">
                    {activeTask.title}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </DragOverlay>

      {createInStatus && (
        <Suspense fallback={<span className="sr-only">Loading editor</span>}>
          <CreateTaskModal
            open
            boardId={board?.id}
            onClose={() => setCreateInStatus(null)}
            status={createInStatus}
          />
        </Suspense>
      )}

      <BacklogBulkToolbar />
      <PendingSyncIndicator pending={isReorderPending} />
    </DndContext>
  );
}

export default BacklogListView;
