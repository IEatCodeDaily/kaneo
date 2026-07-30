import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useEffect } from "react";
import type { BoardWithTasks } from "@/types/board";
import TaskCard from "../task-card";

type ColumnDropzoneProps = {
  column: BoardWithTasks["columns"][number];
  disableDragDrop?: boolean;
  onIsOverChange?: (isOver: boolean) => void;
};

export function ColumnDropzone({
  column,
  disableDragDrop = false,
  onIsOverChange,
}: ColumnDropzoneProps) {
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

  return (
    <div ref={setNodeRef} className="flex-1 min-h-0">
      <SortableContext
        items={column.tasks}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-2">
          {/* No AnimatePresence/motion per card: on a 180-task column that
              mounts 180 spring animations and dominates the board render
              (~1s of the transition in a Firefox profile). content-visibility
              lets the browser skip layout/paint for off-screen cards. */}
          {column.tasks.map((task) => (
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
        </div>
      </SortableContext>
    </div>
  );
}
