import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useEffect } from "react";
import { cn } from "@/lib/cn";
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
