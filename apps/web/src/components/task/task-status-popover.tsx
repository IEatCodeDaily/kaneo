import { Archive, Check, Circle } from "lucide-react";
import { Fragment, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ShortcutNumber } from "@/components/ui/shortcut-number";
import { groupStatusesForPicker } from "@/constants/task-statuses";
import { useSetTaskArchived } from "@/hooks/mutations/task/use-set-task-archived";
import { useUpdateTaskStatus } from "@/hooks/mutations/task/use-update-task-status";
import { useGetColumns } from "@/hooks/queries/column/use-get-columns";
import { useNumberedShortcuts } from "@/hooks/use-numbered-shortcuts";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { getColumnIcon } from "@/lib/column";
import { getStatusDisplayLabel } from "@/lib/i18n/domain";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";

type TaskStatusPopoverProps = {
  task?: Task;
  boardId?: string;
  value?: string;
  onChange?: (status: string) => void;
  children?: React.ReactNode;
};

export default function TaskStatusPopover({
  task,
  boardId,
  value,
  onChange,
  children,
}: TaskStatusPopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const {
    data: columns,
    isLoading,
    isError,
  } = useGetColumns(task?.boardId ?? boardId ?? "");
  /*
    Every status is a board row (Triage, Planned and Duplicate included), so
    the picker is exactly the board's statuses — grouped Backlog / Active /
    Closed, in Status-settings order. Custom statuses appear automatically.
  */
  const sections = useMemo(
    () => groupStatusesForPicker(columns ?? []),
    [columns],
  );
  const statusOptions = useMemo(
    () => sections.flatMap((section) => section.statuses),
    [sections],
  );
  const { mutateAsync: updateTaskStatus } = useUpdateTaskStatus();
  const { mutateAsync: setArchived } = useSetTaskArchived();
  const { canManageTasks } = useOrganizationPermission();
  const canEdit = canManageTasks();
  const currentStatus = task?.status ?? value;

  const selectedOption = statusOptions.find(
    (status) => status.slug === currentStatus,
  );

  const isArchived = Boolean(task?.archivedAt);

  const handleArchiveToggle = useCallback(async () => {
    if (!task) return;
    try {
      await setArchived({
        taskId: task.id,
        archived: !isArchived,
        boardId: task.boardId,
      });
      setOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("tasks:archive.error"),
      );
    }
  }, [isArchived, setArchived, t, task]);

  const handleStatusChange = useCallback(
    async (newStatus: string) => {
      if (onChange) {
        onChange(newStatus);
        setOpen(false);
        return;
      }
      if (!task) return;
      try {
        await updateTaskStatus({
          ...task,
          status: newStatus,
        });
        setOpen(false);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("tasks:popover.status.updateError"),
        );
      }
    },
    [onChange, t, task, updateTaskStatus],
  );

  const shortcutOptions = useMemo(
    () =>
      statusOptions.map((status) => ({
        onSelect: () => handleStatusChange(status.slug),
      })),
    [handleStatusChange, statusOptions],
  );

  useNumberedShortcuts(open, shortcutOptions);

  if (task && !canEdit) return <>{children}</>;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children ?? (
          <Button
            data-testid="task-status-trigger"
            variant="ghost"
            size="sm"
            /*
             * Status is a task property, not a bare toolbar link. Match the
             * outlined property-chip contract used by Start date, Due date,
             * Priority, Assign and Labels in the create-ticket modal.
             */
            className="h-7 justify-start gap-1.5 rounded-md border border-border bg-transparent px-2.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          >
            {selectedOption ? (
              <span className="relative inline-flex items-center justify-center">
                {getColumnIcon(
                  selectedOption.slug,
                  selectedOption.isFinal,
                  selectedOption.icon,
                )}
                {isArchived && (
                  <Archive
                    aria-hidden="true"
                    className="absolute -bottom-1 -right-1.5 size-3 rounded-full bg-background text-muted-foreground"
                    data-testid="status-trigger-archived"
                  />
                )}
              </span>
            ) : (
              <Circle className="size-4 text-muted-foreground/60" />
            )}
            <span className="truncate text-xs font-semibold">
              {selectedOption
                ? getStatusDisplayLabel(
                    selectedOption.slug,
                    selectedOption.name,
                  )
                : t("tasks:status.label")}
            </span>
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-52 p-0" align="start">
        <div className="py-1">
          {isLoading ? (
            <div className="p-3 text-center text-sm text-muted-foreground">
              {t("common:empty.loading")}
            </div>
          ) : isError ? (
            <div className="p-3 text-center text-sm text-destructive">
              {t("common:error.title")}
            </div>
          ) : (
            <>
              {sections.map((section, sectionIndex) => (
                <Fragment key={section.id}>
                  {sectionIndex > 0 && (
                    <div
                      className="my-1 h-px bg-border"
                      data-testid="status-divider"
                    />
                  )}
                  <div
                    className="px-2 pt-1 pb-0.5 text-xs font-medium text-muted-foreground"
                    data-testid={`status-section-${section.id}`}
                  >
                    {t(`tasks:status.sections.${section.id}`)}
                  </div>
                  {section.statuses.map((status) => {
                    const shortcutIndex = statusOptions.indexOf(status) + 1;
                    return (
                      <Button
                        key={status.slug}
                        variant="ghost"
                        size="sm"
                        className="h-8 w-full justify-start gap-2 rounded-none px-2"
                        onClick={() => handleStatusChange(status.slug)}
                      >
                        {getColumnIcon(
                          status.slug,
                          status.isFinal,
                          status.icon,
                        )}
                        <span className="text-sm">
                          {getStatusDisplayLabel(status.slug, status.name)}
                        </span>
                        {currentStatus === status.slug ? (
                          <Check className="ml-auto h-4 w-4" />
                        ) : (
                          <ShortcutNumber number={shortcutIndex} />
                        )}
                      </Button>
                    );
                  })}
                </Fragment>
              ))}
              {/* Archive is not a status (#226): it hides the ticket via
                  archived_at, so it gets its own section below the status
                  list instead of sitting with the status types. */}
              {task && (
                <>
                  <div
                    className="my-1 h-px bg-border"
                    data-testid="archive-divider"
                  />
                  <Button
                    data-testid="task-archive-action"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-full justify-start gap-2 rounded-none px-2"
                    onClick={handleArchiveToggle}
                  >
                    <Archive className="size-4 text-muted-foreground" />
                    <span className="text-sm">
                      {isArchived
                        ? t("tasks:actions.unarchive")
                        : t("tasks:actions.archive")}
                    </span>
                    {isArchived && <Check className="ml-auto h-4 w-4" />}
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
