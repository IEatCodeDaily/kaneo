import { differenceInCalendarDays, format, isToday, parseISO } from "date-fns";
import { CalendarRange } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  buildTimeline,
  dayOffsetRem,
  type GanttZoom,
  gridLineGradient,
  weekendTintGradient,
} from "@/components/gantt/gantt-timeline";
import icons from "@/constants/board-icons";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/cn";

/** Only the board fields the timeline needs, so callers can pass their own shape. */
export type TimelineBoard = {
  id: string;
  name: string;
  icon?: string | null;
  statistics?: {
    totalTasks?: number;
    completionPercentage?: number;
    startsAt?: string | Date | null;
    endsAt?: string | Date | null;
  } | null;
};

type ScheduledBoard = {
  board: TimelineBoard;
  start: Date;
  end: Date;
};

/** Mirrors the boards table: icon is a lucide name, with Layout as fallback. */
function BoardIcon({ icon }: { icon?: string | null }) {
  const Icon = icons[icon as keyof typeof icons] ?? icons.Layout;
  return <Icon className="mr-1.5 inline size-3.5 align-[-2px]" />;
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = typeof value === "string" ? parseISO(value) : value;
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Boards on a timeline, reusing the board Gantt's own timeline maths
 * (`buildTimeline`, the grid/weekend gradients, `dayOffsetRem`) so the two views
 * scale, tint and align identically. Each board spans its earliest task start to
 * its latest task due date, computed server-side in `getBoards`.
 *
 * Read-only by design: a board's span is derived from its tasks, so dragging a
 * board bar has no single obvious meaning. Editing stays in the board Gantt.
 */
export default function BoardsTimeline({
  boards,
  zoom,
  weekStartsOn = 1,
  onBoardClick,
}: {
  boards: TimelineBoard[];
  zoom: GanttZoom;
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  onBoardClick: (boardId: string) => void;
}) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  const scheduled = useMemo<ScheduledBoard[]>(() => {
    return boards
      .map((board) => {
        const start = toDate(board.statistics?.startsAt);
        const end = toDate(board.statistics?.endsAt);
        if (!start || !end) return null;
        // Inverted data means the board's own task dates disagree; rendering it
        // would place a bar at a misleading position, so drop it the same way an
        // undated board is dropped. Equal dates are fine — a single-day bar.
        if (end < start) return null;
        return { board, start, end };
      })
      .filter((entry): entry is ScheduledBoard => entry !== null)
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [boards]);

  const timeline = useMemo(() => {
    if (scheduled.length === 0) return null;
    let earliest = scheduled[0].start;
    let latest = scheduled[0].end;
    for (const entry of scheduled) {
      if (entry.start < earliest) earliest = entry.start;
      if (entry.end > latest) latest = entry.end;
    }
    return buildTimeline({ earliest, latest, zoom, isMobile, weekStartsOn });
  }, [scheduled, zoom, isMobile, weekStartsOn]);

  if (scheduled.length === 0 || !timeline) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center"
        data-testid="boards-timeline-empty"
      >
        <CalendarRange className="size-5 text-muted-foreground" />
        <p className="text-sm font-medium">
          {t("organization:boards.timeline.emptyTitle", {
            defaultValue: "No scheduled boards",
          })}
        </p>
        <p className="max-w-sm text-xs text-muted-foreground">
          {t("organization:boards.timeline.emptyDescription", {
            defaultValue:
              "Boards appear here once their tasks have start or due dates.",
          })}
        </p>
      </div>
    );
  }

  const weekendTint = weekendTintGradient(timeline);
  const todayOffset = timeline.days.some((day) => isToday(day))
    ? dayOffsetRem(new Date(), timeline)
    : null;

  return (
    <div className="overflow-x-auto" data-testid="boards-timeline">
      <div style={{ minWidth: `${timeline.timelineMinWidthRem + 14}rem` }}>
        {/* Header: same grouped cells as the board Gantt. */}
        <div className="flex border-b border-border">
          <div className="w-56 shrink-0 px-3 py-2 text-xs font-medium text-muted-foreground">
            {t("organization:boards.timeline.boardColumn", {
              defaultValue: "Board",
            })}
          </div>
          <div
            className="grid flex-1"
            style={{ gridTemplateColumns: timeline.gridTemplateColumns }}
          >
            {timeline.headerCells.map((cell) => (
              <div
                className="border-l border-border/60 px-1 py-2 text-center"
                key={cell.key}
                style={{ gridColumn: `span ${cell.span}` }}
              >
                <div className="truncate text-[11px] font-medium">
                  {cell.label}
                </div>
                <div className="truncate text-[10px] text-muted-foreground">
                  {cell.sublabel}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          {/* Today marker spans every row, like the board Gantt. */}
          {todayOffset !== null && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-primary/70"
              data-testid="boards-timeline-today"
              style={{ left: `calc(14rem + ${todayOffset}rem)` }}
            />
          )}

          {scheduled.map(({ board, start, end }) => {
            const startIndex = differenceInCalendarDays(
              start,
              timeline.rangeStart,
            );
            const daySpan = differenceInCalendarDays(end, start) + 1;
            const total = board.statistics?.totalTasks ?? 0;
            const percent = board.statistics?.completionPercentage ?? 0;

            return (
              <div
                className="flex border-b border-border/60 last:border-b-0 hover:bg-accent/30"
                key={board.id}
              >
                <button
                  className="w-56 shrink-0 truncate px-3 py-2 text-left text-sm outline-none hover:underline"
                  onClick={() => onBoardClick(board.id)}
                  title={board.name}
                  type="button"
                >
                  {/* Boards store a lucide icon name, matching the table view. */}
                  <BoardIcon icon={board.icon} />
                  {board.name}
                </button>
                <div
                  className="relative grid flex-1 items-center py-2"
                  style={{
                    backgroundImage: [weekendTint, gridLineGradient(timeline)]
                      .filter(Boolean)
                      .join(", "),
                    gridTemplateColumns: timeline.gridTemplateColumns,
                  }}
                >
                  <button
                    className={cn(
                      "relative z-[5] flex h-6 min-w-0 items-center gap-1.5 overflow-hidden rounded px-2.5",
                      "bg-primary/25 ring-1 ring-inset ring-primary/40 hover:bg-primary/35",
                    )}
                    data-testid={`boards-timeline-bar-${board.id}`}
                    onClick={() => onBoardClick(board.id)}
                    style={{
                      gridColumn: `${Math.max(1, startIndex + 1)} / span ${Math.max(1, daySpan)}`,
                    }}
                    title={`${board.name} · ${format(start, "MMM d")} → ${format(end, "MMM d, yyyy")}`}
                    type="button"
                  >
                    {/* Completion fill: progress is inferred from the board's
                        tasks, so it belongs on the bar itself. */}
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 bg-primary/35"
                      style={{ width: `${percent}%` }}
                    />
                    {/* Sits above the completion fill, so it needs full
                        foreground contrast rather than muted. */}
                    <span className="relative truncate text-[11px] font-semibold text-foreground">
                      {total > 0
                        ? t("organization:boards.timeline.barLabel", {
                            defaultValue: "{{percent}}% · {{count}} tasks",
                            count: total,
                            percent,
                          })
                        : board.name}
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
