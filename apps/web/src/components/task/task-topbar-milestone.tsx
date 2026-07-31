import type { Milestone as MilestoneRow } from "@/fetchers/milestone/get-milestones-by-board";
import useGetMilestonesByBoard from "@/hooks/queries/milestone/use-get-milestones-by-board";
import useGetTask from "@/hooks/queries/task/use-get-task";
import MilestoneBadge from "./milestone-badge";
import TaskMilestonePicker from "./task-milestone-picker";

type TaskTopbarMilestoneProps = {
  taskId: string;
  boardId: string;
};

/**
 * Milestone control for the task-detail topbar. It used to live in the
 * right-hand properties sidebar; the topbar keeps it visible while the sidebar
 * is collapsed.
 */
export default function TaskTopbarMilestone({
  taskId,
  boardId,
}: TaskTopbarMilestoneProps) {
  const { data: task } = useGetTask(taskId);
  const resolvedBoardId = task?.boardId ?? boardId;
  const milestoneId =
    (task as { milestoneId?: string | null } | undefined)?.milestoneId ?? null;
  const { data: milestones = [] } = useGetMilestonesByBoard(resolvedBoardId);
  const selectedMilestone = milestones.find(
    (milestone: MilestoneRow) => milestone.id === milestoneId,
  );

  if (!taskId) return null;

  return (
    <div
      data-testid="task-topbar-milestone"
      data-slot="task-topbar-milestone"
      className="flex min-w-0 items-center gap-1.5"
    >
      <TaskMilestonePicker
        taskId={taskId}
        boardId={resolvedBoardId}
        milestoneId={milestoneId}
      />
      <MilestoneBadge milestone={selectedMilestone} />
    </div>
  );
}
