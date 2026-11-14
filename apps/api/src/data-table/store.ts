import { createId } from "@paralleldrive/cuid2";
import {
  type ExtractTablesWithRelations,
  eq,
  isNull,
  type SQL,
  sql,
} from "drizzle-orm";
import type { NodePgTransaction } from "drizzle-orm/node-postgres";
import { HTTPException } from "hono/http-exception";
import type { schema } from "../database";
import db from "../database";
import {
  dataTableDdlLogTable,
  dataTableFieldTable,
  dataTableTable,
} from "../database/schema";
import {
  type CoercibleField,
  coerceValue,
  type FieldType,
  isFieldType,
  isIndexedField,
  isNumericField,
  pgTypeFor,
} from "./fields";

/** The dedicated schema holding the physical row tables (owner decision, §9.2). */
export const TABLES_SCHEMA = "kaneo_tables";

type Schema = typeof schema;
export type DataTableTx = NodePgTransaction<
  Schema,
  ExtractTablesWithRelations<Schema>
>;
/** Either the root database or a transaction — both drive raw SQL via execute. */
type Executor = typeof db | DataTableTx;

export type StoreField = CoercibleField & { id: string };

export type TableRow = {
  id: string;
  position: number;
  createdAt: Date | string;
  updatedAt: Date | string;
  values: Record<string, unknown>;
};

export type QuerySpec = {
  metric: { agg: "count" | "sum" | "avg" | "min" | "max"; fieldId?: string };
  groupBy?: { fieldId: string; bucket?: "day" | "week" | "month" };
  filters?: {
    fieldId: string;
    op: "eq" | "neq" | "in" | "lt" | "lte" | "gt" | "gte" | "isEmpty";
    value?: unknown;
  }[];
  limit?: number;
};

export type ReconcileReport = {
  tableId: string;
  addedColumns: string[];
  droppedColumns: string[];
};

// Function declarations, not const arrows: TS only narrows flow after
// never-returning calls to declared functions (the guards below rely on it).
function badRequest(message: string): never {
  throw new HTTPException(400, { message });
}

function notFound(resource: string): never {
  throw new HTTPException(404, { message: `${resource} not found` });
}

// Trust boundary: cuid-derived ids only, never user input. Every physical
// identifier is validated against this before it is interpolated into DDL.
const IDENT_RE = /^[a-zA-Z0-9]+$/;
const AGGREGATIONS = new Set(["count", "sum", "avg", "min", "max"]);
// Whitelisted filter ops per column family; jsonb columns only support emptiness.
const OP_MATRIX = {
  numeric: ["eq", "neq", "in", "lt", "lte", "gt", "gte", "isEmpty"],
  temporal: ["eq", "neq", "in", "lt", "lte", "gt", "gte", "isEmpty"],
  text: ["eq", "neq", "in", "isEmpty"],
  boolean: ["eq", "isEmpty"],
  jsonb: ["isEmpty"],
} as const;
const COMPARISON_SQL = {
  eq: "=",
  neq: "<>",
  lt: "<",
  lte: "<=",
  gt: ">",
  gte: ">=",
} as const;

function assertSafeId(id: string, label: string): string {
  if (!IDENT_RE.test(id)) badRequest(`Invalid ${label} identifier`);
  return id;
}

/** Physical table name for a metadata table id. */
export function physical(tableId: string): string {
  return `t_${assertSafeId(tableId, "table")}`;
}

/** Physical column name for a metadata field id. */
export function column(fieldId: string): string {
  return `c_${assertSafeId(fieldId, "field")}`;
}

const q = (identifier: string) => `"${identifier}"`;
const tableRef = (tableId: string) =>
  sql.raw(`${TABLES_SCHEMA}.${q(physical(tableId))}`);
const colRef = (fieldId: string) => sql.raw(q(column(fieldId)));
const indexName = (tableId: string, fieldId: string) =>
  `${physical(tableId)}_${column(fieldId)}_idx`;

function opFamily(type: FieldType): keyof typeof OP_MATRIX {
  const pg = pgTypeFor(type);
  if (pg === "jsonb") return "jsonb";
  if (pg === "boolean") return "boolean";
  if (pg === "numeric") return "numeric";
  if (pg === "date" || pg === "timestamptz") return "temporal";
  return "text";
}

let schemaReady: Promise<void> | null = null;

/** Memoized once-per-process schema bootstrap (API boot + test envs). */
export function ensureSchema(): Promise<void> {
  schemaReady ??= db
    .execute(sql.raw(`CREATE SCHEMA IF NOT EXISTS ${TABLES_SCHEMA}`))
    .then(
      () => undefined,
      // A transient boot failure must not poison the memo forever.
      (error: unknown) => {
        schemaReady = null;
        throw error;
      },
    );
  return schemaReady;
}

async function logDdl(
  tx: DataTableTx,
  dataTableId: string,
  statement: string,
): Promise<void> {
  await tx.insert(dataTableDdlLogTable).values({ dataTableId, statement });
}

export async function createTable(
  tx: DataTableTx,
  tableId: string,
): Promise<void> {
  await tx.execute(sql.raw(`CREATE SCHEMA IF NOT EXISTS ${TABLES_SCHEMA}`));
  const statement = `CREATE TABLE IF NOT EXISTS ${TABLES_SCHEMA}.${q(physical(tableId))} (
  id text PRIMARY KEY,
  position double precision NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)`;
  await tx.execute(sql.raw(statement));
  await logDdl(tx, tableId, statement);
}

export async function addField(
  tx: DataTableTx,
  field: { tableId: string; fieldId: string; type: FieldType },
): Promise<void> {
  const statements = [
    `ALTER TABLE ${TABLES_SCHEMA}.${q(physical(field.tableId))} ADD COLUMN IF NOT EXISTS ${q(column(field.fieldId))} ${pgTypeFor(field.type)}`,
  ];
  if (isIndexedField(field.type)) {
    statements.push(
      `CREATE INDEX IF NOT EXISTS ${q(indexName(field.tableId, field.fieldId))} ON ${TABLES_SCHEMA}.${q(physical(field.tableId))} (${q(column(field.fieldId))})`,
    );
  }
  for (const statement of statements) {
    await tx.execute(sql.raw(statement));
    await logDdl(tx, field.tableId, statement);
  }
}

/**
 * Full-table rewrite under ACCESS EXCLUSIVE.
 * ponytail: shadow-copy-and-swap when any user table grows past the point
 * where a type change locking writes for seconds matters.
 */
function castExpression(from: FieldType, to: FieldType, col: string): string {
  const fromPg = pgTypeFor(from);
  const toPg = pgTypeFor(to);
  if (fromPg === toPg) return col;
  // date <-> timestamptz cast natively.
  if (
    (fromPg === "date" || fromPg === "timestamptz") &&
    (toPg === "date" || toPg === "timestamptz")
  ) {
    return `${col}::${toPg}`;
  }
  // text -> numeric: only rows whose whole value parses; everything else NULL.
  if (fromPg === "text" && toPg === "numeric") {
    return `CASE WHEN ${col} ~ '^[[:space:]]*-?[0-9]+(\\.[0-9]+)?[[:space:]]*$' THEN ${col}::numeric ELSE NULL END`;
  }
  if (fromPg === "numeric" && toPg === "text") return `${col}::text`;
  // Incompatible families: null out rather than fail the migration.
  return "NULL";
}

export async function changeFieldType(
  tx: DataTableTx,
  change: {
    tableId: string;
    fieldId: string;
    from: FieldType;
    to: FieldType;
  },
): Promise<void> {
  const toPg = pgTypeFor(change.to);
  const col = q(column(change.fieldId));
  const table = `${TABLES_SCHEMA}.${q(physical(change.tableId))}`;
  const wasIndexed = isIndexedField(change.from);
  const nowIndexed = isIndexedField(change.to);

  const statements: string[] = [];
  if (wasIndexed && !nowIndexed) {
    statements.push(
      `DROP INDEX IF EXISTS ${TABLES_SCHEMA}.${q(indexName(change.tableId, change.fieldId))}`,
    );
  }
  statements.push(
    `ALTER TABLE ${table} ALTER COLUMN ${col} TYPE ${toPg} USING ${castExpression(change.from, change.to, col)}`,
  );
  if (!wasIndexed && nowIndexed) {
    statements.push(
      `CREATE INDEX IF NOT EXISTS ${q(indexName(change.tableId, change.fieldId))} ON ${table} (${col})`,
    );
  }
  for (const statement of statements) {
    await tx.execute(sql.raw(statement));
    await logDdl(tx, change.tableId, statement);
  }
}

export async function dropField(
  tx: DataTableTx,
  field: { tableId: string; fieldId: string },
): Promise<void> {
  // Index first: the deterministic name lets us clear it without reading metadata.
  const statements = [
    `DROP INDEX IF EXISTS ${TABLES_SCHEMA}.${q(indexName(field.tableId, field.fieldId))}`,
    `ALTER TABLE ${TABLES_SCHEMA}.${q(physical(field.tableId))} DROP COLUMN IF EXISTS ${q(column(field.fieldId))}`,
  ];
  for (const statement of statements) {
    await tx.execute(sql.raw(statement));
    await logDdl(tx, field.tableId, statement);
  }
}

export async function dropTable(
  tx: DataTableTx,
  tableId: string,
): Promise<void> {
  const statement = `DROP TABLE IF EXISTS ${TABLES_SCHEMA}.${q(physical(tableId))}`;
  await tx.execute(sql.raw(statement));
  await logDdl(tx, tableId, statement);
}

/**
 * Diff physical columns against metadata for every live table and heal the
 * gaps. Idempotent; run at boot and from tests.
 */
export async function reconcile(): Promise<ReconcileReport[]> {
  await ensureSchema();

  const tables = await db
    .select({ id: dataTableTable.id })
    .from(dataTableTable)
    .where(isNull(dataTableTable.deletedAt));
  const fields = await db
    .select({
      id: dataTableFieldTable.id,
      tableId: dataTableFieldTable.tableId,
      type: dataTableFieldTable.type,
    })
    .from(dataTableFieldTable);

  const fieldsByTable = new Map<string, StoreField[]>();
  for (const field of fields) {
    // Unknown stored types would produce a garbage ALTER; leave them alone.
    if (!isFieldType(field.type)) continue;
    const list = fieldsByTable.get(field.tableId) ?? [];
    list.push({ id: field.id, type: field.type, options: null });
    fieldsByTable.set(field.tableId, list);
  }

  const reports: ReconcileReport[] = [];
  for (const table of tables) {
    const result = await db.execute(
      sql`SELECT column_name FROM information_schema.columns
          WHERE table_schema = ${TABLES_SCHEMA} AND table_name = ${physical(table.id)}`,
    );
    const actual = new Set(result.rows.map((row) => row.column_name as string));
    const tableFields = fieldsByTable.get(table.id) ?? [];
    const expected = new Set(tableFields.map((field) => column(field.id)));

    const addedColumns = tableFields
      .map((field) => column(field.id))
      .filter((col) => !actual.has(col));
    const droppedColumns = [...actual].filter(
      (col) => col.startsWith("c_") && !expected.has(col),
    );
    if (addedColumns.length === 0 && droppedColumns.length === 0) continue;

    await db.transaction(async (tx) => {
      for (const field of tableFields) {
        if (addedColumns.includes(column(field.id))) {
          await addField(tx, {
            tableId: table.id,
            fieldId: field.id,
            type: field.type,
          });
        }
      }
      for (const col of droppedColumns) {
        const fieldId = col.slice(2);
        // The snapshot above raced addField: re-check metadata inside the
        // heal transaction so a re-added field keeps its column and data.
        const resurrected = await tx
          .select({ id: dataTableFieldTable.id })
          .from(dataTableFieldTable)
          .where(eq(dataTableFieldTable.id, fieldId))
          .limit(1);
        if (resurrected.length > 0) continue;
        await dropField(tx, { tableId: table.id, fieldId });
      }
    });
    reports.push({ tableId: table.id, addedColumns, droppedColumns });
  }
  return reports;
}

function requireField(fields: StoreField[], fieldId: string): StoreField {
  const field = fields.find((candidate) => candidate.id === fieldId);
  if (!field) notFound("Data table field");
  return field;
}

/** Coerce a values map against metadata; unknown field ids are a 400. */
function coerceRowValues(
  fields: StoreField[],
  values: Record<string, unknown>,
): Map<string, unknown> {
  const byId = new Map(fields.map((field) => [field.id, field]));
  const coerced = new Map<string, unknown>();
  for (const [fieldId, value] of Object.entries(values)) {
    const field = byId.get(fieldId);
    if (!field) badRequest(`Unknown field: ${fieldId}`);
    coerced.set(fieldId, coerceValue(field, value));
  }
  // Omission is not a free pass: a required field absent from the payload
  // must fail the write, same as an explicit null.
  for (const field of fields) {
    if (
      field.options?.required === true &&
      (coerced.get(field.id) === undefined || coerced.get(field.id) === null)
    ) {
      badRequest("This field is required");
    }
  }
  return coerced;
}

/**
 * node-postgres serializes arrays as PG array literals (`{"a","b"}`), which
 * the jsonb cast rejects — json-family values must arrive as JSON text.
 */
function sqlValue(value: unknown): SQL {
  return sql`${Array.isArray(value) ? JSON.stringify(value) : value}`;
}

const rowSelection = (fields: StoreField[]): SQL[] => {
  const chunks: SQL[] = [
    sql`id`,
    sql`position`,
    sql`created_at`,
    sql`updated_at`,
  ];
  for (const field of fields) {
    const col = colRef(field.id);
    // numeric arrives as a driver string and date as a TZ-shifted Date; cast
    // to double precision / text so JSON round-trips as written.
    const pg = pgTypeFor(field.type);
    chunks.push(
      pg === "numeric"
        ? sql`${col}::double precision AS ${col}`
        : pg === "date"
          ? sql`${col}::text AS ${col}`
          : sql`${col}`,
    );
  }
  return chunks;
};

function toRow(
  record: Record<string, unknown>,
  fields: StoreField[],
): TableRow {
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    const col = column(field.id);
    if (!(col in record)) continue;
    values[field.id] = record[col];
  }
  return {
    id: record.id as string,
    position: record.position as number,
    createdAt: record.created_at as Date,
    updatedAt: record.updated_at as Date,
    values,
  };
}

export async function getRowById(
  executor: Executor,
  tableId: string,
  fields: StoreField[],
  rowId: string,
): Promise<TableRow | null> {
  // Single-row lookup — the 1000-row scan this replaces was both a ceiling
  // (rows past position 1000 were unreachable) and a perf smell.
  const result = await executor.execute(
    sql`SELECT ${sql.join(rowSelection(fields), sql.raw(", "))}
        FROM ${tableRef(tableId)}
        WHERE id = ${rowId}`,
  );
  const record = result.rows[0];
  return record ? toRow(record, fields) : null;
}

export async function insertRow(
  executor: Executor,
  tableId: string,
  fields: StoreField[],
  values: Record<string, unknown> = {},
): Promise<TableRow> {
  const coerced = coerceRowValues(fields, values);
  const columns: SQL[] = [sql`id`, sql`position`];
  const valueChunks: SQL[] = [
    sql`${createId()}`,
    sql`COALESCE((SELECT MAX(position) FROM ${tableRef(tableId)}), -1) + 1`,
  ];
  for (const [fieldId, value] of coerced) {
    columns.push(colRef(fieldId));
    valueChunks.push(sqlValue(value));
  }
  const result = await executor.execute(
    sql`INSERT INTO ${tableRef(tableId)} (${sql.join(columns, sql.raw(", "))})
        VALUES (${sql.join(valueChunks, sql.raw(", "))})
        RETURNING ${sql.join(rowSelection(fields), sql.raw(", "))}`,
  );
  const record = result.rows[0];
  if (!record) notFound("Created row");
  return toRow(record, fields);
}

export async function updateCell(
  executor: Executor,
  tableId: string,
  fields: StoreField[],
  rowId: string,
  fieldId: string,
  value: unknown,
): Promise<TableRow> {
  const field = requireField(fields, fieldId);
  const coerced = coerceValue(field, value);
  const result = await executor.execute(
    sql`UPDATE ${tableRef(tableId)}
        SET ${colRef(fieldId)} = ${sqlValue(coerced)}, updated_at = now()
        WHERE id = ${rowId}
        RETURNING ${sql.join(rowSelection(fields), sql.raw(", "))}`,
  );
  const record = result.rows[0];
  if (!record) notFound("Data table row");
  return toRow(record, fields);
}

export async function deleteRow(
  executor: Executor,
  tableId: string,
  rowId: string,
): Promise<void> {
  const result = await executor.execute(
    sql`DELETE FROM ${tableRef(tableId)} WHERE id = ${rowId} RETURNING id`,
  );
  if (result.rows.length === 0) notFound("Data table row");
}

export async function listRows(
  executor: Executor,
  tableId: string,
  fields: StoreField[],
  limit = 1000,
  offset = 0,
): Promise<{ rows: TableRow[]; total: number }> {
  const [result, count] = await Promise.all([
    executor.execute(
      sql`SELECT ${sql.join(rowSelection(fields), sql.raw(", "))} FROM ${tableRef(tableId)}
          ORDER BY position ASC, created_at ASC
          LIMIT ${limit} OFFSET ${offset}`,
    ),
    executor.execute(
      sql`SELECT count(*)::bigint AS total FROM ${tableRef(tableId)}`,
    ),
  ]);
  return {
    rows: result.rows.map((record) =>
      toRow(record as Record<string, unknown>, fields),
    ),
    total: Number(count.rows[0]?.total ?? 0),
  };
}

function metricExpression(
  metric: QuerySpec["metric"],
  fields: StoreField[],
): SQL {
  if (!AGGREGATIONS.has(metric.agg)) {
    badRequest(`Unsupported aggregation: ${String(metric.agg)}`);
  }
  if (metric.agg === "count") {
    if (metric.fieldId) {
      requireField(fields, metric.fieldId);
    }
    return sql`count(*)::double precision`;
  }
  if (!metric.fieldId) {
    badRequest(`${metric.agg} requires a fieldId`);
  }
  const field = requireField(fields, metric.fieldId);
  if (!isNumericField(field.type)) {
    badRequest(`${metric.agg} requires a number, percent, or currency field`);
  }
  return sql`${sql.raw(metric.agg)}(${colRef(field.id)})::double precision`;
}

function filterExpression(
  filter: NonNullable<QuerySpec["filters"]>[number],
  fields: StoreField[],
): SQL {
  const field = fields.find((candidate) => candidate.id === filter.fieldId);
  if (!field) badRequest(`Unknown filter field: ${filter.fieldId}`);
  const ops = OP_MATRIX[opFamily(field.type)] as readonly string[];
  if (!ops.includes(filter.op)) {
    badRequest(
      `Filter op ${filter.op} is not valid for field type ${field.type}`,
    );
  }
  const col = colRef(field.id);
  switch (filter.op) {
    case "isEmpty":
      return sql`${col} IS NULL`;
    case "in": {
      const items = Array.isArray(filter.value) ? filter.value : [];
      if (items.length === 0) return sql`FALSE`;
      return sql`${col} IN (${sql.join(
        items.map((item) => sql`${coerceValue(field, item)}`),
        sql.raw(", "),
      )})`;
    }
    default: {
      const operator = COMPARISON_SQL[filter.op];
      return sql`${col} ${sql.raw(operator)} ${coerceValue(field, filter.value)}`;
    }
  }
}

export async function runQuery(
  executor: Executor,
  tableId: string,
  fields: StoreField[],
  spec: QuerySpec,
): Promise<{ rows: { label: unknown; value: number }[] }> {
  const metric = metricExpression(spec.metric, fields);

  let labelExpression: SQL;
  let groupExpression: SQL | null = null;
  if (spec.groupBy) {
    const field = fields.find((c) => c.id === spec.groupBy?.fieldId);
    if (!field) badRequest(`Unknown groupBy field: ${spec.groupBy.fieldId}`);
    if (spec.groupBy.bucket) {
      if (
        pgTypeFor(field.type) !== "date" &&
        pgTypeFor(field.type) !== "timestamptz"
      ) {
        badRequest("bucket requires a date or datetime field");
      }
      // The bucket is a valibot-picklisted literal; parameterizing it makes PG
      // unable to resolve the date_trunc overload (unknown $1), so inline it.
      // ::text keeps the label date-identical regardless of server timezone.
      labelExpression = sql`date_trunc(${sql.raw(
        `'${spec.groupBy.bucket}'`,
      )}, ${colRef(field.id)})::text`;
    } else {
      labelExpression = colRef(field.id);
    }
    groupExpression = labelExpression;
  } else {
    labelExpression = sql`NULL::text`;
  }

  let whereExpression: SQL | null = null;
  if (spec.filters?.length) {
    const chunks = spec.filters.map((filter) =>
      filterExpression(filter, fields),
    );
    whereExpression = sql.join(chunks, sql.raw(" AND "));
  }

  // Clamp here too: the route validator default must not be the only guard.
  const limit = Math.min(Math.max(spec.limit ?? 200, 1), 500);

  let query: SQL;
  if (groupExpression) {
    query = sql`SELECT ${labelExpression} AS label, ${metric} AS value
        FROM ${tableRef(tableId)}
        ${whereExpression ? sql`WHERE ${whereExpression}` : sql``}
        GROUP BY ${groupExpression}
        ORDER BY label ASC NULLS LAST
        LIMIT ${limit}`;
  } else {
    query = sql`SELECT ${labelExpression} AS label, ${metric} AS value
        FROM ${tableRef(tableId)}
        ${whereExpression ? sql`WHERE ${whereExpression}` : sql``}
        LIMIT ${limit}`;
  }
  const result = await executor.execute(query);
  return {
    rows: result.rows.map((record) => ({
      label: record.label,
      value: record.value as number,
    })),
  };
}
