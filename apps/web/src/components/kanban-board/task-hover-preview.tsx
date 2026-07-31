import { format } from "date-fns";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/preview-card";
import { getInitials } from "@/lib/get-initials";
import type Task from "@/types/task";

/**
 * Hover-intent delay. Long enough that sweeping the pointer across a dense
 * column doesn't strobe previews open, short enough to still feel intentional.
 */
export const TASK_PREVIEW_OPEN_DELAY = 450;
export const TASK_PREVIEW_CLOSE_DELAY = 120;

type TaskHoverPreviewProps = {
  task: Task;
  boardSlug?: string;
  assigneeName?: string;
  assigneeImage?: string;
  children: ReactElement;
};

/**
 * Wraps a task card in a hover preview. Pointer-only on purpose: a touch
 * device has no hover state, and opening a popover on tap would swallow the
 * tap that is supposed to open the task.
 */
function TaskHoverPreview({
  task,
  boardSlug,
  assigneeName,
  assigneeImage,
  children,
}: TaskHoverPreviewProps) {
  const { t } = useTranslation();

  const labels = task.labels ?? [];

  return (
    <HoverCard
      openDelay={TASK_PREVIEW_OPEN_DELAY}
      closeDelay={TASK_PREVIEW_CLOSE_DELAY}
      delay={TASK_PREVIEW_OPEN_DELAY}
    >
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        className="w-80 p-3"
        side="right"
        align="start"
        data-slot="task-hover-preview"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex flex-col gap-2">
          <div className="font-mono text-[10px] text-muted-foreground/90">
            {boardSlug ? `${boardSlug}-${task.number}` : `#${task.number}`}
          </div>

          <p className="text-sm font-medium leading-snug text-foreground/95">
            {task.title}
          </p>

          <dl className="flex flex-col gap-1.5 text-xs">
            <div className="flex items-center gap-2">
              <dt className="w-20 shrink-0 text-muted-foreground">
                {t("tasks:preview.assignee")}
              </dt>
              <dd className="flex min-w-0 items-center gap-1.5">
                {assigneeName ? (
                  <>
                    <Avatar className="h-4 w-4">
                      <AvatarImage src={assigneeImage ?? ""} alt="" />
                      <AvatarFallback className="text-[8px]">
                        {getInitials(assigneeName)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate">{assigneeName}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    {t("tasks:assignee.unassigned")}
                  </span>
                )}
              </dd>
            </div>

            <div className="flex items-center gap-2">
              <dt className="w-20 shrink-0 text-muted-foreground">
                {t("tasks:preview.priority")}
              </dt>
              <dd className="truncate capitalize">
                {task.priority || t("tasks:preview.none")}
              </dd>
            </div>

            <div className="flex items-center gap-2">
              <dt className="w-20 shrink-0 text-muted-foreground">
                {t("tasks:preview.dueDate")}
              </dt>
              <dd className="truncate">
                {task.dueDate
                  ? format(new Date(task.dueDate), "PP")
                  : t("tasks:preview.noDueDate")}
              </dd>
            </div>

            <div className="flex items-start gap-2">
              <dt className="w-20 shrink-0 text-muted-foreground">
                {t("tasks:preview.labels")}
              </dt>
              <dd className="flex min-w-0 flex-wrap gap-1">
                {labels.length > 0 ? (
                  labels.map((label) => (
                    <span
                      key={label.id}
                      className="rounded border border-border/70 bg-muted/55 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {label.name}
                    </span>
                  ))
                ) : (
                  <span className="text-muted-foreground">
                    {t("tasks:preview.none")}
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

export default TaskHoverPreview;
