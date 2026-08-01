import type { TaskFlag } from "@/fetchers/flag/get-task-flags";
import useGetTaskFlags from "@/hooks/queries/flag/use-get-task-flags";
import FlagBadge from "./flag-badge";

type TaskFlagBadgesProps = {
  taskId: string;
};

/**
 * Board-card surface: renders only ACTIVE flags (the API already filters
 * resolved ones out unless includeResolved is asked for).
 */
export function TaskFlagBadges({ taskId }: TaskFlagBadgesProps) {
  const { data: flags = [] } = useGetTaskFlags(taskId);
  const activeFlags = (flags as TaskFlag[]).filter((flag) => !flag.resolvedAt);

  if (activeFlags.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {activeFlags.map((flag) => (
        <FlagBadge key={flag.id} flag={flag} />
      ))}
    </div>
  );
}

export default TaskFlagBadges;
