import { and, eq, isNull, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import * as v from "valibot";
import {
  boardTable,
  organizationMemberTable,
  taskTable,
  userTable,
} from "../database/schema";
import { insertTableRow, mutateTable } from "./controllers";
import { coerceValue } from "./fields";
import * as relations from "./relations";
import { cellText, type QueryLookups } from "./row-query";
import * as store from "./store";

export const csvImportSchema = v.object({
  csv: v.pipe(v.string(), v.maxLength(5_000_000)),
  mapping: v.pipe(v.array(v.nullable(v.string())), v.maxLength(500)),
  offset: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), 0),
  preview: v.optional(v.boolean(), true),
});
export type CsvImport = v.InferOutput<typeof csvImportSchema>;
type CsvError = { line: number; field: string; message: string };
class CsvResult extends Error {
  constructor(
    public result: {
      created: number;
      checked: number;
      total: number;
      errors: CsvError[];
    },
  ) {
    super("CSV rollback");
  }
}
function invalid(message: string): never {
  throw new HTTPException(400, { message });
}

/** Strict RFC4180 parsing; physical source lines survive embedded CRLF/newlines. */
export function parseCsv(source: string) {
  const text = source.replace(/^\uFEFF/, "");
  const rows: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let closed = false;
  let line = 1;
  let start = 1;
  const finish = () => {
    rows.push({ line: start, cells: [...cells, cell] });
    cells = [];
    cell = "";
    closed = false;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else {
        cell += ch;
        if (ch === "\n" || (ch === "\r" && text[i + 1] !== "\n")) line++;
      }
    } else if (ch === ",") {
      cells.push(cell);
      cell = "";
      closed = false;
    } else if (ch === "\r" || ch === "\n") {
      finish();
      if (ch === "\r" && text[i + 1] === "\n") i++;
      line++;
      start = line;
    } else if (ch === '"' && cell === "" && !closed) quoted = true;
    else {
      if (closed || ch === '"') invalid(`Line ${line}: malformed CSV quoting`);
      cell += ch;
    }
  }
  if (quoted) invalid(`Line ${start}: unclosed CSV quote`);
  if (cell !== "" || cells.length || closed) finish();
  return rows;
}

/** Same display projection as server CSV; exact labels, not internal row ids. */
async function primarySql(
  tx: store.DataTableTx,
  tableId: string,
  lookups: QueryLookups,
) {
  const primary = (await relations.targetFields(tx, tableId))[0];
  return primary && primary.type !== "link"
    ? cellText(primary, lookups)
    : sql`''`;
}
export async function csvLinkColumns(
  tx: store.DataTableTx,
  organizationId: string,
  tableId: string,
  fields: store.StoreField[],
  lookups: QueryLookups,
  userId?: string,
) {
  const links: NonNullable<QueryLookups["links"]> = {};
  for (const field of fields.filter((f) => f.type === "link")) {
    const relation = await relations.relationFor(
      tx,
      organizationId,
      tableId,
      field.id,
    );
    const side = relations.endpoint(relation, field.id);
    // Downloads fail closed, rather than silently exporting redacted/partial relationships.
    await relations.authorize(
      tx,
      organizationId,
      [tableId, side.targetTableId],
      userId,
      "view",
    );
    const label = await primarySql(tx, side.targetTableId, lookups);
    links[field.id] =
      sql`COALESCE((SELECT string_agg(labels.label, ', ' ORDER BY edges.position) FROM ${relations.junctionRef(relation.id)} edges JOIN (SELECT id, ${label} AS label FROM ${store.tableRef(side.targetTableId)} WHERE deleted_at IS NULL) labels ON labels.id = edges.${sql.identifier(side.opposite)} WHERE edges.${sql.identifier(side.local)} = ${sql.identifier(store.physical(tableId))}.id), '')`;
  }
  return links;
}

export async function importCsv(
  organizationId: string,
  tableId: string,
  input: CsvImport,
  userId: string,
) {
  // ponytail: reparse a bounded (5 MB) file per batch; stage uploads server-side if large imports need it.
  const parsed = parseCsv(input.csv);
  const header = parsed[0]?.cells ?? [];
  const rows = parsed
    .slice(1)
    .filter((row) => row.cells.some((cell) => cell !== ""));
  if (!header.length || input.mapping.length !== header.length)
    invalid("Map every CSV column, or explicitly exclude it");
  if (!input.mapping.some(Boolean)) invalid("Map at least one field");
  const mapped = input.mapping.filter((id): id is string => id !== null);
  if (new Set(mapped).size !== mapped.length)
    invalid("Map each field only once");
  const batch = rows.slice(input.offset, input.offset + 50);
  try {
    return await mutateTable(organizationId, tableId, userId, async (tx) => {
      await relations.authorize(tx, organizationId, [tableId], userId, "edit");
      const fields = await relations.targetFields(tx, tableId);
      if (mapped.some((id) => !fields.some((f) => f.id === id)))
        invalid("A mapped field is unavailable. Refresh the mapping");
      const members = await tx
        .select({
          id: userTable.id,
          name: userTable.name,
          email: userTable.email,
        })
        .from(organizationMemberTable)
        .innerJoin(userTable, eq(userTable.id, organizationMemberTable.userId))
        .where(eq(organizationMemberTable.organizationId, organizationId));
      const lookups: QueryLookups = {
        members: Object.fromEntries(
          members.map((m) => [m.id, m.name || m.email]),
        ),
        tickets: {},
      };
      const errors: CsvError[] = [];
      for (const row of batch) {
        if (row.cells.length !== header.length) {
          errors.push({
            line: row.line,
            field: "CSV",
            message: "Column count does not match the header",
          });
          continue;
        }
        const values: Record<string, unknown> = {};
        for (const field of fields) {
          const index = input.mapping.indexOf(field.id);
          if (index < 0 && field.options?.required !== true) continue;
          const raw = index < 0 ? undefined : row.cells[index];
          // Undo only the formula-neutralisation prefix written by our exporter.
          const text = raw?.replace(/^'(?=[=+\-@\t\r'])/, "");
          try {
            let value: unknown =
              text === "" || text === undefined
                ? (field.options?.defaultValue ?? null)
                : text;
            if (
              value !== null &&
              value !== undefined &&
              text !== "" &&
              text !== undefined
            ) {
              if (["number", "percent", "currency"].includes(field.type))
                value = text?.trim() ? Number(text) : Number.NaN;
              if (field.type === "checkbox") {
                if (!/^(true|false|yes|no|1|0)$/i.test(String(value)))
                  invalid("Use true or false");
                value = /^(true|yes|1)$/i.test(String(value));
              }
              if (["select", "multiselect"].includes(field.type)) {
                const choices = Array.isArray(field.options?.choices)
                  ? field.options.choices
                  : [];
                const ids = (
                  field.type === "select"
                    ? [String(value)]
                    : String(value).split(",")
                ).map((label) => {
                  const matches = choices.filter(
                    (c: { label: string }) =>
                      c.label.toLowerCase() === label.trim().toLowerCase(),
                  );
                  if (matches.length !== 1)
                    invalid("Choice is missing or ambiguous");
                  const choice = matches[0];
                  if (!choice) invalid("Choice was not found");
                  return choice.id;
                });
                value = field.type === "select" ? ids[0] : ids;
              }
              if (field.type === "user") {
                const matches = members.filter(
                  (m) =>
                    (m.name || m.email).toLowerCase() ===
                    String(value).toLowerCase(),
                );
                if (matches.length !== 1)
                  invalid("Member is missing or ambiguous");
                value = matches[0]?.id;
              }
              if (field.type === "ticket") {
                const ids: string[] = [];
                for (const key of String(value)
                  .split(",")
                  .map((key) => key.trim())) {
                  const found = await tx
                    .select({ id: taskTable.id })
                    .from(taskTable)
                    .innerJoin(boardTable, eq(boardTable.id, taskTable.boardId))
                    .where(
                      and(
                        eq(boardTable.organizationId, organizationId),
                        isNull(taskTable.deletedAt),
                        sql`lower(upper(${boardTable.slug}) || '-' || ${taskTable.number}::text) = lower(${key})`,
                      ),
                    )
                    .limit(2);
                  if (found.length !== 1)
                    invalid("Ticket key is missing or ambiguous");
                  const ticket = found[0];
                  if (!ticket) invalid("Ticket key was not found");
                  const boardIds = field.options?.boardIds;
                  if (Array.isArray(boardIds) && boardIds.length) {
                    const [allowed] = await tx
                      .select({ boardId: taskTable.boardId })
                      .from(taskTable)
                      .where(eq(taskTable.id, ticket.id));
                    if (!allowed || !boardIds.includes(allowed.boardId))
                      invalid("Ticket is not on a board this field allows");
                  }
                  ids.push(ticket.id);
                }
                value = ids;
              }
              if (field.type === "json") value = JSON.parse(String(value));
              if (field.type === "link") {
                const relation = await relations.relationFor(
                  tx,
                  organizationId,
                  tableId,
                  field.id,
                );
                const side = relations.endpoint(relation, field.id);
                await relations.authorize(
                  tx,
                  organizationId,
                  [tableId, side.targetTableId],
                  userId,
                  "edit",
                );
                const labelSql = await primarySql(
                  tx,
                  side.targetTableId,
                  lookups,
                );
                // Prefer a whole-cell exact match so a primary value containing a comma remains importable.
                const whole = await tx.execute(
                  sql`SELECT id FROM ${store.tableRef(side.targetTableId)} WHERE deleted_at IS NULL AND lower(${labelSql}) = lower(${String(value)}) LIMIT 2`,
                );
                const labels = whole.rows.length
                  ? [String(value)]
                  : String(value)
                      .split(",")
                      .map((label) => label.trim());
                if (side.localMax === "one" && labels.length > 1)
                  invalid("This relationship allows only one linked record");
                const ids: string[] = [];
                for (const label of labels) {
                  const matches = await tx.execute(
                    sql`SELECT id FROM ${store.tableRef(side.targetTableId)} WHERE deleted_at IS NULL AND lower(${labelSql}) = lower(${label}) LIMIT 2`,
                  );
                  if (matches.rows.length !== 1)
                    invalid(
                      matches.rows.length
                        ? "Linked primary value is ambiguous"
                        : "Linked primary value was not found",
                    );
                  ids.push(String(matches.rows[0]?.id));
                }
                value = ids;
              }
            }
            if (field.type !== "link") coerceValue(field, value);
            else if (value === null) {
              if (field.options?.required === true)
                invalid("This field is required");
              value = [];
            }
            values[field.id] = value;
          } catch (error) {
            if (
              error instanceof HTTPException &&
              [403, 404].includes(error.status)
            )
              throw error;
            errors.push({
              line: row.line,
              field: field.name,
              message: error instanceof Error ? error.message : "Invalid cell",
            });
          }
        }
        if (errors.some((error) => error.line === row.line)) continue;
        try {
          // Savepoints let us report every rejected source line; outer rollback still makes the batch atomic.
          await tx.transaction(async (savepoint) => {
            await insertTableRow(
              savepoint,
              organizationId,
              tableId,
              values,
              userId,
            );
          });
        } catch (error) {
          if (
            error instanceof HTTPException &&
            [403, 404].includes(error.status)
          )
            throw error;
          errors.push({
            line: row.line,
            field:
              fields
                .filter((f) => f.type === "link" && Object.hasOwn(values, f.id))
                .map((f) => f.name)
                .join(", ") || "Row",
            message:
              error instanceof HTTPException
                ? error.message
                : "Row failed server validation",
          });
        }
      }
      if (errors.length) {
        for (const row of batch)
          if (!errors.some((error) => error.line === row.line))
            errors.push({
              line: row.line,
              field: "Batch",
              message: "Not imported because another row in this batch failed",
            });
      }
      const result = {
        created: input.preview || errors.length ? 0 : batch.length,
        checked: batch.length,
        total: rows.length,
        errors,
      };
      if (input.preview || errors.length) throw new CsvResult(result);
      return result;
    });
  } catch (error) {
    if (error instanceof CsvResult) return error.result;
    throw error;
  }
}
