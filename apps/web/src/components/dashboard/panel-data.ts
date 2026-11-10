import i18n from "i18next";
import type {
  DashboardFieldChoice,
  DashboardFieldView,
  DashboardPanelSpec,
} from "@/types/dashboards";

// Fallback series colors (matches the approved mock's palette order).
export const PANEL_PALETTE = [
  "#8b5cf6",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#eab308",
  "#06b6d4",
  "#ef4444",
  "#ec4899",
];

export const NUMERIC_FIELD_TYPES = ["number", "percent", "currency"];
export const CHOICE_FIELD_TYPES = ["select", "multiselect"];
// Field types the group-by picker offers (mirrors the query engine's
// indexable/groupable columns).
export const GROUPABLE_FIELD_TYPES = [
  "select",
  "multiselect",
  "user",
  "checkbox",
  "date",
  "datetime",
];

export function fieldChoices(
  field?: DashboardFieldView,
): DashboardFieldChoice[] {
  const options = field?.options as
    | {
        choices?: Array<Record<string, unknown>>;
        options?: Array<Record<string, unknown>>;
      }
    | Array<Record<string, unknown>>
    | null
    | undefined;
  const raw = Array.isArray(options)
    ? options
    : (options?.choices ?? options?.options ?? []);
  return raw.flatMap((choice) => {
    const id = choice.id ?? choice.value;
    const label = choice.label ?? choice.title ?? choice.name;
    return typeof id === "string" && typeof label === "string"
      ? [
          {
            id,
            label,
            color: typeof choice.color === "string" ? choice.color : undefined,
          },
        ]
      : [];
  });
}

export function findField(
  fields: DashboardFieldView[],
  fieldId: string | undefined,
) {
  return fieldId ? fields.find((field) => field.id === fieldId) : undefined;
}

export type FieldFormat = {
  kind: "plain" | "percent" | "currency";
  precision?: number;
  currencyCode?: string;
};

export function fieldFormat(
  field: DashboardFieldView | undefined,
): FieldFormat {
  const options = (field?.options ?? {}) as {
    precision?: number;
    currencyCode?: string;
    currency?: string;
    code?: string;
  };
  return {
    kind:
      field?.type === "percent"
        ? "percent"
        : field?.type === "currency"
          ? "currency"
          : "plain",
    precision:
      typeof options.precision === "number" ? options.precision : undefined,
    currencyCode: options.code ?? options.currencyCode ?? options.currency,
  };
}

export function formatNumber(value: number, precision?: number) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: precision ?? 2,
  }).format(value);
}

export function formatMetricValue(
  agg: string,
  field: DashboardFieldView | undefined,
  value: number,
) {
  if (agg === "count") return formatNumber(value, 0);
  const format = fieldFormat(field);
  // ponytail: percent stored value rendered as-is + "%"; if the API stores
  // 0–1 fractions instead of 0–100, scale here.
  if (format.kind === "percent")
    return `${formatNumber(value, format.precision ?? 1)}%`;
  if (format.kind === "currency") {
    return format.currencyCode
      ? `${format.currencyCode} ${formatNumber(value, format.precision ?? 0)}`
      : formatNumber(value, format.precision ?? 0);
  }
  return formatNumber(value, format.precision);
}

function isoWeek(date: Date) {
  const target = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(
    ((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
}

export function formatBucketLabel(
  isoDate: string,
  bucket: "day" | "week" | "month" | undefined,
) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  if (bucket === "week") return `W${isoWeek(date)}`;
  if (bucket === "month")
    return date.toLocaleDateString(undefined, {
      month: "short",
      year: "2-digit",
    });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Stored label value → display text. `memberNames` maps userId → name,
// `fields` provides choice labels and date buckets.
export function labelToText(
  label: unknown,
  fields: DashboardFieldView[],
  groupByFieldId: string | undefined,
  bucket: "day" | "week" | "month" | undefined,
  memberNames: Map<string, string>,
): string {
  if (label === null || label === undefined) return "—";
  const field = findField(fields, groupByFieldId);
  if (Array.isArray(label)) {
    return label
      .map((item) =>
        labelToText(item, fields, groupByFieldId, bucket, memberNames),
      )
      .join(", ");
  }
  if (typeof label === "boolean") {
    return i18n.t(`navigation:dashboards.${label ? "yes" : "no"}`);
  }
  if (field?.type === "user" && typeof label === "string") {
    return memberNames.get(label) ?? label;
  }
  if (
    (field?.type === "date" || field?.type === "datetime") &&
    typeof label === "string"
  ) {
    return formatBucketLabel(label, bucket);
  }
  if (typeof label === "string") {
    const choice = fieldChoices(field).find(
      (candidate) => candidate.id === label,
    );
    if (choice) return choice.label;
  }
  return String(label);
}

// Color for a series row: the matching choice's color, else palette by index.
export function labelColor(
  label: unknown,
  field: DashboardFieldView | undefined,
  index: number,
) {
  const first = Array.isArray(label) ? label[0] : label;
  if (typeof first === "string") {
    const choice = fieldChoices(field).find(
      (candidate) => candidate.id === first,
    );
    if (choice?.color) return choice.color;
  }
  return PANEL_PALETTE[index % PANEL_PALETTE.length];
}

// Query chip text, e.g. "count() · group by Stage · week · Stage = Received".
// groupByPrefix is the localized "group by" label; callers pass t(...).
export function queryChipText(
  spec: DashboardPanelSpec,
  fields: DashboardFieldView[],
  groupByPrefix = "group by",
): string {
  const { query } = spec;
  const metricField = findField(fields, query.metric.fieldId);
  const agg =
    query.metric.agg === "count"
      ? "count()"
      : `${query.metric.agg}(${metricField?.name ?? "?"})`;
  const parts = [agg];
  if (query.groupBy) {
    const field = findField(fields, query.groupBy.fieldId);
    parts.push(
      `${groupByPrefix} ${field?.name ?? "?"}${
        query.groupBy.bucket ? ` · ${query.groupBy.bucket}` : ""
      }`,
    );
  }
  for (const filter of query.filters ?? []) {
    const field = findField(fields, filter.fieldId);
    const symbol = {
      eq: "=",
      neq: "≠",
      in: "∈",
      lt: "<",
      lte: "≤",
      gt: ">",
      gte: "≥",
      isEmpty: "∅",
    }[filter.op];
    parts.push(`${field?.name ?? "?"} ${symbol} ${String(filter.value ?? "")}`);
  }
  return parts.join(" · ");
}
