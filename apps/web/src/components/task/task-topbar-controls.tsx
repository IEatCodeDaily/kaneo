import TaskFlagSection from "@/components/flag/task-flag-section";
import TaskSyncedIssueProperty from "./task-synced-issue-property";
import TaskTopbarMilestone from "./task-topbar-milestone";

type TaskTopbarControlsProps = {
  taskId: string;
  boardId: string;
  organizationId: string;
};

/**
 * Header-only controls: milestone, flag and the synced-issue link out. The
 * properties bar keeps status, priority and dates (2026-11 owner direction:
 * milestone and flag belong in the header).
 */
export default function TaskTopbarControls({
  taskId,
  boardId,
  organizationId,
}: TaskTopbarControlsProps) {
  return (
    <div
      className="flex min-w-0 items-center gap-2"
      data-testid="task-topbar-controls"
    >
      {taskId ? (
        <>
          <TaskTopbarMilestone taskId={taskId} boardId={boardId} />
          <TaskFlagSection
            taskId={taskId}
            boardId={boardId}
            organizationId={organizationId}
          />
        </>
      ) : null}
      <TaskSyncedIssueProperty
        compact
        organizationId={organizationId}
        taskId={taskId}
      />
    </div>
  );
}
