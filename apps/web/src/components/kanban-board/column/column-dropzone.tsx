import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  collapseToggleLabel,
  groupSameBucketSubtasks,
} from "@/lib/group-subtasks";
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

  const reduceMotion = useReducedMotion();
  const renderCard = (task: (typeof column.tasks)[number], nested = false) => (
    <motion.div
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
      className={nested ? "ml-4 border-l-2 border-border pl-2" : undefined}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
      key={task.id}
      transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
    >
      <TaskCard task={task} disableDragDrop={disableDragDrop} />
    </motion.div>
  );

  return (
    <div className="min-h-0 flex-1" ref={setNodeRef}>
      <SortableContext
        items={column.tasks}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-2">
          <AnimatePresence initial={false} mode="popLayout">
            {groups.map(({ parent, children }) => {
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
          </AnimatePresence>
        </div>
      </SortableContext>
    </div>
  );
}
