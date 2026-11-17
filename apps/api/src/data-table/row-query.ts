import { type SQL, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import * as v from "valibot";
import type db from "../database";
import {
  colRef,
  type DataTableTx,
  physical,
  rowSelection,
  type StoreField,
  tableRef,
  toRow,
} from "./store";

const boundedText = v.pipe(v.string(), v.maxLength(1000));
const fieldId = v.pipe(v.string(), v.minLength(1), v.maxLength(100));
export const rowQuerySchema = v.object({
  search: v.optional(boundedText, ""),
  includeSystem: v.optional(v.boolean(), false),
  filters: v.optional(
    v.pipe(
      v.array(
        v.union([
          v.object({ fieldId, contains: boundedText }),
          v.object({ fieldId, min: boundedText, max: boundedText }),
          v.object({ fieldId, from: boundedText, to: boundedText }),
          v.object({ fieldId, choiceId: boundedText }),
          v.object({ fieldId, checked: v.picklist(["any", "true", "false"]) }),
        ]),
      ),
      v.maxLength(50),
    ),
    [],
  ),
  sort: v.optional(
    v.nullable(v.object({ fieldId, dir: v.picklist(["asc", "desc"]) })),
    null,
  ),
  groupFieldId: v.optional(v.nullable(fieldId), null),
  summaries: v.optional(
    v.record(
      fieldId,
      v.picklist([
        "none",
        "sum",
        "avg",
        "min",
        "max",
        "filled",
        "empty",
        "checked",
      ]),
    ),
    {},
  ),
  limit: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(1000)),
    1000,
  ),
  offset: v.optional(
    v.pipe(
      v.number(),
      v.integer(),
      v.minValue(0),
      v.maxValue(Number.MAX_SAFE_INTEGER),
    ),
    0,
  ),
});
export type RowQuery = v.InferOutput<typeof rowQuerySchema>;
export type RowQueryInput = v.InferInput<typeof rowQuerySchema>;
type QueryField = StoreField & { name?: string; system?: boolean };
export type QueryLookups = {
  members: Record<string, string>;
  tickets: Record<string, { key: string }>;
};
const system: QueryField[] = [
  { id: "__row_id", type: "number", system: true },
  { id: "__created_at", type: "datetime", system: true },
  { id: "__updated_at", type: "datetime", system: true },
  { id: "__created_by", type: "user", system: true },
  { id: "__updated_by", type: "user", system: true },
];
const systemColumns: Record<string, string> = {
  __row_id: "position",
  __created_at: "created_at",
  __updated_at: "updated_at",
  __created_by: "created_by",
  __updated_by: "updated_by",
};
const numeric = (f: QueryField) =>
  ["number", "percent", "currency"].includes(f.type);
const supported = (f: QueryField) =>
  [
    "text",
    "longtext",
    "number",
    "percent",
    "currency",
    "date",
    "datetime",
    "select",
    "multiselect",
    "checkbox",
    "user",
    "url",
    "email",
    "json",
    "ticket",
  ].includes(f.type);
function bad(message: string): never {
  throw new HTTPException(400, { message });
}
const ref = (f: QueryField) =>
  f.system
    ? sql`${sql.identifier(systemColumns[f.id] ?? bad("Unknown system field"))}`
    : colRef(f.id);
function value(f: QueryField): SQL {
  return f.id === "__row_id" ? sql`(${ref(f)} + 1)` : ref(f);
}
const textMap = (map: Record<string, string>, key: SQL) =>
  sql`COALESCE(${JSON.stringify(map)}::jsonb ->> (${key})::text, '')`;
/** Same data text as CSV/search: labels, member names and live org-scoped ticket keys, never entity ids. */
function cellText(f: QueryField, lookups: QueryLookups): SQL {
  const col = value(f);
  const choices = Object.fromEntries(
    (Array.isArray(f.options?.choices) ? f.options.choices : []).map(
      (c: { id: string; label: string }) => [c.id, c.label],
    ),
  );
  switch (f.type) {
    case "select":
      return textMap(choices, col);
    case "user":
      return textMap(lookups.members, col);
    case "multiselect":
    case "ticket": {
      const map =
        f.type === "ticket"
          ? Object.fromEntries(
              Object.entries(lookups.tickets).map(([id, t]) => [id, t.key]),
            )
          : choices;
      return sql`COALESCE((SELECT string_agg(label, ', ' ORDER BY ord) FROM (SELECT ${textMap(map, sql`item`)} AS label, ord FROM jsonb_array_elements_text(COALESCE(${col}, '[]'::jsonb)) WITH ORDINALITY AS items(item, ord)) labels WHERE label <> ''), '')`;
    }
    case "json":
      return sql`COALESCE(CASE WHEN jsonb_typeof(${col}) = 'string' THEN ${col} #>> '{}' ELSE ${col}::text END, '')`;
    case "link":
      return sql`''`;
    default:
      return sql`COALESCE(${col}::text, '')`;
  }
}
function filterSql(filter: RowQuery["filters"][number], f: QueryField): SQL {
  const col = value(f);
  if (!supported(f)) bad("This field type cannot be filtered");
  if (numeric(f) && "min" in filter) {
    const bounds: SQL[] = [];
    for (const [raw, op] of [
      [filter.min, ">="],
      [filter.max, "<="],
    ]) {
      if (!raw?.trim()) continue;
      if (!Number.isFinite(Number(raw))) bad("Invalid numeric filter");
      bounds.push(sql`${col} ${sql.raw(op ?? "")} ${raw}::numeric`);
    }
    return bounds.length ? sql.join(bounds, sql` AND `) : sql`TRUE`;
  }
  if (["date", "datetime"].includes(f.type) && "from" in filter) {
    const bounds: SQL[] = [];
    for (const [raw, op] of [
      [filter.from, ">="],
      [filter.to, "<="],
    ]) {
      if (!raw) continue;
      if (
        !/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(raw) ||
        !Number.isFinite(Date.parse(raw)) ||
        new Date(`${raw.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !==
          raw.slice(0, 10)
      )
        bad("Invalid date filter");
      if (op === "<=" && raw.length === 10)
        bounds.push(sql`${col} < ${raw}::date + interval '1 day'`);
      else bounds.push(sql`${col} ${sql.raw(op ?? "")} ${raw}::timestamptz`);
    }
    return bounds.length ? sql.join(bounds, sql` AND `) : sql`TRUE`;
  }
  if (f.type === "checkbox" && "checked" in filter)
    return filter.checked === "any"
      ? sql`TRUE`
      : sql`COALESCE(${col}, false) = ${filter.checked === "true"}`;
  if (
    ["select", "user", "multiselect", "ticket"].includes(f.type) &&
    "choiceId" in filter
  ) {
    if (!filter.choiceId) return sql`TRUE`;
    const array = ["multiselect", "ticket"].includes(f.type);
    if (filter.choiceId === "__empty__")
      return array
        ? sql`(${col} IS NULL OR ${col} = '[]'::jsonb)`
        : sql`COALESCE(${col}, '') = ''`;
    return array
      ? sql`${col} @> ${JSON.stringify([filter.choiceId])}::jsonb`
      : sql`${col} = ${filter.choiceId}`;
  }
  if (
    ["text", "longtext", "url", "email", "json"].includes(f.type) &&
    "contains" in filter
  )
    return sql`strpos(lower(COALESCE(${col}::text, '')), ${filter.contains.trim().toLowerCase()}) > 0`;
  return bad("Filter does not match field type");
}
export async function queryRows(
  executor: typeof db | DataTableTx,
  tableId: string,
  fields: QueryField[],
  input: RowQueryInput,
  lookups: QueryLookups,
  csv = false,
) {
  const spec = v.parse(rowQuerySchema, input);
  if (Object.keys(spec.summaries).length > fields.length + system.length)
    bad("Too many summaries");
  const queryFields = [...fields.filter(supported), ...system];
  const find = (id: string) =>
    queryFields.find((f) => f.id === id) ??
    bad("Unknown or non-queryable field");
  const searchFields = [
    ...fields.filter(supported),
    ...(spec.includeSystem ? system : []),
  ];
  const clauses = spec.filters.map(
    (f) => sql`(${filterSql(f, find(f.fieldId))})`,
  );
  if (spec.search.trim())
    clauses.push(
      searchFields.length
        ? sql`(${sql.join(
            searchFields.map(
              (f) =>
                sql`strpos(lower(${cellText(f, lookups)}), ${spec.search.trim().toLowerCase()}) > 0`,
            ),
            sql` OR `,
          )})`
        : sql`FALSE`,
    );
  const where = clauses.length ? sql.join(clauses, sql` AND `) : sql`TRUE`;
  const sortField = spec.sort ? find(spec.sort.fieldId) : null;
  const sortValue = sortField
    ? numeric(sortField) ||
      ["date", "datetime", "checkbox"].includes(sortField.type)
      ? value(sortField)
      : sql`NULLIF(${cellText(sortField, lookups)}, '')`
    : null;
  const group = spec.groupFieldId ? find(spec.groupFieldId) : null;
  if (
    group &&
    !["select", "user", "checkbox", "text", "number"].includes(group.type)
  )
    bad("This field cannot be grouped");
  const groupKey = group
    ? sql`COALESCE(${numeric(group) ? sql`${value(group)}::double precision` : value(group)}::text, '')`
    : sql`''`;
  const groupLabel = group ? cellText(group, lookups) : sql`''`;
  const order = [
    ...(group
      ? [sql`NULLIF(${groupLabel}, '') ASC NULLS LAST`, sql`${groupKey} ASC`]
      : []),
    ...(sortValue
      ? [
          sql`${sortValue} ${sql.raw(spec.sort?.dir === "desc" ? "DESC" : "ASC")} NULLS LAST`,
        ]
      : [sql`position ASC`, sql`created_at ASC`]),
    sql`id ASC`,
  ];
  const summaries = Object.entries(spec.summaries).filter(
    ([, fn]) => fn !== "none",
  );
  if (summaries.length > queryFields.length) bad("Too many summaries");
  const summarySql = summaries.map(([id, fn]) => {
    const f = find(id);
    const col = value(f);
    let expression: SQL;
    if (["sum", "avg", "min", "max"].includes(fn)) {
      if (!numeric(f)) bad("Numeric summary requires a numeric field");
      expression = sql`${sql.raw(fn)}(${col})::double precision`;
    } else if (fn === "checked") {
      if (f.type !== "checkbox") bad("Checked summary requires a checkbox");
      expression = sql`count(*) FILTER (WHERE ${col} IS TRUE)::double precision`;
    } else {
      const filled =
        f.type === "checkbox"
          ? sql`${col} IS TRUE`
          : sql`${col} IS NOT NULL AND ${col}::text <> ''`;
      expression = sql`count(*) FILTER (WHERE ${fn === "empty" ? sql`NOT (${filled})` : filled})::double precision`;
    }
    return sql`${expression} AS ${sql.identifier(id)}`;
  });
  const aggregate = [sql`count(*)::integer AS total`, ...summarySql];
  const exportFields = fields.filter(supported);
  if (csv && exportFields.length === 0) return { csv: "" };
  const selection = csv
    ? exportFields.map(
        (f) => sql`${cellText(f, lookups)} AS ${sql.identifier(f.id)}`,
      )
    : rowSelection(fields, tableId);
  // One statement/snapshot: page, totals, groups and summaries share exactly the same predicate.
  const result =
    await executor.execute(sql`WITH filtered AS MATERIALIZED (SELECT *${group ? sql`, ${groupKey} AS __group_key, ${groupLabel} AS __group_label` : sql``} FROM ${tableRef(tableId)} WHERE deleted_at IS NULL AND ${where}),
    page AS (SELECT ${sql.join(selection, sql`, `)} FROM filtered AS ${sql.identifier(physical(tableId))} ORDER BY ${sql.join(order, sql`, `)} ${csv ? sql`` : sql`LIMIT ${spec.limit} OFFSET ${spec.offset}`})
    SELECT (SELECT COALESCE(jsonb_agg(page), '[]'::jsonb) FROM page) AS rows,
    (SELECT row_to_json(t) FROM (SELECT ${sql.join(aggregate, sql`, `)} FROM filtered) t) AS summary,
    (SELECT count(*)::integer FROM ${tableRef(tableId)} WHERE deleted_at IS NULL) AS table_total,
    ${group ? sql`(SELECT COALESCE(jsonb_agg(g ORDER BY NULLIF(g.label, '') ASC NULLS LAST, g.key), '[]'::jsonb) FROM (SELECT __group_key AS key, __group_label AS label, ${sql.join(aggregate, sql`, `)} FROM filtered GROUP BY __group_key, __group_label) g)` : sql`'[]'::jsonb`} AS groups`);
  const record = result.rows[0] as {
    rows: Record<string, unknown>[];
    summary: Record<string, number | null> & { total: number };
    table_total: number;
    groups: (Record<string, number | string | null> & {
      key: string;
      label: string;
      total: number;
    })[];
  };
  if (csv) {
    // ponytail: materialized export in memory, stream the same query when exports outgrow API memory.
    const quote = (s: string) =>
      /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    return {
      csv: [
        exportFields.map((f) => quote(f.name ?? "")).join(","),
        ...record.rows.map((row) =>
          exportFields.map((f) => quote(String(row[f.id] ?? ""))).join(","),
        ),
      ].join("\r\n"),
    };
  }
  return {
    rows: record.rows.map((row) => toRow(row, fields)),
    total: record.summary.total,
    tableTotal: record.table_total,
    summaries: record.summary,
    groups: record.groups,
  };
}
