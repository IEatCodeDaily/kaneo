import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import useGetMyFlags from "@/hooks/queries/flag/use-get-my-flags";
import useGetMyTasks from "@/hooks/queries/task/use-get-my-tasks";

/**
 * Count badges for the sidebar "My Tickets" entry (KFL-141).
 *
 * Two separate counts, not one combined number:
 *   assigned -> neutral badge, same styling as the Inbox badge
 *   flagged  -> outlined badge, because a flag is someone asking for you
 *
 * "12 assigned and 2 flagged" renders as `12` in the neutral bubble and `2` in
 * the outlined pill. They are independent counts: a ticket that is both
 * assigned to you and flagged for you appears in both, because it is one
 * ticket wearing two different hats.
 *
 * Each badge hides itself at zero rather than showing a "0".
 */
function MyTasksCountBadge({ organizationId }: { organizationId?: string }) {
  const { t } = useTranslation();
  const { data: tasks } = useGetMyTasks({
    organizationId,
    relation: "assigned",
    includeCompleted: false,
  });
  const { data: flags } = useGetMyFlags(organizationId);

  const assignedCount = (tasks ?? []).length;
  // Resolved flags are finished work and must not be counted.
  const flaggedCount = (flags ?? []).filter((flag) => !flag.resolvedAt).length;

  if (assignedCount === 0 && flaggedCount === 0) return null;

  return (
    <span className="flex shrink-0 items-center gap-1">
      {flaggedCount > 0 && (
        <Badge
          size="count"
          variant="attention"
          aria-label={t("myTasks:flaggedCount", { count: flaggedCount })}
          role="status"
          data-testid="my-tasks-flagged-badge"
        >
          {flaggedCount > 99 ? "99+" : flaggedCount}
        </Badge>
      )}
      {assignedCount > 0 && (
        <Badge
          size="count"
          variant="count"
          aria-label={t("myTasks:count", { count: assignedCount })}
          role="status"
          data-testid="my-tasks-count-badge"
        >
          {assignedCount > 99 ? "99+" : assignedCount}
        </Badge>
      )}
    </span>
  );
}

export default MyTasksCountBadge;
