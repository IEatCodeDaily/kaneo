import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  isWeekend,
  isWithinInterval,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import BoardLayout from "@/components/common/board-layout";
import { statusBarClasses } from "@/components/gantt/gantt-timeline";
import PageTitle from "@/components/page-title";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import { Button } from "@/components/ui/button";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import { cn } from "@/lib/cn";
import { useUserPreferencesStore } from "@/store/user-preferences";

type CalendarSearchParams = {
  taskId?: string;
};

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationId/board/$boardId/calendar",
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): CalendarSearchParams => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
  }),
});

function parseTaskDate(value: string | null) {
  if (!value) return null;
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed);
}

function RouteComponent() {
  const { t } = useTranslation();
  const { boardId, organizationId } = Route.useParams();
  const { taskId } = Route.useSearch();
  const navigate = useNavigate();
  const { data: board } = useGetTasks(boardId);
  const weekStartsOn = useUserPreferencesStore((state) => state.weekStartsOn);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));

  const openTask = (id: string) =>
    navigate({ to: ".", search: { taskId: id }, replace: true });

  const scheduledTasks = useMemo(() => {
    const tasks = [
      ...(board?.columns.flatMap((column) => column.tasks) ?? []),
      ...(board?.plannedTasks ?? []),
    ];

    return tasks
      .map((task) => {
        const parsedStart =
          parseTaskDate(task.startDate) ?? parseTaskDate(task.dueDate);
        const parsedEnd =
          parseTaskDate(task.dueDate) ?? parseTaskDate(task.startDate);
        if (!parsedStart || !parsedEnd) return null;

        return {
          ...task,
          scheduleStart: parsedStart <= parsedEnd ? parsedStart : parsedEnd,
          scheduleEnd: parsedEnd >= parsedStart ? parsedEnd : parsedStart,
        };
      })
      .filter((task): task is NonNullable<typeof task> => task !== null);
  }, [board]);

  // Full weeks around the month, so the grid is always rectangular.
  const gridDays = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(month), { weekStartsOn }),
        end: endOfWeek(endOfMonth(month), { weekStartsOn }),
      }),
    [month, weekStartsOn],
  );

  const weekdayLabels = useMemo(
    () => gridDays.slice(0, 7).map((day) => format(day, "EEEEEE")),
    [gridDays],
  );

  // A task appears on every day it spans, not just its due date.
  const tasksByDay = useMemo(() => {
    const map = new Map<string, typeof scheduledTasks>();
    for (const day of gridDays) {
      const key = day.toDateString();
      const hits = scheduledTasks.filter((task) =>
        isWithinInterval(day, {
          start: task.scheduleStart,
          end: task.scheduleEnd,
        }),
      );
      if (hits.length > 0) map.set(key, hits);
    }
    return map;
  }, [gridDays, scheduledTasks]);

  return (
    <BoardLayout
      boardId={boardId}
      organizationId={organizationId}
      activeView="calendar"
    >
      <PageTitle
        title={t("tasks:calendar.pageTitle", { name: board?.name })}
        hideAppName
      />
      <div className="flex h-full min-h-0 flex-col bg-background">
        <div className="flex items-center justify-between gap-3 border-b border-border/80 px-3 py-3 sm:px-4">
          <h1 className="text-sm font-semibold text-foreground">
            {format(month, "MMMM yyyy")}
          </h1>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-xs"
              aria-label={t("tasks:calendar.previousMonth")}
              onClick={() => setMonth((current) => subMonths(current, 1))}
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="xs"
              onClick={() => setMonth(startOfMonth(new Date()))}
            >
              {t("tasks:calendar.today")}
            </Button>
            <Button
              variant="outline"
              size="icon-xs"
              aria-label={t("tasks:calendar.nextMonth")}
              onClick={() => setMonth((current) => addMonths(current, 1))}
            >
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-7 border-b border-border/80">
          {weekdayLabels.map((label) => (
            <div
              key={label}
              className="px-2 py-1.5 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>

        <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-7 overflow-auto">
          {gridDays.map((day) => {
            const dayTasks = tasksByDay.get(day.toDateString()) ?? [];
            const outsideMonth = !isSameMonth(day, month);

            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "flex min-h-24 flex-col gap-1 border-r border-b border-border/60 px-[7px] py-1.5",
                  isWeekend(day) && "bg-muted/20",
                  outsideMonth && "bg-muted/40 text-muted-foreground",
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "flex size-5 items-center justify-center rounded-full text-[11px] font-medium",
                      isToday(day) && "bg-primary text-primary-foreground",
                      outsideMonth && !isToday(day) && "text-muted-foreground",
                    )}
                  >
                    {format(day, "d")}
                  </span>
                  {dayTasks.length > 2 ? (
                    <span className="text-[10px] text-muted-foreground">
                      {dayTasks.length}
                    </span>
                  ) : null}
                </div>

                {dayTasks.slice(0, 3).map((task) => {
                  const colors = statusBarClasses(task.status);
                  const isStart = isSameDay(day, task.scheduleStart);
                  const isEnd = isSameDay(day, task.scheduleEnd);
                  // Show the title on the first day and again at each week wrap,
                  // so a long band stays identifiable on every row it appears in.
                  const showLabel = isStart || day.getDay() === weekStartsOn;

                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => openTask(task.id)}
                      title={task.title}
                      className={cn(
                        // No w-full: width must come from the flex stretch so the
                        // negative margins below actually widen the band.
                        "flex h-[18px] items-center gap-1 border-y px-1 text-left text-[11px] leading-tight text-foreground transition-colors",
                        colors.fill,
                        colors.border,
                        // Bleed over the cell's padding (7px) and the right cell
                        // border (1px) so a multi-day task reads as one band.
                        isStart
                          ? "rounded-l-sm border-l"
                          : "-ml-[7px] border-l-0 pl-0",
                        isEnd
                          ? "rounded-r-sm border-r"
                          : "-mr-[8px] border-r-0",
                      )}
                    >
                      <span className="truncate">
                        {showLabel ? task.title : ""}
                      </span>
                    </button>
                  );
                })}

                {dayTasks.length > 3 ? (
                  <p className="px-1 text-[10px] text-muted-foreground">
                    {t("tasks:calendar.more", { count: dayTasks.length - 3 })}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>

        <TaskDetailsSheet
          taskId={taskId}
          boardId={boardId}
          organizationId={organizationId}
          onClose={() => navigate({ to: ".", search: {}, replace: true })}
        />
      </div>
    </BoardLayout>
  );
}
