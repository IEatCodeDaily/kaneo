import { useTranslation } from "react-i18next";
import useGetMyTasks from "@/hooks/queries/task/use-get-my-tasks";

/**
 * Open-task count badge for the sidebar "My Tasks" entry (KFL-141).
 *
 * Mirrors InboxUnreadBadge: same markup and styling, and it renders nothing
 * at all when there is nothing to do — no "0" badge.
 *
 * The query uses the same defaults as the My Tasks page (relation "all",
 * completed tasks excluded), so the badge and the page agree on the number.
 */
function MyTasksCountBadge({ organizationId }: { organizationId?: string }) {
  const { t } = useTranslation();
  const { data: tasks } = useGetMyTasks({
    organizationId,
    relation: "all",
    includeCompleted: false,
  });

  const taskCount = (tasks ?? []).length;

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
