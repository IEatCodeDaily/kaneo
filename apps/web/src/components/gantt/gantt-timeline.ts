import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfWeek,
  format,
  isSameMonth,
  isSameWeek,
  startOfWeek,
  subDays,
} from "date-fns";

export type GanttZoom = "day" | "week" | "month";

/** Column width in rem per zoom level. Day stays finger-friendly on mobile. */
const COLUMN_WIDTH_REM: Record<GanttZoom, { mobile: number; desktop: number }> =
  {
    day: { mobile: 3.125, desktop: 2.75 },
    week: { mobile: 1.25, desktop: 1 },
    month: { mobile: 0.5, desktop: 0.375 },
  };

export type GanttTimeline = {
  days: Date[];
  rangeStart: Date;
  gridTemplateColumns: string;
  timelineMinWidthRem: number;
  dayWidthRem: number;
  /** Header cells spanning 1+ day columns, depending on zoom. */
  headerCells: { key: string; label: string; sublabel: string; span: number }[];
};

/**
 * One day is always one grid column — zoom only changes how wide a day is and
 * how days are grouped in the header. Bar math stays in day units at every zoom.
 */
export function buildTimeline({
  earliest,
  latest,
  zoom,
  isMobile,
  weekStartsOn,
}: {
  earliest: Date;
  latest: Date;
  zoom: GanttZoom;
  isMobile: boolean;
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}): GanttTimeline {
  const dayWidthRem = COLUMN_WIDTH_REM[zoom][isMobile ? "mobile" : "desktop"];

  // Week-aligned bounds, padded so bars can be dragged past the current extremes.
  const rangeStart = subDays(startOfWeek(earliest, { weekStartsOn }), 7);
  const rangeEnd = addDays(endOfWeek(latest, { weekStartsOn }), 28);
  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });

  const headerCells: GanttTimeline["headerCells"] = [];
  for (const [index, day] of days.entries()) {
    const previous = days[index - 1];
    if (zoom === "day") {
      headerCells.push({
        key: day.toISOString(),
        label:
          !previous || !isSameMonth(day, previous) ? format(day, "MMM") : "",
        sublabel: format(day, "d"),
        span: 1,
      });
      continue;
    }
    const groupStarts =
      !previous ||
      (zoom === "week"
        ? !isSameWeek(day, previous, { weekStartsOn })
        : !isSameMonth(day, previous));
    if (groupStarts) {
      headerCells.push({
        key: day.toISOString(),
        label: zoom === "week" ? format(day, "MMM") : format(day, "yyyy"),
        sublabel: zoom === "week" ? format(day, "d") : format(day, "MMM"),
        span: 1,
      });
    } else {
      const current = headerCells[headerCells.length - 1];
      if (current) current.span += 1;
    }
  }

  return {
    days,
    rangeStart,
    dayWidthRem,
    gridTemplateColumns: `repeat(${days.length}, minmax(${dayWidthRem}rem, ${dayWidthRem}rem))`,
    timelineMinWidthRem: days.length * dayWidthRem,
    headerCells,
  };
}

/**
 * Bar tint by status family, so a row reads at a glance without a legend.
 * Falls back to a neutral tint for custom board columns.
 */
export function statusBarClasses(status: string): {
  fill: string;
  border: string;
  handle: string;
} {
  const normalized = status.toLowerCase().replace(/[\s_]/g, "-");
  if (normalized === "done" || normalized === "completed") {
    return {
      fill: "bg-emerald-500/25 group-hover:bg-emerald-500/35",
      border: "border-emerald-500/45",
      handle: "bg-emerald-500/20 hover:bg-emerald-500/35",
    };
  }
  if (normalized === "in-progress" || normalized === "in-review") {
    return {
      fill: "bg-blue-500/25 group-hover:bg-blue-500/35",
      border: "border-blue-500/45",
      handle: "bg-blue-500/20 hover:bg-blue-500/35",
    };
  }
  if (normalized === "planned" || normalized === "backlog") {
    return {
      fill: "bg-violet-500/25 group-hover:bg-violet-500/35",
      border: "border-violet-500/45",
      handle: "bg-violet-500/20 hover:bg-violet-500/35",
    };
  }
  if (normalized === "archived") {
    return {
      fill: "bg-muted-foreground/15 group-hover:bg-muted-foreground/25",
      border: "border-muted-foreground/30",
      handle: "bg-muted-foreground/15 hover:bg-muted-foreground/25",
    };
  }
  return {
    fill: "bg-primary/20 group-hover:bg-primary/30",
    border: "border-primary/40",
    handle: "bg-primary/15 hover:bg-primary/30",
  };
}

/** Left offset in rem of a date within the timeline, for overlays. */
export function dayOffsetRem(date: Date, timeline: GanttTimeline) {
  return (
    differenceInCalendarDays(date, timeline.rangeStart) * timeline.dayWidthRem
  );
}
