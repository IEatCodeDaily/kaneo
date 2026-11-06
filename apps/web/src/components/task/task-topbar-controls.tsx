import TaskSyncedIssueProperty from "./task-synced-issue-property";

type TaskTopbarControlsProps = {
  taskId: string;
  boardId: string;
  organizationId: string;
};

/**
 * Header-only controls. Milestone and flag moved into the properties bar
 * (TaskPropertiesSidebar); the synced issue stays here as a link out.
 */
export default function TaskTopbarControls({
  taskId,
  organizationId,
}: TaskTopbarControlsProps) {
  return (
    <div
      className="flex min-w-0 items-center gap-2"
      data-testid="task-topbar-controls"
    >
      <TaskSyncedIssueProperty
        compact
        organizationId={organizationId}
        taskId={taskId}
      />
    </div>
  );
}
