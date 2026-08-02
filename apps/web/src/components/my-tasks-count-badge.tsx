import { useTranslation } from "react-i18next";
import useGetMyFlags from "@/hooks/queries/flag/use-get-my-flags";
import useGetMyTasks from "@/hooks/queries/task/use-get-my-tasks";

/**
 * Count badge for the sidebar "My Tickets" entry (KFL-141).
 *
 * The ticket is explicit about what each sidebar badge counts:
 *   Inbox       -> everything (handled by InboxUnreadBadge)
 *   My Tickets  -> "flagged and assigned tickets"
 *
 * So this counts tickets ASSIGNED to the signed-in user, plus any ticket
 * flagged for them that they are not already assigned to. Flags are the
 * "someone needs you on this" signal, so a flagged ticket belongs in the
 * count even when it is assigned to somebody else — but a ticket that is
 * both assigned and flagged must only be counted once.
 *
 * Mirrors InboxUnreadBadge's markup and styling, and renders nothing at all
 * when there is nothing to do rather than showing a "0".
 */
function MyTasksCountBadge({ organizationId }: { organizationId?: string }) {
  const { t } = useTranslation();
  const { data: tasks } = useGetMyTasks({
    organizationId,
    relation: "assigned",
    includeCompleted: false,
  });
  const { data: flags } = useGetMyFlags();

  // Union, not sum: a ticket both assigned to me and flagged for me is one
  // item of work, not two. Resolved flags are done, so they do not count.
  const workIds = new Set<string>(
    (tasks ?? []).map((task: { id: string }) => task.id),
  );
  for (const flag of flags ?? []) {
    if (!flag.resolvedAt) workIds.add(flag.taskId);
  }
  const taskCount = workIds.size;

  if (taskCount === 0) return null;

  return (
    <span
      aria-label={t("myTasks:count", { count: taskCount })}
      role="status"
      className="ml-auto flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-sidebar-primary px-1 font-semibold text-[10px] text-sidebar-primary-foreground leading-none"
      data-testid="my-tasks-count-badge"
    >
      {taskCount > 99 ? "99+" : taskCount}
    </span>
  );
}

export default MyTasksCountBadge;
