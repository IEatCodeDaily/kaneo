import { useTranslation } from "react-i18next";
import type {
  DashboardFieldView,
  DashboardPanelSpec,
  DashboardQueryRow,
} from "@/types/dashboards";
import {
  fieldFormat,
  findField,
  formatMetricValue,
  labelColor,
  labelToText,
} from "./panel-data";

export type ResolvedRow = { text: string; value: number; color: string };

export type RendererProps = {
  spec: DashboardPanelSpec;
  rows: ResolvedRow[];
  fields: DashboardFieldView[];
  memberNames: Map<string, string>;
};

// Map stored query labels → display text + series color, once, upstream.
export function resolveRows(
  spec: DashboardPanelSpec,
  rows: DashboardQueryRow[],
  fields: DashboardFieldView[],
  memberNames: Map<string, string>,
): ResolvedRow[] {
  const groupField = findField(fields, spec.query.groupBy?.fieldId);
  return rows.map((row, index) => ({
    text: labelToText(
      row.label,
      fields,
      spec.query.groupBy?.fieldId,
      spec.query.groupBy?.bucket,
      memberNames,
    ),
    value: row.value,
    color: labelColor(row.label, groupField, index),
  }));
}

function formatTotal(
  spec: DashboardPanelSpec,
  fields: DashboardFieldView[],
  rows: ResolvedRow[],
) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  // Compact notation: the donut center is ~40 SVG units wide — a full
  // currency amount overflows and gets clipped mid-digit.
  const value = new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(total);
  const format = fieldFormat(findField(fields, spec.query.metric.fieldId));
  return format.kind === "currency" && format.currencyCode
    ? `${format.currencyCode} ${value}`
    : value;
}

export function StatPanel({ spec, rows, fields }: RendererProps) {
  const value = rows[0]?.value ?? 0;
  return (
    <div className="flex flex-1 items-center">
      <span className="text-2xl font-semibold tabular-nums">
        {formatMetricValue(
          spec.query.metric.agg,
          findField(fields, spec.query.metric.fieldId),
          value,
        )}
      </span>
    </div>
  );
}

export function BarPanel({ rows }: RendererProps) {
  const total = rows.reduce((sum, row) => sum + row.value, 0) || 1;
  return (
    <div className="flex flex-1 flex-col justify-center gap-2.5">
      {rows.map((row) => {
        const pct = Math.round((row.value / total) * 100);
        return (
          <div
            key={`${row.text}-${rows.indexOf(row)}`}
            className="flex items-center gap-2 text-xs"
          >
            <span className="min-w-0 flex-1 truncate">{row.text}</span>
            <div
              aria-hidden
              className="h-2 w-2/5 shrink-0 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, background: row.color }}
              />
            </div>
            <span className="w-9 shrink-0 text-right tabular-nums text-muted-foreground">
              {pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

const LINE_W = 320;
const LINE_H = 120;
const LINE_TOP = 14;
const LINE_BOTTOM = 104;

function TimeSeriesPanel({
  spec,
  rows,
  area,
}: RendererProps & { area?: boolean }) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  const step = rows.length > 1 ? (LINE_W - 20) / (rows.length - 1) : 0;
  const points = rows.map((row, index) => ({
    x: 10 + index * step,
    y: LINE_BOTTOM - (row.value / max) * (LINE_BOTTOM - LINE_TOP),
  }));
  const line = points.map((p) => `${p.x},${p.y}`).join(" ");
  const color = "#10b981";
  // Up to 4 evenly spread x labels (mock style).
  const labelIdx = [
    ...new Set(
      [0, 1, 2, 3].map((i) => Math.round((i * (rows.length - 1)) / 3)),
    ),
  ];
  // Gridline values (y = 30/60/90 → value back-solved from the plot scale).
  const gridValues = [30, 60, 90].map(
    (y) => ((LINE_BOTTOM - y) / (LINE_BOTTOM - LINE_TOP)) * max,
  );
  // Y-label gutter sized from the widest label (design v3 S5), so the plot
  // area starts where the numbers end instead of a fixed guess.
  const yLabels = [max, ...gridValues].map((value) =>
    value.toLocaleString(undefined, { maximumFractionDigits: 2 }),
  );
  const yGutter = Math.max(...yLabels.map((label) => label.length)) * 5.4 + 8;
  return (
    <div className="flex flex-1 flex-col justify-center">
      <div className="flex items-stretch">
        <div
          className="relative h-[130px] shrink-0 text-right text-muted-foreground"
          style={{ width: yGutter, fontSize: 8.5 }}
        >
          {[30, 60, 90].map((y, index) => (
            <span
              key={`y-${y}`}
              className="absolute -translate-y-1/2 tabular-nums"
              style={{ top: y - 2, right: 4 }}
            >
              {yLabels[index + 1]}
            </span>
          ))}
          <span
            className="absolute -translate-y-1/2 tabular-nums"
            style={{ top: LINE_BOTTOM - 2, right: 4 }}
          >
            {yLabels[0] === yLabels[1] ? "" : "0"}
          </span>
        </div>
        <svg
          aria-hidden="true"
          viewBox={`0 0 ${LINE_W} ${LINE_H}`}
          width="100%"
          height={130}
          preserveAspectRatio="none"
        >
          <g className="stroke-border" strokeWidth={1}>
            <line x1={0} y1={30} x2={LINE_W} y2={30} />
            <line x1={0} y1={60} x2={LINE_W} y2={60} />
            <line x1={0} y1={90} x2={LINE_W} y2={90} />
          </g>
          {area ? (
            <polyline
              fill={color}
              fillOpacity={0.1}
              stroke="none"
              points={`${line} ${points[points.length - 1]?.x ?? 10},${LINE_BOTTOM} ${points[0]?.x ?? 10},${LINE_BOTTOM}`}
            />
          ) : null}
          <polyline fill="none" stroke={color} strokeWidth={2} points={line} />
          <g fill={color}>
            {points.map((p) => (
              <circle key={`${p.x},${p.y}`} cx={p.x} cy={p.y} r={2.5} />
            ))}
          </g>
          <g className="fill-muted-foreground" fontSize={8.5}>
            {labelIdx.map((index) => (
              <text
                key={`label-${index}`}
                x={Math.min(
                  Math.max((points[index]?.x ?? 6) - 4, 2),
                  LINE_W - 24,
                )}
                y={116}
              >
                {rows[index]?.text}
              </text>
            ))}
          </g>
        </svg>
      </div>
      <span className="sr-only">
        {spec.title}:{" "}
        {rows.map((row) => `${row.text} = ${row.value}`).join(", ")}
      </span>
    </div>
  );
}

export function LinePanel(props: RendererProps) {
  return <TimeSeriesPanel {...props} />;
}

export function AreaPanel(props: RendererProps) {
  return <TimeSeriesPanel {...props} area />;
}

export function PiePanel({ spec, rows, fields }: RendererProps) {
  const { t } = useTranslation();
  const total = rows.reduce((sum, row) => sum + row.value, 0) || 1;
  // r = 15.9 → circumference ≈ 100, so dasharray units are percentages.
  let offset = 25;
  return (
    <div className="flex flex-1 items-center gap-4">
      <svg
        aria-hidden="true"
        viewBox="0 0 42 42"
        width={118}
        height={118}
        className="shrink-0"
      >
        <circle
          cx={21}
          cy={21}
          r={15.9}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={6}
        />
        {rows.map((row) => {
          const pct = (row.value / total) * 100;
          const dash = `${pct} ${100 - pct}`;
          const el = (
            <circle
              key={`${row.text}-${rows.indexOf(row)}`}
              cx={21}
              cy={21}
              r={15.9}
              fill="none"
              stroke={row.color}
              strokeWidth={6}
              strokeDasharray={dash}
              strokeDashoffset={offset}
              transform="rotate(-90 21 21)"
            />
          );
          offset -= pct;
          return el;
        })}
        <text
          x={21}
          y={20}
          textAnchor="middle"
          fontSize={7}
          fill="var(--muted-foreground)"
        >
          {t("navigation:dashboards.total")}
        </text>
        <text
          x={21}
          y={27}
          textAnchor="middle"
          fontSize={8}
          fontWeight={700}
          fill="var(--foreground)"
        >
          {formatTotal(spec, fields, rows)}
        </text>
      </svg>
      <ul className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs">
        {rows.map((row) => {
          const pct = Math.round((row.value / total) * 100);
          return (
            <li
              key={`${row.text}-${rows.indexOf(row)}`}
              className="flex items-center gap-2"
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ background: row.color }}
              />
              <span className="min-w-0 flex-1 truncate">{row.text}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {pct}%
              </span>
            </li>
          );
        })}
      </ul>
      <span className="sr-only">
        {spec.title}:{" "}
        {rows.map((row) => `${row.text} = ${row.value}`).join(", ")}
      </span>
    </div>
  );
}

export function TablePanel({ spec, rows, fields }: RendererProps) {
  const shown = rows.slice(0, 10);
  if (!spec.query.groupBy) {
    return (
      <div className="flex flex-1 items-center">
        <span className="text-2xl font-semibold tabular-nums">
          {formatMetricValue(
            spec.query.metric.agg,
            findField(fields, spec.query.metric.fieldId),
            rows[0]?.value ?? 0,
          )}
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col justify-center gap-1">
      <table className="w-full text-sm">
        <tbody>
          {shown.map((row) => (
            <tr
              key={`${row.text}-${rows.indexOf(row)}`}
              className="border-b border-border/60 last:border-0"
            >
              <td className="min-w-0 truncate py-1.5 pe-2">{row.text}</td>
              <td className="py-1.5 text-right tabular-nums">
                {formatMetricValue(
                  spec.query.metric.agg,
                  findField(fields, spec.query.metric.fieldId),
                  row.value,
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 10 ? <RowsLimitNote limit={10} /> : null}
    </div>
  );
}

export function RowsLimitNote({ limit }: { limit: number }) {
  const { t } = useTranslation();
  return (
    <p className="text-xs text-muted-foreground">
      {t("navigation:dashboards.rowsLimit", { limit })}
    </p>
  );
}
