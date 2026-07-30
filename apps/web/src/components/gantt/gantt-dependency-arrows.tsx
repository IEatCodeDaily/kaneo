import { differenceInCalendarDays } from "date-fns";
import type { GanttTimeline } from "./gantt-timeline";

export type GanttRelation = {
  id: string;
  sourceTaskId: string;
  targetTaskId: string;
  relationType: string;
};

type Row = { id: string; scheduleStart: Date; scheduleEnd: Date };

/**
 * Dependency arrows drawn as one SVG over the timeline: source bar end elbows
 * across to the target bar start. "related" edges are skipped — they carry no
 * ordering, so an arrow would imply a constraint that does not exist.
 */
export function GanttDependencyArrows({
  relations,
  rows,
  timeline,
  rowHeightPx,
  pixelsPerDay,
}: {
  relations: GanttRelation[];
  rows: Row[];
  timeline: GanttTimeline;
  rowHeightPx: number;
  pixelsPerDay: number;
}) {
  const rowIndex = new Map(rows.map((row, index) => [row.id, index]));
  const dayToX = (date: Date) =>
    differenceInCalendarDays(date, timeline.rangeStart) * pixelsPerDay;

  const edges = relations.filter(
    (relation) =>
      (relation.relationType === "blocks" ||
        relation.relationType === "subtask") &&
      rowIndex.has(relation.sourceTaskId) &&
      rowIndex.has(relation.targetTaskId),
  );

  if (edges.length === 0) return null;

  const height = rows.length * rowHeightPx;
  const width = timeline.days.length * pixelsPerDay;

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[5] overflow-visible"
      width={width}
      height={height}
      aria-hidden="true"
    >
      <title>Task dependencies</title>
      <defs>
        <marker
          id="gantt-arrowhead"
          markerWidth="7"
          markerHeight="7"
          refX="6"
          refY="3.5"
          orient="auto"
        >
          <path d="M0,0 L7,3.5 L0,7 Z" className="fill-muted-foreground/80" />
        </marker>
      </defs>
      {edges.map((edge) => {
        const from = rows[rowIndex.get(edge.sourceTaskId) as number];
        const to = rows[rowIndex.get(edge.targetTaskId) as number];
        const fromRow = rowIndex.get(edge.sourceTaskId) as number;
        const toRow = rowIndex.get(edge.targetTaskId) as number;

        // Source bar's right edge (end day is inclusive) to target bar's left edge.
        const x1 = dayToX(from.scheduleEnd) + pixelsPerDay - 4;
        const y1 = fromRow * rowHeightPx + rowHeightPx / 2;
        const x2 = dayToX(to.scheduleStart) + 2;
        const y2 = toRow * rowHeightPx + rowHeightPx / 2;

        // Horizontal travel happens in the gutter between the two rows, never at
        // bar height, so a link can't be mistaken for touching an unrelated bar.
        const stub = 10;
        const gutterY =
          (toRow > fromRow ? toRow : fromRow) * rowHeightPx +
          (toRow > fromRow ? 0 : rowHeightPx);
        const forward = x2 >= x1 + stub * 2;

        const path = forward
          ? // Enough room ahead: one elbow straight into the target.
            `M ${x1} ${y1} H ${(x1 + x2) / 2} V ${y2} H ${x2}`
          : // Target starts before the source ends: out, into the gutter, back
            // across, then down into the target's left edge.
            `M ${x1} ${y1} H ${x1 + stub} V ${gutterY} H ${x2 - stub} V ${y2} H ${x2}`;

        return (
          <path
            key={edge.id}
            d={path}
            fill="none"
            className="stroke-muted-foreground/60"
            strokeWidth={1.5}
            strokeLinejoin="round"
            markerEnd="url(#gantt-arrowhead)"
          />
        );
      })}
    </svg>
  );
}
