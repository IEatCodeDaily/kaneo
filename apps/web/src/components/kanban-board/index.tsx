import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  type DropAnimation,
  defaultDropAnimationSideEffects,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { produce } from "immer";
import { useEffect, useState } from "react";
import { BoardSkeleton } from "@/components/common/board-skeleton";
import { useUpdateTask } from "@/hooks/mutations/task/use-update-task";
import { useRegisterShortcuts } from "@/hooks/use-keyboard-shortcuts";
import useBoardStore from "@/store/board";
import useBulkSelectionStore from "@/store/bulk-selection";
import type { BoardWithTasks } from "@/types/board";
import BulkToolbar from "../bulk-selection/bulk-toolbar";
import Column from "./column";
import TaskCard from "./task-card";

type KanbanBoardProps = {
  board: BoardWithTasks;
  disableDragDrop?: boolean;
};

function KanbanBoard({ board, disableDragDrop = false }: KanbanBoardProps) {
  const queryClient = useQueryClient();
  const { setBoard } = useBoardStore();
  const {
    setAvailableTasks,
    focusNext,
    focusPrevious,
    focusedTaskId,
    clearFocus,
  } = useBulkSelectionStore();
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const { mutate: updateTask } = useUpdateTask();
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
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || !board?.columns) return;

    const activeId = active.id.toString();
    const overId = over.id.toString();

    const updatedBoard = produce(board, (draft) => {
      const sourceColumn = draft?.columns?.find((col) =>
        col.tasks.some((task) => task.id === activeId),
      );
      const destinationColumn = draft?.columns?.find(
        (col) =>
          col.id === overId || col.tasks.some((task) => task.id === overId),
      );

      if (!sourceColumn || !destinationColumn) return;

      const sourceTaskIndex = sourceColumn.tasks.findIndex(
        (task) => task.id === activeId,
      );
      const task = sourceColumn.tasks[sourceTaskIndex];

      sourceColumn.tasks = sourceColumn.tasks.filter((t) => t.id !== activeId);

      if (sourceColumn.id === destinationColumn.id) {
        let destinationIndex = destinationColumn.tasks.findIndex(
          (t) => t.id === overId,
        );
        if (sourceTaskIndex <= destinationIndex) {
          destinationIndex += 1;
        }
        destinationColumn.tasks.splice(destinationIndex, 0, task);

        destinationColumn.tasks.forEach((t, index) => {
          updateTask({ ...t, position: index });
        });

        queryClient.invalidateQueries({
          queryKey: ["boards", board.organizationId],
        });
      } else {
        task.status = destinationColumn.id;
        const destinationIndex =
          overId === destinationColumn.id
            ? destinationColumn.tasks.length
            : destinationColumn.tasks.findIndex((t) => t.id === overId) + 1;

        destinationColumn.tasks.splice(destinationIndex, 0, task);

        destinationColumn.tasks.forEach((t, index) => {
          updateTask({ ...t, status: destinationColumn.id, position: index });
        });

        sourceColumn.tasks.forEach((t, index) => {
          updateTask({ ...t, position: index });
        });
      }
    });

    setBoard(updatedBoard);
    setActiveId(null);
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
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
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
    </DndContext>
  );
}

export default KanbanBoard;
