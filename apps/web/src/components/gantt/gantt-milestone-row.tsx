import { differenceInCalendarDays, format } from "date-fns";
import { Diamond, Milestone } from "lucide-react";
import { cn } from "@/lib/cn";
import type { GanttMilestone } from "./gantt-milestones";
import type { GanttTimeline } from "./gantt-timeline";

const statusClasses: Record<string, string> = {
  planned:
    "border-violet-500/50 bg-violet-500/15 text-violet-700 dark:text-violet-300",
  active:
    "border-indigo-500/60 bg-indigo-500/20 text-indigo-700 dark:text-indigo-300",
  completed:
    "border-emerald-500/60 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
  archived: "border-muted-foreground/30 bg-muted/60 text-muted-foreground",
};

export function GanttMilestoneRow({
  milestone,
  timeline,
  showTaskRail,
  taskColumnWidthRem,
  isMobile,
}: {
  milestone: GanttMilestone;
  timeline: GanttTimeline;
  showTaskRail: boolean;
  taskColumnWidthRem: number;
  isMobile: boolean;
}) {
  const spanStart = milestone.spanStart
    ? differenceInCalendarDays(milestone.spanStart, timeline.rangeStart)
    : null;
  const spanEnd = milestone.spanEnd
    ? differenceInCalendarDays(milestone.spanEnd, timeline.rangeStart)
    : null;
  const target = milestone.targetDate
    ? differenceInCalendarDays(milestone.targetDate, timeline.rangeStart)
    : null;
  const statusClass =
    statusClasses[milestone.status.toLowerCase()] ?? statusClasses.planned;

  return (
    <div
      data-testid={`gantt-milestone-${milestone.id}`}
      className="grid h-9 items-stretch border-b border-indigo-500/20 bg-indigo-500/[0.035]"
      style={{
        gridTemplateColumns: showTaskRail
          ? isMobile
            ? `${taskColumnWidthRem}rem max-content`
            : "20rem max-content"
          : "max-content",
      }}
    >
      {showTaskRail ? (
        <div className="sticky left-0 z-[12] flex min-w-0 items-center gap-2 border-r border-indigo-500/20 bg-background px-3">
          <Milestone className="size-3.5 shrink-0 text-indigo-500" />
          <span className="min-w-0 flex-1 truncate text-xs font-semibold">
            {milestone.name}
          </span>
          <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground">
            {milestone.percentComplete}% · {milestone.completedCount}/
            {milestone.taskCount}
          </span>
        </div>
      ) : null}
      <div
        className="relative grid shrink-0 items-center"
        style={{
          gridTemplateColumns: timeline.gridTemplateColumns,
          minWidth: `${timeline.timelineMinWidthRem}rem`,
        }}
      >
        {spanStart !== null && spanEnd !== null ? (
          <div
            data-testid={`gantt-milestone-span-${milestone.id}`}
            className="relative z-[1] mx-1 h-3 overflow-hidden rounded-full border border-indigo-500/40 bg-indigo-500/10"
            style={{
              gridColumn: `${Math.max(1, spanStart + 1)} / ${Math.min(timeline.days.length + 1, spanEnd + 2)}`,
            }}
            title={`${milestone.name}: ${format(milestone.spanStart as Date, "MMM d")} – ${format(milestone.spanEnd as Date, "MMM d")} (${milestone.percentComplete}%)`}
          >
            <div
              className="h-full bg-indigo-500/45"
              style={{ width: `${milestone.percentComplete}%` }}
            />
          </div>
        ) : null}
        {target !== null && target >= 0 && target < timeline.days.length ? (
          <div
            data-testid={`gantt-milestone-target-${milestone.id}`}
            className="pointer-events-none absolute inset-y-0 z-[2] grid items-center"
            style={{
              gridTemplateColumns: timeline.gridTemplateColumns,
              width: "100%",
            }}
          >
            <div
              style={{ gridColumn: `${target + 1}` }}
              className="flex justify-center"
              title={`${milestone.name}: ${milestone.targetIsExplicit ? "due" : "inferred target"} ${format(milestone.targetDate as Date, "MMM d, yyyy")}`}
            >
              <Diamond
                className={cn("size-4 fill-current stroke-[1.5]", statusClass)}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
