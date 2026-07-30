import type Task from "@/types/task";

export type TaskGroup = {
  parent: Task;
  children: Task[];
};

/**
 * Group children directly under a parent only when both occur in this exact
 * bucket/column. Cross-column subtasks stay standalone so grouping never lies
 * about their workflow status.
 *
 * The first occurrence determines group order, preserving the server/DnD task
 * order. Children are removed from the top level only when their parent exists
 * in the same input set.
 */
export function groupSameBucketSubtasks(tasks: Task[]): TaskGroup[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const childrenByParent = new Map<string, Task[]>();

  for (const task of tasks) {
    const parentId = task.parentTask?.id;
    if (!parentId || !byId.has(parentId)) continue;
    childrenByParent.set(parentId, [
      ...(childrenByParent.get(parentId) ?? []),
      task,
    ]);
  }

  return tasks
    .filter((task) => {
      const parentId = task.parentTask?.id;
      return !parentId || !byId.has(parentId);
    })
    .map((parent) => ({
      parent,
      children: childrenByParent.get(parent.id) ?? [],
    }));
}

/** Flat visible sequence for a collapsed/expanded grouped view. */
export function visibleGroupedTasks(
  groups: TaskGroup[],
  collapsedParentIds: ReadonlySet<string>,
): Task[] {
  return groups.flatMap(({ parent, children }) =>
    collapsedParentIds.has(parent.id) ? [parent] : [parent, ...children],
  );
}

type CollapseToggleProps = {
  parentId: string;
  childCount: number;
  collapsed: boolean;
};

export function collapseToggleLabel({
  parentId: _parentId,
  childCount,
  collapsed,
}: CollapseToggleProps) {
  return `${collapsed ? "Expand" : "Collapse"} ${childCount} ${
    childCount === 1 ? "subtask" : "subtasks"
  }`;
}
