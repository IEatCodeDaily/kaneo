import {
  type CollisionDetection,
  closestCorners,
  DndContext,
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  type DropAnimation,
  defaultDropAnimationSideEffects,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { BoardSkeleton } from "@/components/common/board-skeleton";
import { PendingSyncIndicator } from "@/components/common/pending-sync-indicator";
import { useReorderTasks } from "@/hooks/mutations/task/use-reorder-tasks";
import { useRegisterShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { reorderBoardTask, taskOrderUpdates } from "@/lib/reorder-board-task";
import useBoardStore from "@/store/board";
import useBulkSelectionStore from "@/store/bulk-selection";
import type { BoardWithTasks } from "@/types/board";
import BulkToolbar from "../bulk-selection/bulk-toolbar";
import { BoardDraggingProvider } from "./board-view-context";
import Column from "./column";
import TaskCard from "./task-card";

type KanbanBoardProps = {
  board: BoardWithTasks;
  disableDragDrop?: boolean;
};

const pointerThenCorners: CollisionDetection = (args) => {
  const collisions = pointerWithin(args);
  return collisions.length > 0 ? collisions : closestCorners(args);
};

function KanbanBoard({ board, disableDragDrop = false }: KanbanBoardProps) {
  const { setBoard } = useBoardStore();
  const {
    setAvailableTasks,
    focusNext,
    focusPrevious,
    focusedTaskId,
    clearFocus,
  } = useBulkSelectionStore();
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const boardBeforeDrag = useRef<BoardWithTasks | null>(null);
  const { isPending: isReorderPending, mutate: reorderTasks } =
    useReorderTasks();
  const navigate = useNavigate();

  useEffect(() => {
    if (board?.columns) {
      const allTaskIds = board.columns.flatMap((column) =>
        column.tasks.map((task) => task.id),
      );
      setAvailableTasks(allTaskIds);
    }
  }, [board, setAvailableTasks]);

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
        delay: disableDragDrop ? 999999 : 250,
        tolerance: 10,
      },
    }),
    useSensor(KeyboardSensor),
  );

  const dropAnimation: DropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({
      styles: {
        active: {
          opacity: "0.8",
        },
      },
    }),
    duration: 300,
    easing: "cubic-bezier(0.23, 1, 0.32, 1)",
  };

  const handleDragStart = (event: DragStartEvent) => {
    boardBeforeDrag.current = board;
    setActiveId(event.active.id);
  };

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;

    const activeTaskId = active.id.toString();
    const overId = over.id.toString();
    const source = board.columns.find((column) =>
      column.tasks.some((task) => task.id === activeTaskId),
    );
    const destination = board.columns.find(
      (column) =>
        column.id === overId || column.tasks.some((task) => task.id === overId),
    );
    if (!source || !destination || source.id === destination.id) return;

    const result = reorderBoardTask(board, activeTaskId, overId);
    if (result) setBoard(result.board);
  };

  const handleDragCancel = (_event: DragCancelEvent) => {
    if (boardBeforeDrag.current) setBoard(boardBeforeDrag.current);
    boardBeforeDrag.current = null;
    setActiveId(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || !board?.columns) return;

    const activeId = active.id.toString();
    const overId = over.id.toString();

    const result = reorderBoardTask(board, activeId, overId);
    if (!result) {
      if (
        boardBeforeDrag.current &&
        boardBeforeDrag.current.columns.find((column) =>
          column.tasks.some((task) => task.id === activeId),
        )?.id !==
          board.columns.find((column) =>
            column.tasks.some((task) => task.id === activeId),
          )?.id
      ) {
        reorderTasks({
          boardId: board.id,
          board,
          tasks: taskOrderUpdates(board),
        });
      }
      boardBeforeDrag.current = null;
      return;
    }
    setBoard(result.board);
    reorderTasks({
      boardId: board.id,
      board: result.board,
      tasks: taskOrderUpdates(result.board),
    });
    boardBeforeDrag.current = null;
  };

  // #111: one board-shaped skeleton, shared with the route and BoardLayout.
  // This used to be a second, flat placeholder (four bare boxes with two grey
  // bars each) — the exact "nothing has loaded" look the ticket rejected.
  if (!board?.columns) {
    return <BoardSkeleton />;
  }

  const activeTask = activeId
    ? board.columns
        .flatMap((col) => col.tasks)
        .find((task) => task.id === activeId)
    : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerThenCorners}
      onDragCancel={handleDragCancel}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      {/* #131: hover previews stay hidden for as long as a card is in flight. */}
      <BoardDraggingProvider isDragging={activeId !== null}>
        <div className="flex h-full w-full flex-col bg-linear-to-b from-muted/20 to-background">
          <div className="min-h-0 flex-1 overflow-x-auto [-webkit-overflow-scrolling:touch]">
            <div className="flex h-full min-w-max gap-4 px-4 py-4 md:px-5">
              {board.columns?.map((column) => (
                <div
                  key={column.id}
                  className="h-full max-w-96 min-w-80 shrink-0 flex-1"
                >
                  <Column column={column} disableDragDrop={disableDragDrop} />
                </div>
              ))}
            </div>
          </div>
        </div>
        <DragOverlay dropAnimation={dropAnimation}>
          {activeTask ? (
            <div className="transform rotate-1 scale-[1.03] shadow-lg">
              <div className="ring-2 ring-ring/35 rounded-lg">
                <TaskCard task={activeTask} />
              </div>
            </div>
          ) : null}
        </DragOverlay>

        <BulkToolbar />
      </BoardDraggingProvider>
      <PendingSyncIndicator pending={isReorderPending} />
    </DndContext>
  );
}

export default KanbanBoard;
