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
import { Archive, ChevronDown, ChevronRight, Flag, Plus } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { priorityColorsTaskCard } from "@/constants/priority-colors";
import { useReorderTasks } from "@/hooks/mutations/task/use-reorder-tasks";
import { useUpdateTask } from "@/hooks/mutations/task/use-update-task";
import { useRegisterShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { cn } from "@/lib/cn";
import { getColumnIcon } from "@/lib/column";
import {
  collapseToggleLabel,
  groupSameBucketSubtasks,
} from "@/lib/group-subtasks";
import { reorderBoardTask } from "@/lib/reorder-board-task";
import { toast } from "@/lib/toast";
import useBoardStore from "@/store/board";
import useBulkSelectionStore from "@/store/bulk-selection";
import type { BoardWithTasks } from "@/types/board";
import BulkToolbar from "../bulk-selection/bulk-toolbar";
import { ArchiveTasksModal } from "../shared/modals/archive-tasks-modal";
import CreateTaskModal from "../shared/modals/create-task-modal";
import TaskRow from "./task-row";

type ListViewProps = {
  board: BoardWithTasks;
  disableDragDrop?: boolean;
};

type ColumnSectionProps = {
  active: boolean;
  boardSlug: string;
  collapsedParentIds: ReadonlySet<string>;
  column: BoardWithTasks["columns"][number];
  expanded: boolean;
  onAddTask: () => void;
  onArchive: () => void;
  onToggle: () => void;
  onToggleParent: (parentId: string) => void;
};

/** Stable component identity keeps each dnd-kit droppable mounted. */
const ColumnSection = memo(function ColumnSection({
  active,
  boardSlug,
  collapsedParentIds,
  column,
  expanded,
  onAddTask,
  onArchive,
  onToggle,
  onToggleParent,
}: ColumnSectionProps) {
  const { t } = useTranslation();
  const { setNodeRef } = useDroppable({
    id: column.id,
    data: { type: "column", column },
  });
  const groups = useMemo(
    () => groupSameBucketSubtasks(column.tasks),
    [column.tasks],
  );
  const showDropIndicator = active;

  return (
    <div
      className={cn(
        "border-b border-border/50 transition-colors duration-150 overflow-auto",
        showDropIndicator && "border-l-4 border-l-ring bg-accent/35",
      )}
    >
      <div className="flex items-center justify-between py-2 px-4 bg-muted/60 border-b border-border/50">
        <button
          type="button"
          onClick={() => onToggle()}
          className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight
            className={cn(
              "w-3 h-3 transition-transform",
              expanded && "rotate-90",
            )}
          />
          <div className="flex items-center gap-2 h-4">
            {getColumnIcon(column.id, column.isFinal, column.icon)}
            <div className="flex items-center gap-1">
              <span className="mt-1 mr-1">{column.name}</span>
              <span className="text-xs text-muted-foreground mt-0.5">
                {column.tasks.length}
              </span>
            </div>
          </div>
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              onAddTask();
            }}
            className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
            title={t("tasks:listView.addTask")}
          >
            <Plus className="w-3 h-3" />
          </button>

          {column.isFinal && column.tasks.length > 0 && (
            <button
              type="button"
              onClick={() => onArchive()}
              className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
              title={t("tasks:listView.archiveAllTooltip")}
            >
              <Archive className="w-3 h-3" />
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
            items={column.tasks}
            strategy={verticalListSortingStrategy}
          >
            {/* Their grouping + collapse, without the per-row motion.div:
                one Framer Motion instance per row cost ~3s of main-thread
                blocking on a 180-task board. The CSS starting-style fade on
                the container gives the same visual entry for free. */}
            {groups.map(({ parent, children }) => {
              const collapsed = collapsedParentIds.has(parent.id);
              const visibleTasks = collapsed ? [parent] : [parent, ...children];
              return (
                <div
                  data-testid={children.length ? "list-task-group" : undefined}
                  key={parent.id}
                >
                  {visibleTasks.map((task, index) => (
                    <div
                      key={task.id}
                      className={
                        index > 0 ? "ml-6 border-l-2 border-border" : undefined
                      }
                    >
                      <TaskRow task={task} boardSlug={boardSlug} />
                    </div>
                  ))}
                  {children.length > 0 && (
                    <button
                      aria-expanded={!collapsed}
                      className="ml-6 flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => onToggleParent(parent.id)}
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
                </div>
              );
            })}
          </SortableContext>

          {column.tasks.length === 0 && (
            <div className="py-6 px-4 text-center text-xs text-muted-foreground">
              {t("tasks:listView.noTasks")}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

function ListView({ board, disableDragDrop = false }: ListViewProps) {
  const { t } = useTranslation();
  const { setBoard } = useBoardStore();
  const {
    setAvailableTasks,
    focusNext,
    focusPrevious,
    focusedTaskId,
    clearFocus,
  } = useBulkSelectionStore();
  const { mutate: updateTask } = useUpdateTask();
  const { mutate: reorderTasks } = useReorderTasks();
  const navigate = useNavigate();
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [overColumnId, setOverColumnId] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >(() => {
    const sections: Record<string, boolean> = {};
    if (board?.columns) {
      for (const col of board.columns) {
        sections[col.id] = true;
      }
    }
    return sections;
  });
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(
    new Set(),
  );
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [activeColumn, setActiveColumn] = useState<string | null>(null);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [columnToArchive, setColumnToArchive] = useState<
    BoardWithTasks["columns"][number] | null
  >(null);

  useEffect(() => {
    if (board?.columns) {
      const visibleTaskIds = board.columns
        .filter((column) => expandedSections[column.id])
        .flatMap((column) => column.tasks.map((task) => task.id));
      setAvailableTasks(visibleTaskIds);
    }
  }, [board, expandedSections, setAvailableTasks]);

  useEffect(() => {
    clearFocus();
  }, [clearFocus]);

  useRegisterShortcuts({
    shortcuts: {
      j: () => {
        focusNext();
        const state = useBulkSelectionStore.getState();
        if (state.focusedTaskId) {
          navigate({ to: ".", search: { taskId: state.focusedTaskId } });
        }
      },
      k: () => {
        focusPrevious();
        const state = useBulkSelectionStore.getState();
        if (state.focusedTaskId) {
          navigate({ to: ".", search: { taskId: state.focusedTaskId } });
        }
      },
      Enter: () => {
        if (focusedTaskId && board) {
          navigate({
            to: "/dashboard/organization/$organizationId/board/$boardId/task/$taskId",
            params: {
              organizationId: board.organizationId,
              boardId: board.id,
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

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (!over || !activeId) {
      setOverColumnId(null);
      return;
    }

    if (board?.columns?.some((col) => col.id === over.id)) {
      setOverColumnId(over.id.toString());
      return;
    }

    const taskId = over.id.toString();
    const columnWithTask = board?.columns?.find((col) =>
      col.tasks.some((task) => task.id === taskId),
    );

    if (columnWithTask) {
      setOverColumnId(columnWithTask.id);
    } else {
      setOverColumnId(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverColumnId(null);

    if (!over || !board?.columns) return;

    const activeTaskId = active.id.toString();
    const overId = over.id.toString();

    const result = reorderBoardTask(board, activeTaskId, overId);
    if (!result) return;
    setBoard(result.board);
    reorderTasks({ boardId: board.id, tasks: result.updates });
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  const handleArchiveClick = (column: BoardWithTasks["columns"][number]) => {
    if (!column.isFinal || column.tasks.length === 0) return;
    setColumnToArchive(column);
    setIsArchiveModalOpen(true);
  };

  const handleConfirmArchive = () => {
    if (!columnToArchive) return;

    const updatedBoard = produce(board, (draft) => {
      const archivedColumn = draft?.columns?.find(
        (col) => col.id === columnToArchive.id,
      );
      if (!archivedColumn) return;

      for (const task of archivedColumn.tasks) {
        updateTask({
          ...task,
          status: "archived",
        });
      }

      archivedColumn.tasks = [];
    });

    setBoard(updatedBoard);
    toast.success(
      t("tasks:archive.success", { count: columnToArchive.tasks.length }),
    );

    setIsArchiveModalOpen(false);
    setColumnToArchive(null);
  };

  if (!board?.columns) {
    return null;
  }

  const activeTask = activeId
    ? board.columns
        ?.flatMap((col) => col.tasks)
        .find((task) => task.id === activeId)
    : null;

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
          {board.columns.map((column) => (
            <ColumnSection
              active={Boolean(activeId && overColumnId === column.id)}
              boardSlug={board.slug ?? ""}
              collapsedParentIds={collapsedParents}
              column={column}
              expanded={Boolean(expandedSections[column.id])}
              key={column.id}
              onAddTask={() => {
                setIsTaskModalOpen(true);
                setActiveColumn(column.id);
              }}
              onArchive={() => handleArchiveClick(column)}
              onToggle={() => toggleSection(column.id)}
              onToggleParent={(parentId) =>
                setCollapsedParents((current) => {
                  const next = new Set(current);
                  if (next.has(parentId)) next.delete(parentId);
                  else next.add(parentId);
                  return next;
                })
              }
            />
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
                  <span className="text-[10px] font-mono text-muted-foreground">
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

      <CreateTaskModal
        open={isTaskModalOpen}
        boardId={board.id}
        onClose={() => setIsTaskModalOpen(false)}
        status={activeColumn ?? "done"}
      />
      <ArchiveTasksModal
        open={isArchiveModalOpen}
        onClose={() => {
          setIsArchiveModalOpen(false);
          setColumnToArchive(null);
        }}
        onConfirm={handleConfirmArchive}
        taskCount={columnToArchive?.tasks.length ?? 0}
      />

      <BulkToolbar />
    </DndContext>
  );
}

export default ListView;
