import { Check } from "lucide-react";
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
import { useUpdateTaskStatus } from "@/hooks/mutations/task/use-update-task-status";
import { useGetColumns } from "@/hooks/queries/column/use-get-columns";
import { useNumberedShortcuts } from "@/hooks/use-numbered-shortcuts";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { getColumnIcon } from "@/lib/column";
import { getStatusDisplayLabel } from "@/lib/i18n/domain";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";

type SubtaskStatusPopoverProps = {
  tasks: Task[];
  boardId: string;
  children: React.ReactNode;
};

export default function SubtaskStatusPopover({
  tasks,
  boardId,
  children,
}: SubtaskStatusPopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data: columns } = useGetColumns(boardId);
  // Every status is a board row: the picker is exactly the board's statuses.
  const sections = useMemo(
    () => groupStatusesForPicker(columns ?? []),
    [columns],
  );
  const statusOptions = useMemo(
    () => sections.flatMap((section) => section.statuses),
    [sections],
  );
  const { mutateAsync: updateTaskStatus } = useUpdateTaskStatus();
  const { canManageTasks } = useOrganizationPermission();
  const canEdit = canManageTasks();

  const allSameStatus =
    tasks.length > 0 && tasks.every((t) => t.status === tasks[0].status);
  const currentStatus = allSameStatus ? tasks[0].status : null;

  const handleStatusChange = useCallback(
    async (newStatus: string) => {
      try {
        await Promise.all(
          tasks.map((task) =>
            updateTaskStatus({
              ...task,
              status: newStatus,
            }),
          ),
        );
        setOpen(false);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("tasks:popover.status.updateError"),
        );
      }
    },
    [t, tasks, updateTaskStatus],
  );

  const shortcutOptions = useMemo(
    () =>
      statusOptions.map((status) => ({
        onSelect: () => handleStatusChange(status.slug),
      })),
    [handleStatusChange, statusOptions],
  );

  useNumberedShortcuts(open, shortcutOptions);

  if (!canEdit) return <>{children}</>;

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-52 p-0" align="start">
        <div className="py-1">
          {sections.map((section, sectionIndex) => (
            <Fragment key={section.id}>
              {sectionIndex > 0 && <div className="my-1 h-px bg-border" />}
              <div className="px-2 pt-1 pb-0.5 text-xs font-medium text-muted-foreground">
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
                    {getColumnIcon(status.slug, status.isFinal, status.icon)}
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
        </div>
      </PopoverContent>
    </Popover>
  );
}
