import { type SQL, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import * as v from "valibot";
import type db from "../database";
import {
  type FilterCondition,
  type FilterGroup,
  filterOperators,
  isFilterGroup,
  listOperator,
  valuelessOperator,
} from "./filter-expression";
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
    v.union([
      v.custom<FilterGroup>(
        isFilterGroup,
        "Invalid filter expression (maximum depth 3, 50 conditions)",
      ),
      v.pipe(
        v.array(
          v.union([
            v.strictObject({
              id: v.optional(fieldId),
              fieldId,
              contains: boundedText,
            }),
            v.strictObject({
              id: v.optional(fieldId),
              fieldId,
              min: boundedText,
              max: boundedText,
            }),
            v.strictObject({
              id: v.optional(fieldId),
              fieldId,
              from: boundedText,
              to: boundedText,
            }),
            v.strictObject({
              id: v.optional(fieldId),
              fieldId,
              choiceId: boundedText,
            }),
            v.strictObject({
              id: v.optional(fieldId),
              fieldId,
              checked: v.picklist(["any", "true", "false"]),
            }),
          ]),
        ),
        v.maxLength(50),
      ),
    ]),
    [],
  ),
  sort: v.optional(
    v.nullable(
      v.union([
        v.object({ fieldId, dir: v.picklist(["asc", "desc"]) }),
        v.pipe(
          v.array(v.object({ fieldId, dir: v.picklist(["asc", "desc"]) })),
          v.maxLength(5),
        ),
      ]),
    ),
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
        "earliest",
        "latest",
        "unique",
        "filledPct",
        "emptyPct",
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
  userId?: string;
  links?: Record<string, SQL>;
  /** jsonb array of linked row ids per link field, used by filters. */
  linkFilters?: Record<string, SQL>;
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
export function cellText(f: QueryField, lookups: QueryLookups): SQL {
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
      return lookups.links?.[f.id] ?? sql`''`;
    default:
      return sql`COALESCE(${col}::text, '')`;
  }
}
type LegacyFilter = Extract<RowQuery["filters"], unknown[]>[number];
function legacyGroup(
  filters: LegacyFilter[],
  find: (id: string) => QueryField,
): FilterGroup {
  const children: FilterCondition[] = [];
  for (const filter of filters) {
    const field = find(filter.fieldId);
    const add = (op: FilterCondition["op"], value?: FilterCondition["value"]) =>
      children.push({ fieldId: field.id, op, value });
    if (numeric(field) && "min" in filter) {
      for (const [raw, op] of [
        [filter.min, "gte"],
        [filter.max, "lte"],
      ] as const) {
        if (!raw.trim()) continue;
        if (!Number.isFinite(Number(raw))) bad("Invalid numeric filter");
        add(op, Number(raw));
      }
    } else if (["date", "datetime"].includes(field.type) && "from" in filter) {
      if (filter.from) add("gte", filter.from);
      if (filter.to) add("lte", filter.to);
    } else if (field.type === "checkbox" && "checked" in filter) {
      if (filter.checked !== "any")
        add(filter.checked === "true" ? "isChecked" : "isNotChecked");
    } else if (
      ["select", "user", "multiselect", "ticket"].includes(field.type) &&
      "choiceId" in filter
    ) {
      if (filter.choiceId === "__empty__") add("isEmpty");
      else if (filter.choiceId)
        add(
          ["multiselect", "ticket"].includes(field.type) ? "hasAny" : "eq",
          ["multiselect", "ticket"].includes(field.type)
            ? [filter.choiceId]
            : filter.choiceId,
        );
    } else if (
      ["text", "longtext", "url", "email", "json"].includes(field.type) &&
      "contains" in filter
    ) {
      if (filter.contains.trim()) add("contains", filter.contains.trim());
    } else bad("Filter does not match field type");
  }
  return { conjunction: "and", children };
}
/** Empty means NULL, or an empty collection; never '', 0 or false. */
function emptySql(f: QueryField, lookups: QueryLookups): SQL {
  const col =
    f.type === "link"
      ? (lookups.linkFilters?.[f.id] ?? bad("Inaccessible link field"))
      : value(f);
  return ["multiselect", "ticket", "link"].includes(f.type)
    ? sql`(${col} IS NULL OR ${col} = '[]'::jsonb)`
    : sql`${col} IS NULL`;
}
function filterSql(
  filter: FilterCondition,
  f: QueryField,
  lookups: QueryLookups,
): SQL {
  const { op } = filter;
  if (!filterOperators(f.type).includes(op))
    bad("Invalid operator for field type");
  const col =
    f.type === "link"
      ? (lookups.linkFilters?.[f.id] ?? bad("Inaccessible link field"))
      : value(f);
  if (op === "isEmpty") return emptySql(f, lookups);
  if (op === "isNotEmpty") return sql`NOT (${emptySql(f, lookups)})`;
  if (op === "isChecked") return sql`${col} IS TRUE`;
  // Negative operators include empty cells (NocoDB): unset is "not checked".
  if (op === "isNotChecked") return sql`${col} IS NOT TRUE`;
  if (op === "isMe") {
    if (!lookups.userId) bad("Current user required");
    return sql`${col} = ${lookups.userId}`;
  }
  const raw = filter.value;
  if (!valuelessOperator(op) && raw === undefined) bad("Filter value required");
  const array = ["multiselect", "ticket", "link"].includes(f.type);
  if (["select", "multiselect", "user", "ticket"].includes(f.type)) {
    const ids = Array.isArray(raw) ? raw : [raw];
    const allowed =
      f.type === "user"
        ? Object.keys(lookups.members)
        : f.type === "ticket"
          ? Object.keys(lookups.tickets)
          : (Array.isArray(f.options?.choices) ? f.options.choices : []).map(
              (c: { id: string }) => c.id,
            );
    if (ids.some((id) => typeof id !== "string" || !allowed.includes(id)))
      bad("Invalid or inaccessible filter value");
  }
  if (listOperator(op)) {
    if (!Array.isArray(raw) || raw.length === 0)
      bad("Nonempty filter list required");
    if (array) {
      if (op === "hasAll")
        return sql`COALESCE(${col}, '[]'::jsonb) @> ${JSON.stringify(raw)}::jsonb`;
      const any = sql`COALESCE(${col}, '[]'::jsonb) ?| ARRAY[${sql.join(
        raw.map((v) => sql`${v}`),
        sql`, `,
      )}]::text[]`;
      return op === "hasNone" ? sql`NOT (${any})` : any;
    }
    const inside = sql`${col} IN (${sql.join(
      raw.map((v) => sql`${v}`),
      sql`, `,
    )})`;
    return op === "notIn" ? sql`(NOT (${inside}) OR ${col} IS NULL)` : inside;
  }
  if (op === "pastDays" || op === "nextDays") {
    if (
      typeof raw !== "number" ||
      !Number.isInteger(raw) ||
      raw < 0 ||
      raw > 36500
    )
      bad("Invalid day count");
    // UTC calendar-day windows, including today, inclusive at start/exclusive at end.
    return op === "pastDays"
      ? sql`${col} >= CURRENT_DATE - ${raw}::integer AND ${col} < CURRENT_DATE + 1`
      : sql`${col} >= CURRENT_DATE AND ${col} < CURRENT_DATE + ${raw}::integer + 1`;
  }
  const compare = (left: SQL, right: SQL): SQL => {
    switch (op) {
      case "eq":
        return sql`${left} = ${right}`;
      case "neq":
        return sql`(${left} <> ${right} OR ${left} IS NULL)`;
      case "lt":
        return sql`${left} < ${right}`;
      case "lte":
        return sql`${left} <= ${right}`;
      case "gt":
        return sql`${left} > ${right}`;
      case "gte":
        return sql`${left} >= ${right}`;
      default:
        return bad("Invalid comparison");
    }
  };
  if (numeric(f)) {
    if (typeof raw !== "number" || !Number.isFinite(raw))
      bad("Finite number required");
    return compare(col, sql`${raw}::numeric`);
  }
  if (["date", "datetime"].includes(f.type)) {
    if (
      typeof raw !== "string" ||
      !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/.test(
        raw,
      ) ||
      !Number.isFinite(Date.parse(raw)) ||
      new Date(`${raw.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !==
        raw.slice(0, 10)
    )
      bad("Invalid date filter");
    if (f.type === "date" && raw.length !== 10) bad("Calendar date required");
    if (raw.length === 10) {
      const start = sql`${raw}::date`;
      const end = sql`(${start} + 1)`;
      if (op === "eq") return sql`${col} >= ${start} AND ${col} < ${end}`;
      if (op === "gt") return sql`${col} >= ${end}`;
      if (op === "lte") return sql`${col} < ${end}`;
      return compare(col, start);
    }
    return compare(col, sql`${raw}::timestamptz`);
  }
  if (typeof raw !== "string") bad("Text filter required");
  if (op === "contains" || op === "notContains") {
    const match = sql`strpos(lower(COALESCE(${col}::text, '')), ${raw.toLowerCase()}) > 0`;
    return op === "notContains" ? sql`NOT (${match})` : match;
  }
  return compare(f.type === "json" ? sql`${col}::text` : col, sql`${raw}`);
}
function groupSql(
  group: FilterGroup,
  find: (id: string) => QueryField,
  lookups: QueryLookups,
): SQL {
  const children = group.children.map(
    (child) =>
      sql`(${"conjunction" in child ? groupSql(child, find, lookups) : filterSql(child, find(child.fieldId), lookups)})`,
  );
  return children.length
    ? sql`(${sql.join(children, group.conjunction === "or" ? sql` OR ` : sql` AND `)})`
    : sql`TRUE`;
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
  const queryFields = [...fields, ...system];
  const find = (id: string) =>
    queryFields.find((f) => f.id === id) ??
    bad("Unknown or non-queryable field");
  const searchFields = [
    ...fields.filter(supported),
    ...(spec.includeSystem ? system : []),
  ];
  // Legacy layouts are one AND group; typed expressions retain their nested logic.
  const expression = Array.isArray(spec.filters)
    ? legacyGroup(spec.filters, find)
    : spec.filters;
  const clauses: SQL[] = [groupSql(expression, find, lookups)];
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
  // First rule per field wins; duplicate keys would order unpredictably.
  const sortRules = (
    Array.isArray(spec.sort) ? spec.sort : spec.sort ? [spec.sort] : []
  ).filter(
    (rule, index, all) =>
      all.findIndex((other) => other.fieldId === rule.fieldId) === index,
  );
  const sortValue = (rule: (typeof sortRules)[number]): SQL => {
    const f = find(rule.fieldId);
    return numeric(f) || ["date", "datetime", "checkbox"].includes(f.type)
      ? value(f)
      : sql`NULLIF(${cellText(f, lookups)}, '')`;
  };
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
    ...(sortRules.length > 0
      ? sortRules.map(
          (rule) =>
            sql`${sortValue(rule)} ${sql.raw(rule.dir === "desc" ? "DESC" : "ASC")} NULLS LAST`,
        )
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
    } else if (fn === "earliest" || fn === "latest") {
      if (f.type !== "date" && f.type !== "datetime")
        bad("Earliest/latest summary requires a date field");
      expression = sql`(${fn === "earliest" ? sql`min` : sql`max`}(${col}))::text`;
    } else if (fn === "unique") {
      if (f.type === "checkbox" || f.type === "longtext")
        bad("Unique summary requires a value field");
      expression = sql`count(DISTINCT ${col}) FILTER (WHERE NOT (${emptySql(f, lookups)}))::double precision`;
    } else if (fn === "filledPct" || fn === "emptyPct") {
      const filled = sql`NOT (${emptySql(f, lookups)})`;
      expression = sql`count(*) FILTER (WHERE ${fn === "emptyPct" ? sql`NOT (${filled})` : filled})::double precision`;
    } else {
      const filled = sql`NOT (${emptySql(f, lookups)})`;
      expression = sql`count(*) FILTER (WHERE ${fn === "empty" ? sql`NOT (${filled})` : filled})::double precision`;
    }
    return sql`${expression} AS ${sql.identifier(id)}`;
  });
  const aggregate = [sql`count(*)::integer AS total`, ...summarySql];
  const exportFields = fields.filter((f) => supported(f) || f.type === "link");
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
    summary: Record<string, string | number | null> & { total: number };
    table_total: number;
    groups: (Record<string, number | string | null> & {
      key: string;
      label: string;
      total: number;
    })[];
  };
  if (csv) {
    // ponytail: materialized export in memory, stream the same query when exports outgrow API memory.
    const quote = (text: string) => {
      // A plain number (e.g. -5) is never a formula; keep it machine-readable.
      const formula =
        /^[=+\-@\t\r']/.test(text) &&
        !(text.trim() !== "" && Number.isFinite(Number(text)));
      const s = formula ? `'${text}` : text;
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
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
