export type MyTaskViewItem = {
  id: string;
  title: string;
  number: number | null;
  boardId: string;
  boardName: string;
  status: string | null;
  priority: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  assigneeId: string | null;
  assigneeName: string | null;
  milestoneId: string | null;
  milestoneName: string | null;
  flagged: boolean;
  labels: Array<{ id: string; name: string; color: string }>;
};

export type MyTasksSort =
  | "updated"
  | "created"
  | "dueDate"
  | "priority"
  | "title"
  | "number";
export type MyTasksGroup =
  | "board"
  | "none"
  | "status"
  | "priority"
  | "label"
  | "dueDate"
  | "assignee"
  | "milestone";

const priorityRank: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  no_priority: 4,
};

export function sortMyTasks<T extends MyTaskViewItem>(
  tasks: T[],
  sort: MyTasksSort,
) {
  return [...tasks].sort((a, b) => {
    if (sort === "title") return a.title.localeCompare(b.title);
    if (sort === "number") return (a.number ?? 0) - (b.number ?? 0);
    if (sort === "priority")
      return (
        (priorityRank[a.priority ?? "no_priority"] ?? 5) -
        (priorityRank[b.priority ?? "no_priority"] ?? 5)
      );
    if (sort === "dueDate")
      return (
        (a.dueDate ? Date.parse(a.dueDate) : Number.MAX_SAFE_INTEGER) -
        (b.dueDate ? Date.parse(b.dueDate) : Number.MAX_SAFE_INTEGER)
      );
    const field = sort === "created" ? "createdAt" : "updatedAt";
    return Date.parse(b[field]) - Date.parse(a[field]);
  });
}

export function localDateKey(value: string | Date): string {
  const date =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T00:00:00`)
      : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function ticketDueState(
  dueDate: string | null,
  isFinal: boolean,
  now = new Date(),
): "overdue" | "soon" | null {
  if (!dueDate || isFinal) return null;
  const due = /^\d{4}-\d{2}-\d{2}$/.test(dueDate)
    ? new Date(`${dueDate}T00:00:00`)
    : new Date(dueDate);
  if (!Number.isFinite(due.getTime())) return null;
  const day = (date: Date) =>
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const days = (day(due) - day(now)) / 86_400_000;
  return days < 0 ? "overdue" : days <= 7 ? "soon" : null;
}

export function groupMyTasks<T extends MyTaskViewItem>(
  tasks: T[],
  group: MyTasksGroup,
  now = new Date(),
) {
  const groups = new Map<string, T[]>();
  const add = (key: string, task: T) =>
    groups.set(key, [...(groups.get(key) ?? []), task]);
  for (const task of tasks) {
    if (group === "none") add("All tickets", task);
    else if (group === "board") add(task.boardName || task.boardId, task);
    else if (group === "status") add(task.status || "No status", task);
    else if (group === "priority") add(task.priority || "No priority", task);
    else if (group === "assignee") add(task.assigneeName || "Unassigned", task);
    else if (group === "milestone")
      add(task.milestoneName || "No milestone", task);
    else if (group === "dueDate") {
      if (!task.dueDate) add("No due date", task);
      else {
        // Date-only values are calendar dates, not UTC instants.
        const due = /^\d{4}-\d{2}-\d{2}$/.test(task.dueDate)
          ? new Date(`${task.dueDate}T00:00:00`)
          : new Date(task.dueDate);
        const day = (date: Date) =>
          Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
        const days = (day(due) - day(now)) / 86_400_000;
        add(
          days < 0
            ? "Overdue"
            : days === 0
              ? "Today"
              : days <= 7
                ? "Next 7 days"
                : "Later",
          task,
        );
      }
    } else if (task.labels.length === 0) add("No label", task);
    else for (const label of task.labels) add(label.name, task);
  }
  return [...groups.entries()];
}

export function summarizeTicketStatuses(
  tasks: Array<{ status: string | null; columnName?: string | null }>,
) {
  const groups = new Map<
    string,
    { slug: string; name: string; count: number; percent: number }
  >();
  for (const task of tasks) {
    const slug = task.status ?? "";
    const group = groups.get(slug) ?? {
      slug,
      name: task.columnName ?? slug,
      count: 0,
      percent: 0,
    };
    group.count++;
    groups.set(slug, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    percent: Math.round((group.count / tasks.length) * 100),
  }));
}
