import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { format, isToday, isWeekend, parseISO, startOfDay } from "date-fns";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import BoardLayout from "@/components/common/board-layout";
import { GanttDependencyArrows } from "@/components/gantt/gantt-dependency-arrows";
import { GanttTaskBar } from "@/components/gantt/gantt-task-bar";
import {
  buildTimeline,
  dayOffsetRem,
  type GanttZoom,
} from "@/components/gantt/gantt-timeline";
import PageTitle from "@/components/page-title";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import useGetBoardTaskRelations from "@/hooks/queries/task-relation/use-get-board-task-relations";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/cn";
import { getStatusLabel } from "@/lib/i18n/domain";
import { useUserPreferencesStore } from "@/store/user-preferences";

type GanttSearchParams = {
  taskId?: string;
};

const ZOOM_LEVELS: GanttZoom[] = ["day", "week", "month"];
const ROW_HEIGHT_PX = 44;

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationId/board/$boardId/gantt",
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): GanttSearchParams => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
  }),
});

function parseTaskDate(value: string | null) {
  if (!value) return null;
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function RouteComponent() {
  const { t } = useTranslation();
  const { boardId, organizationId } = Route.useParams();
  const { taskId } = Route.useSearch();
  const navigate = useNavigate();
  const { data: board } = useGetTasks(boardId);
  const { data: relationData } = useGetBoardTaskRelations(boardId);
  const weekStartsOn = useUserPreferencesStore((state) => state.weekStartsOn);
  const [searchQuery, setSearchQuery] = useState("");
  const [zoom, setZoom] = useState<GanttZoom>("day");
  const isMobile = useIsMobile();
  const [isTaskRailOpen, setIsTaskRailOpen] = useState(false);

  const taskColumnWidthRem = isMobile ? 12 : 14;
  const showTaskRail = !isMobile || isTaskRailOpen;
  const scrollRef = useRef<HTMLDivElement>(null);
  const timelineTrackRef = useRef<HTMLDivElement>(null);
  const [pixelsPerDay, setPixelsPerDay] = useState(44);

  useEffect(() => {
    if (!isMobile) {
      setIsTaskRailOpen(true);
      return;
    }

    setIsTaskRailOpen(false);
  }, [isMobile]);

  const allTasks = useMemo(
    () => [
      ...(board?.columns.flatMap((column) => column.tasks) ?? []),
      ...(board?.plannedTasks ?? []),
    ],
    [board],
  );

  // Cross-board relatives (one parent per task, plus cross-board children) are
  // shown as read-only rows so an arrow never points at nothing.
  const foreignRows = useMemo(() => {
    return (relationData?.foreignTasks ?? []).map((task) => ({
      ...task,
      description: null,
      position: null,
      createdAt: "",
      userId: null,
      assigneeId: null,
      assigneeName: null,
      columnId: null,
      isForeign: true as const,
    }));
  }, [relationData]);

  const parsedTasks = useMemo(() => {
    return [...allTasks, ...foreignRows]
      .map((task) => {
        const parsedStart =
          parseTaskDate(task.startDate) ?? parseTaskDate(task.dueDate);
        const parsedEnd =
          parseTaskDate(task.dueDate) ?? parseTaskDate(task.startDate);

        if (!parsedStart || !parsedEnd) return null;

        const start = parsedStart <= parsedEnd ? parsedStart : parsedEnd;
        const end = parsedEnd >= parsedStart ? parsedEnd : parsedStart;

        return {
          ...task,
          scheduleStart: start,
          scheduleEnd: end,
        };
      })
      .filter((task): task is NonNullable<typeof task> => task !== null)
      .sort(
        (left, right) =>
          left.scheduleStart.getTime() - right.scheduleStart.getTime(),
      );
  }, [allTasks, foreignRows]);

  const scheduledTasks = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return parsedTasks;

    return parsedTasks.filter((task) => {
      return (
        task.title.toLowerCase().includes(normalizedQuery) ||
        `${board?.slug ?? ""}-${task.number ?? ""}`
          .toLowerCase()
          .includes(normalizedQuery) ||
        task.status.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [parsedTasks, board?.slug, searchQuery]);

  const timeline = useMemo(() => {
    if (parsedTasks.length === 0) return null;

    const earliest = parsedTasks.reduce(
      (current, task) =>
        task.scheduleStart < current ? task.scheduleStart : current,
      parsedTasks[0].scheduleStart,
    );
    const latest = parsedTasks.reduce(
      (current, task) =>
        task.scheduleEnd > current ? task.scheduleEnd : current,
      parsedTasks[0].scheduleEnd,
    );

    return buildTimeline({
      earliest,
      latest,
      zoom,
      isMobile,
      weekStartsOn,
    });
  }, [parsedTasks, zoom, isMobile, weekStartsOn]);

  useLayoutEffect(() => {
    const element = timelineTrackRef.current;
    if (!element || !timeline) return;

    const update = () => {
      const count = timeline.days.length;
      if (count <= 0) return;
      setPixelsPerDay(element.clientWidth / count);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [timeline]);

  // Land on today rather than the padded start of the range, so the first
  // paint shows current work instead of empty lead-in columns.
  const hasAutoScrolled = useRef(false);
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !timeline || hasAutoScrolled.current || pixelsPerDay <= 0)
      return;

    const todayOffsetPx =
      (dayOffsetRem(startOfDay(new Date()), timeline) / timeline.dayWidthRem) *
      pixelsPerDay;
    const railPx = showTaskRail
      ? isMobile
        ? taskColumnWidthRem * 16
        : 320
      : 0;
    const target = todayOffsetPx + railPx - scroller.clientWidth / 3;
    scroller.scrollLeft = Math.max(0, target);
    hasAutoScrolled.current = true;
  }, [timeline, pixelsPerDay, showTaskRail, isMobile, taskColumnWidthRem]);

  const todayLeftRem = timeline
    ? dayOffsetRem(startOfDay(new Date()), timeline)
    : 0;
  const todayInRange =
    timeline &&
    todayLeftRem >= 0 &&
    todayLeftRem < timeline.timelineMinWidthRem;

  return (
    <BoardLayout
      boardId={boardId}
      organizationId={organizationId}
      activeView="gantt"
    >
      <PageTitle
        title={t("tasks:gantt.pageTitle", { name: board?.name })}
        hideAppName
      />
      <div className="flex h-full min-h-0 flex-col bg-background">
        <div className="border-b border-border/80 px-3 py-3 sm:px-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <h1 className="text-sm font-semibold text-foreground">
                {t("tasks:gantt.title")}
              </h1>
            </div>

            <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <div className="relative w-full max-w-sm">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={t("tasks:gantt.searchPlaceholder")}
                  className="h-9 min-h-11 touch-manipulation sm:h-8 sm:min-h-0 [&_[data-slot=input]]:pl-8 [&_[data-slot=input]]:text-xs"
                />
              </div>

              <div className="inline-flex h-8 shrink-0 items-center gap-0.5 rounded-lg border border-border/80 bg-background p-0.5">
                {ZOOM_LEVELS.map((level) => (
                  <Button
                    key={level}
                    variant={zoom === level ? "secondary" : "ghost"}
                    size="xs"
                    onClick={() => {
                      setZoom(level);
                      // Re-centre on today at the new column width.
                      hasAutoScrolled.current = false;
                    }}
                    className={cn(
                      "h-6 rounded-md px-2 text-xs",
                      zoom !== level && "text-muted-foreground",
                    )}
                  >
                    {t(`tasks:gantt.zoom.${level}`)}
                  </Button>
                ))}
              </div>

              <Button
                variant="outline"
                size="xs"
                className="min-h-11 shrink-0 touch-manipulation sm:hidden"
                onClick={() => setIsTaskRailOpen((current) => !current)}
              >
                {showTaskRail ? (
                  <ChevronLeft className="size-3.5" />
                ) : (
                  <ChevronRight className="size-3.5" />
                )}
                {showTaskRail
                  ? t("tasks:gantt.hideTasks")
                  : t("tasks:gantt.showTasks")}
              </Button>
            </div>
          </div>
        </div>

        {!timeline || parsedTasks.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-6">
            <div className="max-w-sm text-center">
              <h2 className="text-sm font-semibold text-foreground">
                {t("tasks:gantt.noTasks")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("tasks:gantt.noTasksSubtitle")}
              </p>
            </div>
          </div>
        ) : scheduledTasks.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-6">
            <div className="max-w-sm text-center">
              <h2 className="text-sm font-semibold text-foreground">
                {t("tasks:gantt.noTasksFound")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("tasks:gantt.noTasksMatch", { query: searchQuery })}
              </p>
            </div>
          </div>
        ) : (
          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]"
          >
            <div className="relative min-w-max touch-pan-x touch-pan-y">
              <div className="sticky top-0 z-20 flex border-b border-border bg-background/95 backdrop-blur">
                {showTaskRail ? (
                  <div
                    className="sticky left-0 z-30 shrink-0 border-r border-border bg-background px-2 py-2.5 sm:w-80 sm:px-4 sm:py-3"
                    style={{
                      width: isMobile ? `${taskColumnWidthRem}rem` : undefined,
                    }}
                  >
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {t("tasks:gantt.taskHeader")}
                    </p>
                  </div>
                ) : null}
                <div
                  className="grid shrink-0"
                  style={{
                    gridTemplateColumns: timeline.gridTemplateColumns,
                    minWidth: `${timeline.timelineMinWidthRem}rem`,
                  }}
                >
                  {timeline.headerCells.map((cell) => {
                    const cellDate = new Date(cell.key);
                    return (
                      <div
                        key={cell.key}
                        style={{ gridColumn: `span ${cell.span}` }}
                        className={cn(
                          "border-r border-border/70 px-0.5 py-2 text-center sm:px-1",
                          zoom === "day" &&
                            isWeekend(cellDate) &&
                            "bg-muted/25",
                        )}
                      >
                        <div className="h-4 truncate text-[10px] font-medium text-muted-foreground">
                          {cell.label}
                        </div>
                        <div
                          className={cn(
                            "mx-auto flex h-6 min-w-6 items-center justify-center truncate rounded-full px-1 text-xs font-medium",
                            zoom === "day" &&
                              isToday(cellDate) &&
                              "bg-primary text-primary-foreground",
                          )}
                        >
                          {cell.sublabel}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="relative">
                <div
                  ref={timelineTrackRef}
                  className="absolute inset-y-0 z-0 grid"
                  style={{
                    left: showTaskRail
                      ? isMobile
                        ? `${taskColumnWidthRem}rem`
                        : "20rem"
                      : "0rem",
                    gridTemplateColumns: timeline.gridTemplateColumns,
                    width: `${timeline.timelineMinWidthRem}rem`,
                  }}
                >
                  {timeline.days.map((day) => (
                    <div
                      key={`bg-line-${day.toISOString()}`}
                      className={cn(
                        "h-full min-h-0",
                        zoom === "day" && "border-r border-border/60",
                        zoom === "day" && isWeekend(day) && "bg-muted/25",
                      )}
                    />
                  ))}
                </div>

                {todayInRange ? (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 z-[6] w-px bg-primary/70"
                    style={{
                      left: `calc(${
                        showTaskRail
                          ? isMobile
                            ? `${taskColumnWidthRem}rem`
                            : "20rem"
                          : "0rem"
                      } + ${todayLeftRem + timeline.dayWidthRem / 2}rem)`,
                    }}
                  />
                ) : null}

                <div
                  className="pointer-events-none absolute inset-y-0 z-[5]"
                  style={{
                    left: showTaskRail
                      ? isMobile
                        ? `${taskColumnWidthRem}rem`
                        : "20rem"
                      : "0rem",
                    width: `${timeline.timelineMinWidthRem}rem`,
                  }}
                >
                  <GanttDependencyArrows
                    relations={relationData?.relations ?? []}
                    rows={scheduledTasks}
                    timeline={timeline}
                    rowHeightPx={ROW_HEIGHT_PX}
                    pixelsPerDay={pixelsPerDay}
                  />
                </div>

                <div className="relative z-10 flex flex-col">
                  {scheduledTasks.map((task) => {
                    return (
                      <div
                        key={task.id}
                        className="grid items-stretch border-b border-border/70"
                        style={{
                          gridTemplateColumns: showTaskRail
                            ? isMobile
                              ? `${taskColumnWidthRem}rem max-content`
                              : "20rem max-content"
                            : "max-content",
                        }}
                      >
                        {showTaskRail ? (
                          <div className="sticky left-0 z-[11] h-full border-r border-border bg-background">
                            <button
                              type="button"
                              className="flex min-h-[44px] w-full min-w-0 flex-col items-start justify-center gap-0.5 px-2 py-2 text-left transition-colors hover:bg-muted sm:min-h-0 sm:px-3 sm:py-1.5"
                              onClick={() =>
                                "isForeign" in task
                                  ? navigate({
                                      to: "/dashboard/organization/$organizationId/board/$boardId/gantt",
                                      params: {
                                        organizationId,
                                        boardId: task.boardId,
                                      },
                                      search: { taskId: task.id },
                                    })
                                  : navigate({
                                      to: ".",
                                      search: { taskId: task.id },
                                      replace: true,
                                    })
                              }
                            >
                              <div className="flex w-full items-center gap-1.5">
                                <span className="max-w-[7rem] truncate rounded-full bg-secondary px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-secondary-foreground sm:max-w-none">
                                  {getStatusLabel(task.status)}
                                </span>
                                <span className="truncate text-[10px] text-muted-foreground">
                                  {"boardSlug" in task
                                    ? `${task.boardSlug}-${task.number}`
                                    : `${board?.slug}-${task.number}`}
                                </span>
                                {"isForeign" in task ? (
                                  <span className="shrink-0 rounded-full border border-dashed border-border px-1.5 py-px text-[10px] text-muted-foreground">
                                    {task.boardName}
                                  </span>
                                ) : null}
                              </div>
                              <p className="w-full line-clamp-1 text-xs font-medium leading-tight text-foreground">
                                {task.title}
                              </p>
                              <p className="w-full truncate text-[11px] leading-tight text-muted-foreground">
                                {format(task.scheduleStart, "MMM d")} -{" "}
                                {format(task.scheduleEnd, "MMM d")}
                                {task.assigneeName
                                  ? ` • ${task.assigneeName}`
                                  : ""}
                              </p>
                            </button>
                          </div>
                        ) : null}

                        <div
                          className="relative min-h-11 shrink-0 select-none"
                          style={{
                            minWidth: `${timeline.timelineMinWidthRem}rem`,
                          }}
                        >
                          <GanttTaskBar
                            task={task}
                            timeline={timeline}
                            pixelsPerDay={pixelsPerDay}
                            isMobile={isMobile}
                            readOnly={"isForeign" in task}
                            onOpenTask={() =>
                              "isForeign" in task
                                ? navigate({
                                    to: "/dashboard/organization/$organizationId/board/$boardId/gantt",
                                    params: {
                                      organizationId,
                                      boardId: task.boardId,
                                    },
                                    search: { taskId: task.id },
                                  })
                                : navigate({
                                    to: ".",
                                    search: { taskId: task.id },
                                    replace: true,
                                  })
                            }
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        <TaskDetailsSheet
          taskId={taskId}
          boardId={boardId}
          organizationId={organizationId}
          onClose={() =>
            navigate({
              to: ".",
              search: {},
              replace: true,
            })
          }
        />
      </div>
    </BoardLayout>
  );
}
