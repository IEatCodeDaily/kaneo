import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { format, isSameMonth, isToday, isWeekend, startOfDay } from "date-fns";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronRight as ChevronRightIcon,
  Search,
} from "lucide-react";
import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import BoardLayout from "@/components/common/board-layout";
import TaskViewControls from "@/components/common/task-view-controls";
import { GanttDependencyArrows } from "@/components/gantt/gantt-dependency-arrows";
import {
  matchesTaskQuery,
  partitionTasksBySchedule,
} from "@/components/gantt/gantt-scheduling";
import { GanttTaskBar } from "@/components/gantt/gantt-task-bar";
import {
  buildTimeline,
  dayOffsetRem,
  type GanttZoom,
  gridLineGradient,
  weekendTintGradient,
} from "@/components/gantt/gantt-timeline";
import PageTitle from "@/components/page-title";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import useGetBoardTaskRelations from "@/hooks/queries/task-relation/use-get-board-task-relations";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/cn";
import { getColumnIcon } from "@/lib/column";
import { getInitials } from "@/lib/get-initials";
import { getStatusLabel } from "@/lib/i18n/domain";
import {
  type DisplayConfig,
  type GroupField,
  type SortConfig,
  sortTasks,
} from "@/lib/sort-tasks";
import { useUserPreferencesStore } from "@/store/user-preferences";
import type Task from "@/types/task";

type GanttSearchParams = {
  taskId?: string;
};

const ZOOM_LEVELS: GanttZoom[] = ["day", "week", "month"];
const ROW_HEIGHT_PX = 30;
const INDENT_PX = 16;

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationId/board/$boardId/gantt",
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): GanttSearchParams => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
  }),
});

type ScheduledTask = {
  id: string;
  title: string;
  number: number | null;
  status: string;
  priority: string | null;
  startDate: string | null;
  dueDate: string | null;
  assigneeName: string | null;
  assigneeImage: string | null;
  boardId: string;
  scheduleStart?: Date;
  scheduleEnd?: Date;
  isForeign?: boolean;
  boardName?: string;
  boardSlug?: string;
};

type FlatRow = ScheduledTask & {
  depth: number;
  hasChildren: boolean;
  parentId: string | null;
};

/** A row that has dates and can therefore be drawn as a bar. */
type ScheduledFlatRow = FlatRow & { scheduleStart: Date; scheduleEnd: Date };

type Relation = {
  sourceTaskId: string;
  targetTaskId: string;
  relationType: string;
};

/** Build a tree from subtask edges, then flatten with depth for rendering. */
function buildNestedRows(
  tasks: ScheduledTask[],
  relations: Relation[],
): FlatRow[] {
  const childrenOf = new Map<string, string[]>();
  const parentOf = new Map<string, string>();
  const taskSet = new Set(tasks.map((t) => t.id));

  for (const rel of relations) {
    if (rel.relationType !== "subtask") continue;
    if (!taskSet.has(rel.sourceTaskId) || !taskSet.has(rel.targetTaskId))
      continue;
    const arr = childrenOf.get(rel.sourceTaskId) ?? [];
    arr.push(rel.targetTaskId);
    childrenOf.set(rel.sourceTaskId, arr);
    parentOf.set(rel.targetTaskId, rel.sourceTaskId);
  }

  const roots = tasks.filter((t) => !parentOf.has(t.id));
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const rows: FlatRow[] = [];
  const visited = new Set<string>();

  const walk = (taskId: string, depth: number) => {
    if (visited.has(taskId)) return;
    visited.add(taskId);
    const task = taskMap.get(taskId);
    if (!task) return;
    const kids = childrenOf.get(taskId) ?? [];
    rows.push({
      ...task,
      depth,
      hasChildren: kids.length > 0,
      parentId: parentOf.get(taskId) ?? null,
    });
    for (const childId of kids) walk(childId, depth + 1);
  };

  for (const root of roots) walk(root.id, 0);
  for (const task of tasks) {
    if (!visited.has(task.id))
      rows.push({ ...task, depth: 0, hasChildren: false, parentId: null });
  }

  return rows;
}

/** Filter flat rows by collapsed state — hide rows whose ancestor is collapsed. */
function applyCollapsed(rows: FlatRow[], collapsed: Set<string>): FlatRow[] {
  if (collapsed.size === 0) return rows;
  // O(n): pre-build parentId map instead of linear search per ancestor.
  const parentMap = new Map(rows.map((r) => [r.id, r.parentId]));
  const hidden = new Set<string>();
  for (const row of rows) {
    let ancestor = row.parentId;
    while (ancestor) {
      if (collapsed.has(ancestor)) {
        hidden.add(row.id);
        break;
      }
      ancestor = parentMap.get(ancestor) ?? null;
    }
  }
  return rows.filter((r) => !hidden.has(r.id));
}

// --- Row component (memoized for render perf) ---

type RowProps = {
  task: FlatRow;
  timeline: NonNullable<ReturnType<typeof buildTimeline>>;
  pixelsPerDay: number;
  isMobile: boolean;
  showTaskRail: boolean;
  taskColumnWidthRem: number;
  boardSlug: string | undefined;
  collapsed: boolean;
  display: DisplayConfig;
  /** Copy shown in the track for a task with no dates. */
  unscheduledHint: string;
  onToggleCollapse: (id: string) => void;
  onOpenTask: (task: FlatRow) => void;
};

const GanttRow = memo(function GanttRow({
  task,
  timeline,
  pixelsPerDay,
  isMobile,
  showTaskRail,
  taskColumnWidthRem,
  boardSlug,
  collapsed,
  display,
  unscheduledHint,
  onToggleCollapse,
  onOpenTask,
}: RowProps) {
  const isScheduled = Boolean(task.scheduleStart && task.scheduleEnd);
  return (
    <div
      className="grid items-stretch border-b border-border/60"
      style={{
        height: `${ROW_HEIGHT_PX}px`,
        contentVisibility: "auto",
        containIntrinsicSize: `auto ${ROW_HEIGHT_PX}px`,
        gridTemplateColumns: showTaskRail
          ? isMobile
            ? `${taskColumnWidthRem}rem max-content`
            : "20rem max-content"
          : "max-content",
      }}
    >
      {showTaskRail ? (
        <div className="sticky left-0 z-[11] h-full border-r border-border bg-background">
          {/* Chevron and label are siblings, not nested: a <button> inside a
              <button> is invalid HTML and breaks hydration. */}
          <div
            className="flex h-full w-full min-w-0 items-center gap-1 pr-2"
            style={{ paddingLeft: `${task.depth * INDENT_PX + 4}px` }}
          >
            {task.hasChildren ? (
              <button
                type="button"
                aria-expanded={!collapsed}
                aria-label={collapsed ? "Expand subtasks" : "Collapse subtasks"}
                className="flex size-5 shrink-0 items-center justify-center rounded hover:bg-muted-foreground/10"
                onClick={() => onToggleCollapse(task.id)}
              >
                {collapsed ? (
                  <ChevronRight className="size-3" />
                ) : (
                  <ChevronDown className="size-3" />
                )}
              </button>
            ) : (
              <span className="w-5 shrink-0" />
            )}
            <button
              type="button"
              className="flex h-full min-w-0 flex-1 items-center gap-1.5 text-left transition-colors hover:bg-muted"
              onClick={() => onOpenTask(task)}
            >
              {/*
                #129: the status was an uppercase text chip, which is noisy in
                a dense timeline row and inconsistent with every other surface.
                Now the same coloured icon the board, toolbar and My Tasks use,
                with the name kept as a tooltip rather than repeated as text.
              */}
              <span
                className="flex size-3.5 shrink-0 items-center justify-center"
                data-testid="gantt-status-icon"
                title={getStatusLabel(task.status)}
              >
                {getColumnIcon(task.status)}
              </span>
              {display.priority && task.priority ? (
                <span
                  className={cn(
                    "shrink-0 rounded px-1 py-px text-[9px] font-medium",
                    task.priority === "urgent" && "text-destructive-foreground",
                    task.priority === "high" && "text-warning-foreground",
                    task.priority === "medium" && "text-warning-foreground/85",
                    task.priority === "low" && "text-info-foreground",
                  )}
                >
                  {task.priority}
                </span>
              ) : null}
              <span className="shrink-0 truncate text-[9px] text-muted-foreground">
                {task.isForeign
                  ? `${task.boardSlug}-${task.number}`
                  : `${boardSlug}-${task.number}`}
              </span>
              {task.isForeign ? (
                <span className="shrink-0 rounded border border-dashed border-border px-1 py-px text-[9px] text-muted-foreground">
                  {task.boardName}
                </span>
              ) : null}
              <span className="min-w-0 truncate text-xs font-medium text-foreground">
                {task.title}
              </span>
              {display.assignee && task.assigneeName ? (
                <span
                  className="shrink-0"
                  title={task.assigneeName ?? undefined}
                >
                  <Avatar className="size-4">
                    <AvatarImage
                      src={task.assigneeImage ?? ""}
                      alt={task.assigneeName}
                    />
                    <AvatarFallback className="text-[8px] font-medium">
                      {getInitials(task.assigneeName)}
                    </AvatarFallback>
                  </Avatar>
                </span>
              ) : null}
            </button>
          </div>
        </div>
      ) : null}

      <div
        className="relative shrink-0 select-none"
        style={{ minWidth: `${timeline.timelineMinWidthRem}rem` }}
      >
        {isScheduled ? (
          <GanttTaskBar
            // GanttTaskBar types its task as the full Task shape; these rows
            // are the timeline's narrower projection of the same records.
            task={
              task as unknown as Task & {
                scheduleStart: Date;
                scheduleEnd: Date;
              }
            }
            timeline={timeline}
            pixelsPerDay={pixelsPerDay}
            isMobile={isMobile}
            readOnly={task.isForeign}
            onOpenTask={() => onOpenTask(task)}
          />
        ) : (
          // No dates means no bar to place. Keep the row present with a muted
          // hint pinned to the left of the track so the task is visible and
          // one click away from being scheduled.
          <button
            type="button"
            onClick={() => onOpenTask(task)}
            className="sticky left-0 z-[1] my-1 ml-2 flex h-[calc(100%-0.5rem)] items-center rounded border border-dashed border-border bg-background/80 px-2 text-[10px] text-muted-foreground transition-colors hover:bg-muted"
            style={{ width: "max-content" }}
          >
            {unscheduledHint}
          </button>
        )}
      </div>
    </div>
  );
});

function RouteComponent() {
  const { t } = useTranslation();
  const { boardId, organizationId } = Route.useParams();
  const { taskId } = Route.useSearch();
  const navigate = useNavigate();
  const { data: board, isPlaceholderData } = useGetTasks(boardId);
  const { data: relationData } = useGetBoardTaskRelations(boardId);
  const weekStartsOn = useUserPreferencesStore((state) => state.weekStartsOn);
  const [searchQuery, setSearchQuery] = useState("");
  // #152: timeline sections are collapsible.
  const [unscheduledCollapsed, setUnscheduledCollapsed] = useState(false);
  const [zoom, setZoom] = useState<GanttZoom>("day");
  const [sort, setSort] = useState<SortConfig>({
    field: "position",
    direction: "asc",
  });
  const [group, setGroup] = useState<GroupField>("none");
  const [display, setDisplay] = useState<DisplayConfig>({
    assignee: true,
    priority: false,
    labels: false,
    dates: true,
  });
  const isMobile = useIsMobile();
  const [isTaskRailOpen, setIsTaskRailOpen] = useState(false);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

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

  const toggleCollapse = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allTasks = useMemo(
    () => [
      ...(board?.columns.flatMap(
        (column: { tasks: ScheduledTask[] }) => column.tasks,
      ) ?? []),
      ...(board?.plannedTasks ?? []),
    ],
    [board],
  );

  const foreignRows = useMemo(() => {
    return (relationData?.foreignTasks ?? []).map((task) => ({
      ...task,
      description: null,
      position: null,
      createdAt: "",
      userId: null,
      assigneeId: null,
      assigneeName: null,
      assigneeImage: null,
      columnId: null,
      isForeign: true as const,
    }));
  }, [relationData]);

  // Tasks with no usable dates can't be drawn as a bar, but dropping them made
  // them invisible in this view (KFL-117). Split instead of filter: bars for
  // the scheduled ones, an "Unscheduled" group for the rest.
  const { scheduled: parsedTasks, unscheduled: unscheduledTasks } = useMemo(
    () => partitionTasksBySchedule([...allTasks, ...foreignRows]),
    [allTasks, foreignRows],
  );
  // Sort the flat task list before building the tree so parents/children
  // respect the selected sort within their subtree.
  // sortTasks() only reads shared fields (status/priority/dates/title), but is
  // typed against the full Task shape; these rows are a narrower projection.
  const sortedParsed = useMemo(
    () =>
      sortTasks(
        parsedTasks as unknown as Task[],
        sort,
      ) as unknown as typeof parsedTasks,
    [parsedTasks, sort],
  );

  // Nest subtasks under parents; flatten with depth.
  const nestedRows = useMemo(
    () => buildNestedRows(sortedParsed, relationData?.relations ?? []),
    [sortedParsed, relationData?.relations],
  );

  // When searching, expand all (ignore collapse) so results are visible.
  const searching = searchQuery.trim().length > 0;
  const visibleRows = useMemo(() => {
    if (searching) return nestedRows;
    return applyCollapsed(nestedRows, collapsedIds);
  }, [nestedRows, collapsedIds, searching]);

  const scheduledTasks = useMemo(() => {
    if (!searching) return visibleRows;
    return visibleRows.filter((task) =>
      matchesTaskQuery(task, searchQuery, board?.slug),
    );
  }, [visibleRows, searching, board?.slug, searchQuery]);

  // Unscheduled tasks are a flat lane — no nesting, no collapse, they have no
  // bars to relate to. They obey sort and search like every other row.
  const unscheduledRows = useMemo<FlatRow[]>(() => {
    const sorted = sortTasks(
      unscheduledTasks as unknown as Task[],
      sort,
    ) as unknown as ScheduledTask[];
    return sorted
      .filter((task) => matchesTaskQuery(task, searchQuery, board?.slug))
      .map((task) => ({
        ...task,
        depth: 0,
        hasChildren: false,
        parentId: null,
      }));
  }, [unscheduledTasks, sort, searchQuery, board?.slug]);

  // Deferred so navigation into this view paints immediately. React renders the
  // shell (toolbar, header, skeleton) with the previous/empty list, then renders
  // the real rows in a low-priority pass — the click no longer blocks on 185
  // rows of layout. `isStale` is what drives the skeleton below.
  const deferredRows = useDeferredValue(scheduledTasks);
  // Dependency arrows are drawn between bars, so only rows that actually have
  // both dates can participate. Narrow with a guard instead of casting: the
  // unscheduled lane deliberately carries rows with no dates at all.
  const arrowRows = useMemo(
    () =>
      deferredRows.filter(
        (row): row is ScheduledFlatRow =>
          row.scheduleStart instanceof Date && row.scheduleEnd instanceof Date,
      ),
    [deferredRows],
  );
  const rowsAreStale = deferredRows !== scheduledTasks;

  const timeline = useMemo(() => {
    // A board of only-unscheduled tasks still needs a grid to hang rows off,
    // otherwise the whole view falls back to the empty state and the tasks
    // disappear again. Anchor that grid on today.
    if (parsedTasks.length === 0) {
      if (unscheduledTasks.length === 0) return null;
      const today = startOfDay(new Date());
      return buildTimeline({
        earliest: today,
        latest: today,
        zoom,
        isMobile,
        weekStartsOn,
      });
    }
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
  }, [parsedTasks, unscheduledTasks.length, zoom, isMobile, weekStartsOn]);

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

  const railWidthRem = isMobile ? taskColumnWidthRem : 20;
  const timelineLeft = showTaskRail ? `${railWidthRem}rem` : "0rem";

  const openTask = useCallback(
    (task: FlatRow) => {
      if (task.isForeign) {
        navigate({
          to: "/dashboard/organization/$organizationId/board/$boardId/gantt",
          params: { organizationId, boardId: task.boardId },
          search: { taskId: task.id },
        });
      } else {
        navigate({ to: ".", search: { taskId: task.id }, replace: true });
      }
    },
    [navigate, organizationId],
  );

  // Month header: group timeline.days into month spans for a row above the day numbers.
  const monthSpans = useMemo(() => {
    if (!timeline) return [];
    const spans: { label: string; span: number; key: string }[] = [];
    for (const [i, day] of timeline.days.entries()) {
      const prev = timeline.days[i - 1];
      if (!prev || !isSameMonth(day, prev)) {
        spans.push({
          label: format(day, "MMMM yyyy"),
          span: 1,
          key: day.toISOString(),
        });
      } else {
        spans[spans.length - 1].span += 1;
      }
    }
    return spans;
  }, [timeline]);

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
        <div className="border-b border-border/80 px-3 py-2 sm:px-4">
          <div className="flex items-center gap-3">
            <TaskViewControls
              sort={sort}
              onSortChange={setSort}
              group={group}
              onGroupChange={setGroup}
              display={display}
              onDisplayChange={setDisplay}
            />
            <div className="relative w-full max-w-[14rem]">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t("tasks:gantt.searchPlaceholder")}
                className="h-7 min-h-0 [&_[data-slot=input]]:pl-7 [&_[data-slot=input]]:text-xs"
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <div className="inline-flex h-7 shrink-0 items-center gap-0.5 rounded-lg border border-border/80 bg-background p-0.5">
                {ZOOM_LEVELS.map((level) => (
                  <Button
                    key={level}
                    variant={zoom === level ? "secondary" : "ghost"}
                    size="xs"
                    onClick={() => {
                      setZoom(level);
                      hasAutoScrolled.current = false;
                    }}
                    className={cn(
                      "h-5 rounded-md px-2 text-xs",
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
                className="min-h-9 shrink-0 touch-manipulation sm:hidden"
                onClick={() => setIsTaskRailOpen((current) => !current)}
              >
                {showTaskRail ? (
                  <ChevronLeft className="size-3" />
                ) : (
                  <ChevronRightIcon className="size-3" />
                )}
                {showTaskRail
                  ? t("tasks:gantt.hideTasks")
                  : t("tasks:gantt.showTasks")}
              </Button>
            </div>
          </div>
        </div>

        {!timeline ||
        (parsedTasks.length === 0 && unscheduledTasks.length === 0) ? (
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
        ) : scheduledTasks.length === 0 && unscheduledRows.length === 0 ? (
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
            className={cn(
              "min-h-0 flex-1 overflow-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]",
              // Showing the previous board's rows while the new ones load.
              isPlaceholderData && "pointer-events-none opacity-50",
            )}
          >
            <div className="relative min-w-max touch-pan-x touch-pan-y">
              {/* Sticky header: month row + day row */}
              <div className="sticky top-0 z-20 bg-background/95 backdrop-blur">
                <div className="flex border-b border-border">
                  {showTaskRail ? (
                    <div
                      className="sticky left-0 z-30 shrink-0 border-r border-border bg-background px-2 py-1 sm:w-80 sm:px-3"
                      style={{
                        width: isMobile
                          ? `${taskColumnWidthRem}rem`
                          : undefined,
                      }}
                    >
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {t("tasks:gantt.taskHeader")}
                      </p>
                    </div>
                  ) : null}
                  {/* Month span row */}
                  <div
                    className="grid shrink-0"
                    style={{
                      gridTemplateColumns: timeline.gridTemplateColumns,
                      minWidth: `${timeline.timelineMinWidthRem}rem`,
                    }}
                  >
                    {monthSpans.map((ms) => (
                      <div
                        key={ms.key}
                        style={{ gridColumn: `span ${ms.span}` }}
                        className="border-r border-border/50 px-1 py-0.5 text-[10px] font-semibold text-muted-foreground"
                      >
                        {ms.label}
                      </div>
                    ))}
                  </div>
                </div>
                {/* Day row */}
                <div className="flex border-b border-border">
                  {showTaskRail ? (
                    <div
                      className="sticky left-0 z-30 shrink-0 border-r border-border bg-background sm:w-80"
                      style={{
                        width: isMobile
                          ? `${taskColumnWidthRem}rem`
                          : undefined,
                      }}
                    />
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
                            "border-r border-border/70 px-0.5 py-0.5 text-center sm:px-1",
                            zoom === "day" &&
                              isWeekend(cellDate) &&
                              "bg-muted/25",
                          )}
                        >
                          <div className="h-3 truncate text-[10px] font-medium text-muted-foreground">
                            {cell.label}
                          </div>
                          <div
                            className={cn(
                              "mx-auto flex h-4 min-w-4 items-center justify-center truncate rounded-full px-1 text-[10px] font-medium",
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
              </div>

              {/* Body */}
              <div className="relative">
                {/* Grid background: one gradient-painted div instead of one
                    element per day. Day columns are a repeating gradient; the
                    weekend tint is a second gradient with a 7-day period
                    anchored to the first weekend in range. */}
                <div
                  ref={timelineTrackRef}
                  aria-hidden="true"
                  className="absolute inset-y-0 z-0"
                  style={{
                    left: timelineLeft,
                    width: `${timeline.timelineMinWidthRem}rem`,
                    ...(zoom === "day"
                      ? {
                          backgroundImage: [
                            weekendTintGradient(timeline),
                            gridLineGradient(timeline),
                          ]
                            .filter(Boolean)
                            .join(", "),
                        }
                      : {}),
                  }}
                />

                {/* Today line */}
                {todayInRange ? (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 z-[6] w-px bg-primary/70"
                    style={{
                      left: `calc(${timelineLeft} + ${todayLeftRem + timeline.dayWidthRem / 2}rem)`,
                    }}
                  />
                ) : null}

                {/* Dependency arrows (blocks/related only) */}
                <div
                  className="pointer-events-none absolute inset-y-0 z-[5]"
                  style={{
                    left: timelineLeft,
                    width: `${timeline.timelineMinWidthRem}rem`,
                  }}
                >
                  <GanttDependencyArrows
                    relations={relationData?.relations ?? []}
                    rows={arrowRows}
                    timeline={timeline}
                    rowHeightPx={ROW_HEIGHT_PX}
                    pixelsPerDay={pixelsPerDay}
                  />
                </div>

                {/* Rows. Dimmed while a deferred render is in flight so the
                    view reads as "working" instead of frozen. */}
                <div
                  className={cn(
                    "relative z-10 flex flex-col",
                    rowsAreStale && "opacity-60 transition-opacity",
                  )}
                >
                  {deferredRows.map((task) => (
                    <GanttRow
                      key={task.id}
                      task={task}
                      timeline={timeline}
                      pixelsPerDay={pixelsPerDay}
                      isMobile={isMobile}
                      showTaskRail={showTaskRail}
                      taskColumnWidthRem={taskColumnWidthRem}
                      boardSlug={board?.slug}
                      collapsed={collapsedIds.has(task.id)}
                      display={display}
                      unscheduledHint={t("tasks:gantt.unscheduledHint")}
                      onToggleCollapse={toggleCollapse}
                      onOpenTask={openTask}
                    />
                  ))}

                  {/* Unscheduled lane. Same rows, no bars — a labelled divider
                      keeps them from reading as an unexplained gap at the top
                      of the grid. */}
                  {unscheduledRows.length > 0 ? (
                    <>
                      {/*
                        #152: the section header sticks to the left AND to the
                        top of the scroll area, and toggles its rows. It was
                        only `sticky left-0`, so it scrolled out of view
                        vertically and could not be collapsed.
                      */}
                      <button
                        type="button"
                        aria-expanded={!unscheduledCollapsed}
                        data-testid="gantt-section-unscheduled"
                        onClick={() => setUnscheduledCollapsed((open) => !open)}
                        className="sticky left-0 top-0 z-[14] flex w-full items-center gap-2 border-y border-border bg-muted/40 px-3 py-1 text-left hover:bg-muted/60"
                        style={{ width: showTaskRail ? undefined : "100%" }}
                      >
                        <ChevronDown
                          aria-hidden="true"
                          className={cn(
                            "size-3 shrink-0 text-muted-foreground transition-transform",
                            unscheduledCollapsed && "-rotate-90",
                          )}
                        />
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {t("tasks:gantt.unscheduledGroup")}
                        </span>
                        <span className="rounded bg-secondary px-1 py-px text-[9px] font-medium text-secondary-foreground">
                          {unscheduledRows.length}
                        </span>
                      </button>
                      {!unscheduledCollapsed &&
                        unscheduledRows.map((task) => (
                          <GanttRow
                            key={task.id}
                            task={task}
                            timeline={timeline}
                            pixelsPerDay={pixelsPerDay}
                            isMobile={isMobile}
                            showTaskRail={showTaskRail}
                            taskColumnWidthRem={taskColumnWidthRem}
                            boardSlug={board?.slug}
                            collapsed={false}
                            display={display}
                            unscheduledHint={t("tasks:gantt.unscheduledHint")}
                            onToggleCollapse={toggleCollapse}
                            onOpenTask={openTask}
                          />
                        ))}
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        )}

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
