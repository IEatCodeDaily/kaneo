import { isDeepStrictEqual } from "node:util";
import { createId } from "@paralleldrive/cuid2";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  max,
  sql,
} from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import * as v from "valibot";
import db from "../database";
import {
  boardTable,
  type DashboardPanelSpec,
  dataTableActivityTable,
  dataTableDashboardTable,
  dataTableFieldTable,
  dataTableRelationTable,
  dataTableTable,
  externalLinkTable,
  organizationMemberTable,
  organizationTable,
  taskTable,
  userTable,
} from "../database/schema";
import {
  getResourcePrivilege,
  listAccessibleResourceIds,
  privilegeAllows,
} from "../resource-access";
import { uniqueResourceSlug } from "../utils/slug";
import { csvLinkColumns } from "./csv";
import {
  coerceValue,
  type FieldType,
  fieldOptionsSchema,
  isFieldType,
} from "./fields";
import * as relations from "./relations";
import { assertTablesEnabled } from "./require-tables-enabled";
import { queryRows, type RowQueryInput } from "./row-query";
import type { StoreField } from "./store";
import * as store from "./store";
import { pruneViewsForDeletedFields } from "./views";

// Function declarations, not const arrows: TS only narrows flow after
// never-returning calls to declared functions (the guards below rely on it).
function notFound(resource: string): never {
  throw new HTTPException(404, { message: `${resource} not found` });
}

function badRequest(message: string): never {
  throw new HTTPException(400, { message });
}

type Executor = typeof db | store.DataTableTx;
const sameJson = (a: unknown, b: unknown) =>
  isDeepStrictEqual(
    JSON.parse(JSON.stringify(a)),
    JSON.parse(JSON.stringify(b)),
  );

async function requireTable(
  organizationId: string,
  tableId: string,
  executor: Executor = db,
) {
  const [table] = await executor
    .select()
    .from(dataTableTable)
    .where(
      and(
        eq(dataTableTable.id, tableId),
        eq(dataTableTable.organizationId, organizationId),
      ),
    )
    .limit(1);
  return table ?? notFound("Data table");
}

// ── activity ──────────────────────────────────────────────────────────────
// One row per user-visible change. Values are stored as written so the log
// reads true after the field is retyped or deleted.

type ActivityInput = {
  tableId: string;
  userId?: string;
  type: string;
  rowId?: string | null;
  fieldId?: string | null;
  data?: Record<string, unknown>;
};

async function logActivity(tx: store.DataTableTx, input: ActivityInput) {
  // Metadata lock serializes writers. A monotonic timestamp also gives events
  // committed by a transaction that waited for that lock their true order.
  const [entry] = await tx
    .insert(dataTableActivityTable)
    .values({
      tableId: input.tableId,
      userId: input.userId ?? null,
      type: input.type,
      rowId: input.rowId ?? null,
      fieldId: input.fieldId ?? null,
      data: input.data ?? null,
      createdAt: sql`GREATEST(clock_timestamp()::timestamp, COALESCE((SELECT MAX(created_at) + interval '1 millisecond' FROM data_table_activity WHERE table_id = ${input.tableId}), clock_timestamp()::timestamp))`,
    })
    .returning();
  if (!entry) throw new Error("Activity insert returned no entry");
  return entry;
}

async function lockTable(
  tx: store.DataTableTx,
  organizationId: string,
  tableId: string,
) {
  const [table] = await tx
    .select()
    .from(dataTableTable)
    .where(
      and(
        eq(dataTableTable.id, tableId),
        eq(dataTableTable.organizationId, organizationId),
      ),
    )
    .for("update");
  return table ?? notFound("Data table");
}

async function tableLinks(executor: Executor, tableId: string) {
  return executor
    .select()
    .from(externalLinkTable)
    .where(
      and(
        eq(externalLinkTable.resourceType, "table_row"),
        sql`${externalLinkTable.metadata}::jsonb->>'tableId' = ${tableId}`,
      ),
    )
    .orderBy(asc(externalLinkTable.id));
}

async function tableSnapshot(
  executor: Executor,
  table: typeof dataTableTable.$inferSelect,
) {
  const fields = await listTableFieldRows(table.id, executor);
  const rows = await store.allRows(
    executor,
    table.id,
    fields.map(toStoreField),
  );
  const links = await tableLinks(executor, table.id);
  const tickets = await ticketsForRows(
    table.organizationId,
    fields.map(toStoreField),
    rows,
    executor,
  );
  for (const ref of await ticketRefs(
    table.organizationId,
    [...new Set(links.map((link) => link.taskId))],
    executor,
  ))
    tickets[ref.id] = ref;
  return { table, fields, rows, links, tickets };
}

async function ensureHistoryBaseline(
  tx: store.DataTableTx,
  table: typeof dataTableTable.$inferSelect,
  userId?: string,
) {
  const [existing] = await tx
    .select({ id: dataTableActivityTable.id })
    .from(dataTableActivityTable)
    .where(
      and(
        eq(dataTableActivityTable.tableId, table.id),
        eq(dataTableActivityTable.type, "baseline"),
      ),
    )
    .limit(1);
  if (!existing)
    await logActivity(tx, {
      tableId: table.id,
      userId,
      type: "baseline",
      data: {
        ...(await tableSnapshot(tx, table)),
        boundary: "No complete history is claimed before this snapshot",
      },
    });
}

/** Every audited mutation uses this one connection and lock, including its reads. */
export async function mutateTable<T>(
  organizationId: string,
  tableId: string,
  userId: string | undefined,
  mutate: (
    tx: store.DataTableTx,
    table: typeof dataTableTable.$inferSelect,
  ) => Promise<T>,
  live = true,
  extraTables: string[] = [],
  baseline = true,
) {
  const discovered = await relations.incident(db, tableId);
  const ids = [
    ...new Set([
      tableId,
      ...extraTables,
      ...discovered.flatMap((relation) => [
        relation.sourceTableId,
        relation.targetTableId,
      ]),
    ]),
  ].sort();
  try {
    return await db.transaction(async (tx) => {
      // ponytail: table-scoped serialization; use finer locks only after contention measurements.
      const tables = [];
      for (const id of ids)
        tables.push(await lockTable(tx, organizationId, id));
      const fresh = await relations.incident(tx, tableId);
      if (
        fresh.some(
          (relation) =>
            !ids.includes(relation.sourceTableId) ||
            !ids.includes(relation.targetTableId),
        )
      )
        throw new HTTPException(409, {
          message: "Table relationships changed. Please retry",
        });
      const table = tables.find((table) => table.id === tableId);
      if (!table) notFound("Data table");
      if (live) requireLive(table);
      if (baseline)
        for (const endpoint of tables)
          await ensureHistoryBaseline(tx, endpoint, userId);
      return mutate(tx, table);
    });
  } catch (error) {
    const code =
      (error as { cause?: { code?: string }; code?: string }).cause?.code ??
      (error as { code?: string }).code;
    if (code === "23505" || code === "23503" || code === "23514")
      throw new HTTPException(409, {
        message: "Relationship conflict. Refresh and try again",
      });
    throw error;
  }
}

const primaryText = (fields: StoreField[], values: Record<string, unknown>) => {
  const field = fields[0];
  if (!field) return null;
  const value = values[field.id];

  if (value === null || value === undefined || value === "") return null;
  if (field.type === "select" || field.type === "multiselect") {
    const choices = field.options?.choices;
    if (!Array.isArray(choices)) return null;
    const ids = Array.isArray(value) ? value : [value];
    const labels = ids.flatMap((id) => {
      const choice = choices.find((choice) => choice.id === id);
      return typeof choice?.label === "string" ? [choice.label] : [];
    });
    return labels.length ? labels.join(", ") : null;
  }
  // Missing resolution is not a license to put opaque entity ids in a title.
  if (field.type === "user" || field.type === "ticket" || field.type === "link")
    return null;
  return typeof value === "object" ? JSON.stringify(value) : String(value);
};

/** Newest first; a rowId narrows to one row's history. */
export async function listTableActivity(
  organizationId: string,
  tableId: string,
  rowId?: string,
  offset = 0,
  limit = 100,
  executor: Executor = db,
  userId?: string,
) {
  await requireTable(organizationId, tableId, executor);
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    badRequest("Invalid activity pagination");
  const entries = await activityQuery(executor, tableId, rowId)
    .offset(offset)
    .limit(limit);
  return Promise.all(
    entries.map(async (entry) => ({
      ...entry,
      data: (await relations.redactHistory(
        executor,
        organizationId,
        entry.data,
        userId,
      )) as Record<string, unknown> | null,
    })),
  );
}

function activityQuery(executor: Executor, tableId: string, rowId?: string) {
  return executor
    .select({
      id: dataTableActivityTable.id,
      type: dataTableActivityTable.type,
      rowId: dataTableActivityTable.rowId,
      fieldId: dataTableActivityTable.fieldId,
      data: dataTableActivityTable.data,
      createdAt: dataTableActivityTable.createdAt,
      userId: dataTableActivityTable.userId,
      userName: userTable.name,
      userImage: userTable.image,
    })
    .from(dataTableActivityTable)
    .leftJoin(userTable, eq(userTable.id, dataTableActivityTable.userId))
    .where(
      and(
        eq(dataTableActivityTable.tableId, tableId),
        rowId ? eq(dataTableActivityTable.rowId, rowId) : undefined,
      ),
    )
    .orderBy(
      desc(dataTableActivityTable.createdAt),
      desc(dataTableActivityTable.id),
    );
}

export async function addTableComment(
  organizationId: string,
  tableId: string,
  content: string,
  rowId: string | undefined,
  userId: string,
) {
  if (
    typeof content !== "string" ||
    !content.trim() ||
    content.trim().length > 20000
  )
    badRequest("Comment must contain 1–20000 characters");
  return mutateTable(organizationId, tableId, userId, async (tx) => {
    const fields = await listTableFieldRows(tableId, tx);
    const row =
      rowId === undefined
        ? null
        : await store.getRowById(tx, tableId, fields, rowId);
    if (rowId !== undefined && !row) notFound("Row");
    const entry = await logActivity(tx, {
      tableId,
      userId,
      type: "comment_added",
      rowId,
      data: {
        content: content.trim(),
        ...(row ? { title: primaryText(fields, row.values) } : {}),
      },
    });
    const [user] = await tx
      .select({ name: userTable.name, image: userTable.image })
      .from(userTable)
      .where(eq(userTable.id, userId));
    return {
      id: entry.id,
      type: entry.type,
      rowId: entry.rowId,
      fieldId: entry.fieldId,
      data: entry.data,
      createdAt: entry.createdAt,
      userId: entry.userId,
      userName: user?.name ?? null,
      userImage: user?.image ?? null,
    };
  });
}

export async function exportTableHistory(
  organizationId: string,
  tableId: string,
) {
  // Same-table writes share this lock; independent ticket changes do not.
  // ponytail: full archive in memory under the writer lock; stream a consistent
  // snapshot when measured archive size or lock time demands it (never truncate).
  return db.transaction(async (tx) => {
    const table = await lockTable(tx, organizationId, tableId);
    const snapshot = await tableSnapshot(tx, table);
    const events = await activityQuery(tx, tableId);
    await relations.project(
      tx,
      organizationId,
      tableId,
      snapshot.fields,
      snapshot.rows,
    );
    for (const event of events)
      event.data = (await relations.redactHistory(
        tx,
        organizationId,
        event.data,
      )) as Record<string, unknown> | null;
    const baseline = events.find((event) => event.type === "baseline");
    return {
      version: 1 as const,
      tickets: snapshot.tickets,
      table: snapshot.table,
      fields: snapshot.fields,
      rows: snapshot.rows,
      links: snapshot.links,
      events,
      historyStartsAt: baseline?.createdAt ?? null,
    };
  });
}

function conflict(): never {
  throw new HTTPException(409, {
    message:
      "Field changed since this conversion; restore would overwrite later edits",
  });
}

export async function revertTableActivity(
  organizationId: string,
  tableId: string,
  activityId: string,
  userId: string,
) {
  return mutateTable(organizationId, tableId, userId, async (tx) => {
    const [event] = await tx
      .select()
      .from(dataTableActivityTable)
      .where(
        and(
          eq(dataTableActivityTable.id, activityId),
          eq(dataTableActivityTable.tableId, tableId),
        ),
      );
    if (!event) notFound("Table activity");
    const data = event.data;
    const before = data?.beforeField as
      | typeof dataTableFieldTable.$inferSelect
      | undefined;
    const after = data?.afterField as
      | typeof dataTableFieldTable.$inferSelect
      | undefined;
    const beforeColumn = data?.beforeColumn as store.ColumnSnapshot | undefined;
    const afterColumn = data?.afterColumn as store.ColumnSnapshot | undefined;
    if (
      event.type !== "field_updated" ||
      !event.fieldId ||
      !before ||
      !after ||
      !isFieldType(before.type) ||
      !isFieldType(after.type) ||
      before.type === after.type ||
      !Array.isArray(beforeColumn) ||
      !Array.isArray(afterColumn)
    )
      conflict();
    const [field] = await tx
      .select()
      .from(dataTableFieldTable)
      .where(
        and(
          eq(dataTableFieldTable.id, event.fieldId),
          eq(dataTableFieldTable.tableId, tableId),
        ),
      );
    if (!field || !sameJson(field, after)) conflict();
    // Even a value changed and then changed back is a later edit. New/deleted
    // rows also conflict: the archived column describes a different row set.
    const [later] = await tx
      .select({ id: dataTableActivityTable.id })
      .from(dataTableActivityTable)
      .where(
        and(
          eq(dataTableActivityTable.tableId, tableId),
          sql`${dataTableActivityTable.createdAt} > (SELECT created_at FROM data_table_activity WHERE id = ${activityId})`,
          sql`(${dataTableActivityTable.fieldId} = ${event.fieldId} OR ${dataTableActivityTable.type} IN ('row_created', 'row_deleted'))`,
        ),
      )
      .limit(1);
    if (
      later ||
      !sameJson(
        await store.snapshotColumn(tx, tableId, { ...field, type: after.type }),
        afterColumn,
      )
    )
      conflict();
    await store.changeFieldType(tx, {
      tableId,
      fieldId: field.id,
      from: after.type,
      to: before.type,
      userId,
    });
    await store.restoreColumn(
      tx,
      tableId,
      { ...field, type: before.type, options: before.options },
      beforeColumn,
      userId,
    );
    const [restored] = await tx
      .update(dataTableFieldTable)
      .set({
        name: before.name,
        type: before.type,
        options: before.options,
        position: before.position,
        updatedAt: new Date(),
      })
      .where(eq(dataTableFieldTable.id, field.id))
      .returning();
    if (!restored) throw new Error("Field restoration returned no field");
    await logActivity(tx, {
      tableId,
      userId,
      type: "field_reverted",
      fieldId: field.id,
      data: {
        activityId,
        name: restored.name,
        beforeField: field,
        afterField: restored,
        fromType: after.type,
        toType: before.type,
        beforeColumn: afterColumn,
        afterColumn: beforeColumn,
        tickets: data?.tickets ?? {},
      },
    });
    return { success: true as const };
  });
}

/** Trashed tables stay readable (restore banner) but not writable. */
function requireLive<T extends { deletedAt: Date | null }>(table: T): T {
  if (table.deletedAt !== null) {
    badRequest("Restore the table before editing it");
  }
  return table;
}

async function requireField(
  tableId: string,
  fieldId: string,
  executor: Executor = db,
) {
  const [field] = await executor
    .select()
    .from(dataTableFieldTable)
    .where(
      and(
        eq(dataTableFieldTable.id, fieldId),
        eq(dataTableFieldTable.tableId, tableId),
        isNull(dataTableFieldTable.deletedAt),
      ),
    )
    .limit(1);
  return field ?? notFound("Data table field");
}

/** Full field metadata rows (name, position, timestamps), known types only. */
async function listTableFieldRows(tableId: string, executor: Executor = db) {
  const fields = await executor
    .select()
    .from(dataTableFieldTable)
    .where(
      and(
        eq(dataTableFieldTable.tableId, tableId),
        isNull(dataTableFieldTable.deletedAt),
      ),
    )
    .orderBy(asc(dataTableFieldTable.position), asc(dataTableFieldTable.id));
  // Row `type` is a plain string, so a type predicate is not assignable to
  // the row type; narrow inside the guard branch instead.
  return fields.flatMap((field) =>
    isFieldType(field.type) ? [{ ...field, type: field.type }] : [],
  );
}

const toStoreField = (field: {
  id: string;
  type: FieldType;
  options: Record<string, unknown> | null;
}): StoreField => ({ id: field.id, type: field.type, options: field.options });

async function listTableFields(tableId: string): Promise<StoreField[]> {
  return (await listTableFieldRows(tableId)).map(toStoreField);
}

// ── ticket fields ─────────────────────────────────────────────────────────
// A ticket cell stores task ids. coerceValue checks the shape; ownership
// (live task in THIS org) needs the org, so it is checked here.

export type TicketRef = {
  id: string;
  key: string;
  title: string;
  status: string;
  boardId: string;
  boardSlug: string;
};

const ticketColumns = {
  id: taskTable.id,
  number: taskTable.number,
  title: taskTable.title,
  status: taskTable.status,
  boardId: boardTable.id,
  boardSlug: boardTable.slug,
};

function toTicketRef(row: {
  id: string;
  number: number | null;
  title: string;
  status: string;
  boardId: string;
  boardSlug: string;
}): TicketRef {
  return {
    id: row.id,
    key: `${row.boardSlug.toUpperCase()}-${row.number ?? "?"}`,
    title: row.title,
    status: row.status,
    boardId: row.boardId,
    boardSlug: row.boardSlug,
  };
}

async function ticketRefs(
  organizationId: string,
  ids: string[],
  executor: Executor = db,
): Promise<TicketRef[]> {
  if (ids.length === 0) return [];
  const rows = await executor
    .select(ticketColumns)
    .from(taskTable)
    .innerJoin(boardTable, eq(boardTable.id, taskTable.boardId))
    .where(
      and(
        inArray(taskTable.id, ids),
        eq(boardTable.organizationId, organizationId),
        isNull(taskTable.deletedAt),
      ),
    );
  return rows.map(toTicketRef);
}

const allowedBoards = (field: StoreField) => {
  const ids = field.options?.boardIds;
  return Array.isArray(ids) && ids.length > 0 ? (ids as string[]) : null;
};

/** A ticket field's board restriction may only name this org's boards. */
async function assertTicketBoards(
  organizationId: string,
  type: FieldType,
  options: Record<string, unknown> | null | undefined,
  executor: Executor = db,
) {
  if (type !== "ticket") return;
  const boardIds = allowedBoards({ id: "", type, options });
  if (!boardIds) return;
  const found = await executor
    .select({ id: boardTable.id })
    .from(boardTable)
    .where(
      and(
        inArray(boardTable.id, boardIds),
        eq(boardTable.organizationId, organizationId),
      ),
    );
  if (found.length !== new Set(boardIds).size) {
    badRequest("Board not found in this organization");
  }
}

async function assertTicketValues(
  organizationId: string,
  fields: StoreField[],
  values: Record<string, unknown>,
  // Ids already in the cell are grandfathered: a ticket deleted after it was
  // linked must not brick the cell (pickers commit the whole array, and a
  // stale id renders nowhere, so the user could never remove it).
  existing: Record<string, unknown> = {},
  executor: Executor = db,
) {
  for (const field of fields) {
    if (field.type !== "ticket") continue;
    const value = values[field.id];
    if (!Array.isArray(value) || value.length === 0) continue;
    const kept = new Set(
      Array.isArray(existing[field.id])
        ? (existing[field.id] as unknown[])
        : [],
    );
    const ids = [
      ...new Set(
        value.filter(
          (id): id is string => typeof id === "string" && !kept.has(id),
        ),
      ),
    ];
    if (ids.length === 0) continue;
    const found = await ticketRefs(organizationId, ids, executor);
    if (found.length !== ids.length) {
      badRequest("Ticket not found in this organization");
    }
    const boards = allowedBoards(field);
    if (boards && found.some((ref) => !boards.includes(ref.boardId))) {
      badRequest("Ticket is not on a board this field allows");
    }
  }
}

/** Ticket lookup for every ticket cell in a page of rows (one query). */
export async function ticketsForRows(
  organizationId: string,
  fields: StoreField[],
  rows: { values: Record<string, unknown> }[],
  executor: Executor = db,
): Promise<Record<string, TicketRef>> {
  const ticketFieldIds = fields
    .filter((field) => field.type === "ticket")
    .map((field) => field.id);
  if (ticketFieldIds.length === 0) return {};
  const ids = new Set<string>();
  for (const row of rows) {
    for (const fieldId of ticketFieldIds) {
      const value = row.values[fieldId];
      if (Array.isArray(value)) {
        for (const id of value) if (typeof id === "string") ids.add(id);
      }
    }
  }
  const refs = await ticketRefs(organizationId, [...ids], executor);
  return Object.fromEntries(refs.map((ref) => [ref.id, ref]));
}

/**
 * Picker options for one ticket field: live tickets on the boards the field
 * allows (and the caller can see), newest first. An empty query browses.
 */
export async function listTicketOptions(
  organizationId: string,
  tableId: string,
  fieldId: string,
  userId: string,
  query = "",
  draftBoardIds?: string[],
): Promise<TicketRef[]> {
  await requireTable(organizationId, tableId);
  const field =
    fieldId === "draft"
      ? {
          id: "draft",
          type: "ticket",
          options: { boardIds: draftBoardIds ?? [] },
        }
      : await requireField(tableId, fieldId);
  if (field.type !== "ticket") badRequest("Not a ticket field");
  const restricted = allowedBoards({
    id: field.id,
    type: "ticket",
    options: field.options,
  });
  const orgBoards = await db
    .select({ id: boardTable.id })
    .from(boardTable)
    .where(
      and(
        eq(boardTable.organizationId, organizationId),
        restricted ? inArray(boardTable.id, restricted) : undefined,
      ),
    );
  const boardIds = await listAccessibleResourceIds({
    organizationId,
    resourceType: "board",
    userId,
    resourceIds: orgBoards.map((board) => board.id),
  });
  if (boardIds.length === 0) return [];
  const q = query.trim();
  const key = /^([a-z0-9-]+)-(\d+)$/i.exec(q);
  const number = /^#?(\d+)$/.exec(q);
  const match = key
    ? and(ilike(boardTable.slug, key[1]), eq(taskTable.number, Number(key[2])))
    : number
      ? eq(taskTable.number, Number(number[1]))
      : q
        ? ilike(taskTable.title, `%${q.replace(/[%_\\]/g, "\\$&")}%`)
        : undefined;
  const rows = await db
    .select(ticketColumns)
    .from(taskTable)
    .innerJoin(boardTable, eq(boardTable.id, taskTable.boardId))
    .where(
      and(
        inArray(taskTable.boardId, boardIds),
        isNull(taskTable.deletedAt),
        match,
      ),
    )
    .orderBy(desc(taskTable.createdAt))
    // ponytail: newest 50; paging when a board outgrows a search-first picker.
    .limit(50);
  return rows.map(toTicketRef);
}

/** Validate an options payload against the registry schema for the type. */
function parseFieldOptions(
  type: FieldType,
  options: unknown,
): Record<string, unknown> | null {
  const parsed = v.safeParse(fieldOptionsSchema(type), options ?? {});
  if (!parsed.success) {
    const issue = parsed.issues[0];
    badRequest(`Invalid field options${issue ? `: ${issue.message}` : ""}`);
  }
  // Absent payload stays null in the column; a payload (e.g. {required:true})
  // parses through the type's schema, which now accepts required everywhere.
  return options === undefined || options === null
    ? null
    : (parsed.output as Record<string, unknown>);
}

export async function listDataTables(organizationId: string) {
  return db
    .select()
    .from(dataTableTable)
    .where(
      and(
        eq(dataTableTable.organizationId, organizationId),
        isNull(dataTableTable.deletedAt),
      ),
    )
    .orderBy(asc(dataTableTable.name));
}

export async function createDataTable(
  organizationId: string,
  values: { name: string; icon?: string | null },
  userId?: string,
) {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(dataTableTable)
      .values({
        organizationId,
        name: values.name,
        slug: await uniqueResourceSlug(
          tx,
          dataTableTable,
          organizationId,
          values.name,
        ),
        icon: values.icon ?? null,
      })
      .returning();
    if (!created) notFound("Created data table");
    await store.createTable(tx, created.id);
    await ensureHistoryBaseline(tx, created, userId);
    await logActivity(tx, {
      tableId: created.id,
      userId,
      type: "table_created",
      data: { table: created },
    });
    return created;
  });
}

export async function getDataTable(
  organizationId: string,
  tableId: string,
  offset = 0,
  userId?: string,
) {
  // Soft-deleted tables still resolve here so the client can show a restore banner.
  const table = await requireTable(organizationId, tableId);
  const fieldRows = await listTableFieldRows(tableId);
  const fields = fieldRows.map(toStoreField);
  const { rows, total } = await store.listRows(
    db,
    tableId,
    fields,
    1000,
    offset,
  );
  const tickets = await ticketsForRows(organizationId, fields, [
    ...rows,
    {
      values: Object.fromEntries(
        fields.map((field) => [field.id, field.options?.defaultValue]),
      ),
    },
  ]);
  await relations.project(
    db,
    organizationId,
    tableId,
    fieldRows,
    rows,
    table.deletedAt ? undefined : userId,
  );
  const canEdit = userId
    ? privilegeAllows(
        await getResourcePrivilege({
          organizationId,
          resourceType: "table",
          resourceId: tableId,
          userId,
        }),
        "edit",
      )
    : false;
  return { ...table, canEdit, fields: fieldRows, rows, total, tickets };
}

export async function queryTableRows(
  organizationId: string,
  tableId: string,
  input: RowQueryInput,
  csv = false,
  userId?: string,
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`);
    await tx.execute(sql`SET LOCAL TIME ZONE 'UTC'`);
    await requireTable(organizationId, tableId, tx);
    const fields = await listTableFieldRows(tableId, tx);
    const members = await tx
      .select({
        id: userTable.id,
        name: userTable.name,
        email: userTable.email,
      })
      .from(organizationMemberTable)
      .innerJoin(userTable, eq(userTable.id, organizationMemberTable.userId))
      .where(eq(organizationMemberTable.organizationId, organizationId));
    // Resolve only references present in this table, within this organization.
    const ticketFields = fields.filter((f) => f.type === "ticket");
    const ids = new Set<string>();
    for (const field of ticketFields) {
      const result = await tx.execute(
        sql`SELECT DISTINCT jsonb_array_elements_text(COALESCE(${store.colRef(field.id)}, '[]'::jsonb)) AS id FROM ${store.tableRef(tableId)}`,
      );
      for (const row of result.rows) ids.add(String(row.id));
    }
    const filterValues = new Map<string, string[]>();
    const collectValues = (node: unknown): void => {
      if (!node || typeof node !== "object") return;
      if (
        "fieldId" in node &&
        typeof node.fieldId === "string" &&
        "value" in node
      ) {
        const values = Array.isArray(node.value) ? node.value : [node.value];
        filterValues.set(node.fieldId, [
          ...(filterValues.get(node.fieldId) ?? []),
          ...values.filter(
            (value): value is string => typeof value === "string",
          ),
        ]);
      }
      if ("children" in node && Array.isArray(node.children))
        node.children.forEach(collectValues);
    };
    collectValues(input.filters);
    for (const field of ticketFields)
      for (const id of filterValues.get(field.id) ?? []) ids.add(id);
    const refs = await ticketRefs(organizationId, [...ids], tx);
    const visibleBoards = userId
      ? await listAccessibleResourceIds({
          organizationId,
          resourceType: "board",
          userId,
          resourceIds: [...new Set(refs.map((ticket) => ticket.boardId))],
        })
      : [];
    const tickets = Object.fromEntries(
      refs
        .filter((ticket) => visibleBoards.includes(ticket.boardId))
        .map((ticket) => [ticket.id, ticket]),
    );
    const links: Record<string, ReturnType<typeof sql>> = {};
    const referenced = new Set<string>();
    const collect = (node: unknown): void => {
      if (!node || typeof node !== "object") return;
      if ("fieldId" in node && typeof node.fieldId === "string")
        referenced.add(node.fieldId);
      if ("children" in node && Array.isArray(node.children))
        node.children.forEach(collect);
    };
    if (Array.isArray(input.filters)) input.filters.forEach(collect);
    else collect(input.filters);
    for (const field of fields.filter(
      (f) => f.type === "link" && referenced.has(f.id),
    )) {
      try {
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
          [side.targetTableId],
          userId,
          "view",
        );
        const requested = [...new Set(filterValues.get(field.id) ?? [])];
        const targets = await relations.labels(
          tx,
          side.targetTableId,
          requested,
        );
        if (
          targets.filter((target) => !target.deleted).length !==
          requested.length
        )
          badRequest("Invalid link filter value");
        links[field.id] =
          sql`(SELECT COALESCE(jsonb_agg(edge.${sql.identifier(side.opposite)}), '[]'::jsonb)
          FROM ${relations.junctionRef(relation.id)} edge
          JOIN ${store.tableRef(side.targetTableId)} target ON target.id = edge.${sql.identifier(side.opposite)} AND target.deleted_at IS NULL
          WHERE edge.${sql.identifier(side.local)} = ${sql.identifier(store.physical(tableId))}.id)`;
      } catch {
        throw new HTTPException(400, { message: "Inaccessible link field" });
      }
    }
    const result = await queryRows(
      tx,
      tableId,
      fields,
      input,
      {
        members: Object.fromEntries(
          members.map((m) => [m.id, m.name || m.email || ""]),
        ),
        tickets,
        userId,
        linkFilters: links,
        ...(csv
          ? {
              links: await csvLinkColumns(
                tx,
                organizationId,
                tableId,
                fields,
                {
                  members: Object.fromEntries(
                    members.map((m) => [m.id, m.name || m.email || ""]),
                  ),
                  tickets,
                },
                userId,
              ),
            }
          : {}),
      },
      csv,
    );
    if ("rows" in result && result.rows)
      await relations.project(
        tx,
        organizationId,
        tableId,
        fields,
        result.rows,
        userId,
      );
    return { ...result, tickets };
  });
}

export async function updateDataTable(
  organizationId: string,
  tableId: string,
  values: { name?: string; icon?: string | null },
  userId?: string,
) {
  return mutateTable(organizationId, tableId, userId, async (tx, table) => {
    if (
      (values.name ?? table.name) === table.name &&
      (values.icon === undefined || values.icon === table.icon)
    )
      return table;
    const [updated] = await tx
      .update(dataTableTable)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(dataTableTable.id, tableId))
      .returning();
    await logActivity(tx, {
      tableId,
      userId,
      type: "table_updated",
      data: { before: table, after: updated },
    });
    return updated;
  });
}

export async function softDeleteDataTable(
  organizationId: string,
  tableId: string,
  userId?: string,
) {
  return mutateTable(
    organizationId,
    tableId,
    userId,
    async (tx, table) => {
      if (table.deletedAt) return table;
      const [updated] = await tx
        .update(dataTableTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(dataTableTable.id, tableId))
        .returning();
      await logActivity(tx, {
        tableId,
        userId,
        type: "table_deleted",
        data: { before: table, after: updated },
      });
      return updated;
    },
    false,
  );
}

export async function restoreDataTable(
  organizationId: string,
  tableId: string,
  userId?: string,
) {
  return mutateTable(
    organizationId,
    tableId,
    userId,
    async (tx, table) => {
      if (!table.deletedAt) return table;
      const [updated] = await tx
        .update(dataTableTable)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(eq(dataTableTable.id, tableId))
        .returning();
      await logActivity(tx, {
        tableId,
        userId,
        type: "table_restored",
        data: { before: table, after: updated },
      });
      return updated;
    },
    false,
  );
}

/** Hard delete: drops the physical table and the metadata row atomically. */
export async function purgeDataTable(
  organizationId: string,
  tableId: string,
  userId?: string,
) {
  return mutateTable(
    organizationId,
    tableId,
    userId,
    async (tx, table) => {
      const incident = await relations.incident(tx, tableId);
      if (incident.length && !table.deletedAt)
        throw new HTTPException(409, {
          message: "Move this table to trash before permanent deletion",
        });
      await relations.authorize(
        tx,
        organizationId,
        [
          tableId,
          ...incident.flatMap((relation) => [
            relation.sourceTableId,
            relation.targetTableId,
          ]),
        ],
        userId,
        "manage",
        false,
      );
      for (const relation of incident) {
        const edges = await tx.execute(
          sql`SELECT source_row_id, target_row_id FROM ${relations.junctionRef(relation.id)}`,
        );
        for (const edge of edges.rows)
          await relations.edgeActivity(
            tx,
            relation,
            String(edge.source_row_id),
            String(edge.target_row_id),
            "link_removed",
            userId,
            "table_purged",
          );
        await relations.ddl(
          tx,
          relation,
          `DROP TABLE kaneo_tables."${relations.junction(relation.id)}"`,
        );
        await tx
          .delete(dataTableRelationTable)
          .where(eq(dataTableRelationTable.id, relation.id));
        await tx
          .delete(dataTableFieldTable)
          .where(
            inArray(dataTableFieldTable.id, [
              relation.sourceFieldId,
              relation.targetFieldId,
            ]),
          );
      }
      await store.dropTable(tx, table.id);
      await tx.delete(dataTableTable).where(eq(dataTableTable.id, table.id));
      return { success: true as const };
    },
    false,
    [],
    false,
  );
}

export async function addFieldToTable(
  organizationId: string,
  tableId: string,
  values: {
    name: string;
    type: FieldType;
    options?: unknown;
    position?: number;
  },
  userId?: string,
) {
  if (values.type === "link") {
    const options = relations.creationOptions(values.options);
    return mutateTable(
      organizationId,
      tableId,
      userId,
      (tx) =>
        relations.createRelation(tx, organizationId, tableId, values, userId),
      true,
      [options.targetTableId],
    );
  }
  return mutateTable(organizationId, tableId, userId, async (tx) => {
    const options = parseFieldOptions(values.type, values.options);
    await assertTicketBoards(organizationId, values.type, options, tx);
    await assertTicketValues(
      organizationId,
      [{ id: "default", type: values.type, options }],
      { default: options?.defaultValue },
      {},
      tx,
    );
    const [last] = await tx
      .select({ position: max(dataTableFieldTable.position) })
      .from(dataTableFieldTable)
      .where(eq(dataTableFieldTable.tableId, tableId));
    const [created] = await tx
      .insert(dataTableFieldTable)
      .values({
        tableId,
        name: values.name,
        type: values.type,
        options,
        position: values.position ?? (last?.position ?? -1) + 1,
      })
      .returning();
    if (!created) notFound("Created data table field");
    await store.addField(tx, {
      tableId,
      fieldId: created.id,
      type: values.type,
    });
    await logActivity(tx, {
      tableId,
      userId,
      type: "field_created",
      fieldId: created.id,
      data: {
        name: created.name,
        fieldType: created.type,
        field: created,
        afterField: created,
        afterColumn: await store.snapshotColumn(tx, tableId, {
          ...created,
          type: values.type,
        }),
      },
    });
    return created;
  });
}

export async function updateTableField(
  organizationId: string,
  tableId: string,
  fieldId: string,
  values: { name?: string; options?: unknown; type?: FieldType },
  userId?: string,
) {
  return mutateTable(organizationId, tableId, userId, async (tx) => {
    const field = await requireField(tableId, fieldId, tx);
    if (!isFieldType(field.type))
      badRequest("Field has an unknown type and cannot be migrated");
    const fromType = field.type;
    const nextType = values.type ?? fromType;
    if (fromType === "link" || nextType === "link") {
      if (
        nextType !== fromType ||
        (values.options !== undefined &&
          !sameJson(values.options, field.options))
      )
        badRequest(
          "Relationship targets and cardinality cannot be changed here; create a new relationship",
        );
      const [updated] = await tx
        .update(dataTableFieldTable)
        .set({ name: values.name ?? field.name, updatedAt: new Date() })
        .where(eq(dataTableFieldTable.id, fieldId))
        .returning();
      await logActivity(tx, {
        tableId,
        fieldId,
        userId,
        type: "field_updated",
        data: { name: values.name ?? field.name, fromName: field.name },
      });
      if (
        !(await relations.allowed(
          organizationId,
          String(field.options?.targetTableId),
          userId,
          "view",
        ))
      )
        return { ...updated, options: { unavailable: true } };
      return updated;
    }
    // A type conversion without options must not carry incompatible old options.
    const options =
      values.options !== undefined || nextType !== fromType
        ? values.options === undefined && nextType !== fromType
          ? field.options?.description
            ? { description: field.options.description }
            : null
          : parseFieldOptions(nextType, values.options)
        : field.options;
    await assertTicketBoards(organizationId, nextType, options, tx);
    await assertTicketValues(
      organizationId,
      [{ id: field.id, type: nextType, options }],
      { [field.id]: options?.defaultValue },
      {},
      tx,
    );
    if (
      nextType === fromType &&
      (values.name ?? field.name) === field.name &&
      sameJson(options, field.options)
    )
      return field;
    const beforeColumn =
      nextType !== fromType
        ? await store.snapshotColumn(tx, tableId, { ...field, type: fromType })
        : undefined;
    if (nextType !== fromType)
      await store.changeFieldType(tx, {
        tableId,
        fieldId,
        from: fromType,
        to: nextType,
        userId,
      });
    const [updated] = await tx
      .update(dataTableFieldTable)
      .set({
        name: values.name ?? field.name,
        options,
        type: nextType,
        updatedAt: new Date(),
      })
      .where(eq(dataTableFieldTable.id, fieldId))
      .returning();
    if (!updated) notFound("Data table field");
    const afterColumn =
      nextType !== fromType
        ? await store.snapshotColumn(tx, tableId, {
            ...updated,
            type: nextType,
          })
        : undefined;
    await logActivity(tx, {
      tableId,
      userId,
      type: "field_updated",
      fieldId,
      data: {
        name: updated.name,
        ...(updated.name !== field.name ? { fromName: field.name } : {}),
        beforeField: field,
        afterField: updated,
        ...(nextType !== fromType
          ? {
              fromType,
              toType: nextType,
              beforeColumn,
              afterColumn,
              tickets: await ticketsForRows(
                organizationId,
                [{ ...field, type: fromType }],
                (beforeColumn ?? []).map((item) => ({
                  values: { [fieldId]: item.value },
                })),
                tx,
              ),
            }
          : {}),
      },
    });
    return updated;
  });
}

export async function deleteTableField(
  organizationId: string,
  tableId: string,
  fieldId: string,
  userId?: string,
) {
  return mutateTable(organizationId, tableId, userId, async (tx) => {
    const field = await requireField(tableId, fieldId, tx);
    if (!isFieldType(field.type)) badRequest("Field has an unknown type");
    if (field.type === "link") {
      const relation = await relations.relationFor(
        tx,
        organizationId,
        tableId,
        fieldId,
      );
      await relations.authorize(
        tx,
        organizationId,
        [relation.sourceTableId, relation.targetTableId],
        userId,
        "edit",
      );
      await tx
        .update(dataTableRelationTable)
        .set({ deletedAt: new Date() })
        .where(eq(dataTableRelationTable.id, relation.id));
      await tx
        .update(dataTableFieldTable)
        .set({ deletedAt: new Date() })
        .where(
          inArray(dataTableFieldTable.id, [
            relation.sourceFieldId,
            relation.targetFieldId,
          ]),
        );
      for (const [id, endpointTable] of [
        [relation.sourceFieldId, relation.sourceTableId],
        [relation.targetFieldId, relation.targetTableId],
      ]) {
        if (endpointTable) {
          await pruneViewsForDeletedFields(tx, endpointTable, [id]);
          await logActivity(tx, {
            tableId: endpointTable,
            fieldId: id,
            userId,
            type: "field_deleted",
            data: { relationId: relation.id },
          });
        }
      }
      return { success: true as const };
    }
    const column = await store.snapshotColumn(tx, tableId, {
      ...field,
      type: field.type,
    });
    const tickets = await ticketsForRows(
      organizationId,
      [{ ...field, type: field.type }],
      column.map((item) => ({ values: { [fieldId]: item.value } })),
      tx,
    );
    await tx
      .update(dataTableFieldTable)
      .set({ deletedAt: new Date() })
      .where(eq(dataTableFieldTable.id, fieldId));
    await pruneViewsForDeletedFields(tx, tableId, [fieldId]);
    await logActivity(tx, {
      tableId,
      userId,
      type: "field_deleted",
      fieldId,
      data: {
        name: field.name,
        field,
        beforeField: field,
        beforeColumn: column,
        tickets,
      },
    });
    return { success: true as const };
  });
}

export async function addTableRow(
  organizationId: string,
  tableId: string,
  values: Record<string, unknown> | undefined,
  userId?: string,
) {
  return mutateTable(organizationId, tableId, userId, (tx) =>
    insertTableRow(tx, organizationId, tableId, values, userId),
  );
}

export async function insertTableRow(
  tx: store.DataTableTx,
  organizationId: string,
  tableId: string,
  values: Record<string, unknown> | undefined,
  userId?: string,
) {
  const fields = await listTableFieldRows(tableId, tx);
  const initialValues = { ...(values ?? {}) };
  for (const field of fields) {
    if (
      !Object.hasOwn(initialValues, field.id) &&
      Object.hasOwn(field.options ?? {}, "defaultValue")
    ) {
      initialValues[field.id] = field.options?.defaultValue;
    }
  }
  await assertTicketValues(organizationId, fields, initialValues, {}, tx);
  const linkValues = Object.fromEntries(
    fields
      .filter(
        (field) =>
          field.type === "link" && Object.hasOwn(initialValues, field.id),
      )
      .map((field) => [field.id, initialValues[field.id]]),
  );
  for (const id of Object.keys(linkValues)) delete initialValues[id];
  const row = await store.insertRow(tx, tableId, fields, initialValues, userId);
  for (const [id, value] of Object.entries(linkValues))
    await relations.writeLinks(
      tx,
      organizationId,
      tableId,
      id,
      row.id,
      { value },
      userId,
      true,
    );
  const refreshed = await store.getRowById(tx, tableId, fields, row.id);
  if (refreshed) row.values = refreshed.values;
  await logActivity(tx, {
    tableId,
    userId,
    type: "row_created",
    rowId: row.id,
    data: {
      title: primaryText(fields, row.values),
      row: await store.getRowById(tx, tableId, fields, row.id, true),
      values: row.values,
      fields,
      tickets: await ticketsForRows(organizationId, fields, [row], tx),
    },
  });
  await relations.project(tx, organizationId, tableId, fields, [row], userId);
  return row;
}

export async function updateTableCell(
  organizationId: string,
  tableId: string,
  rowId: string,
  fieldId: string,
  value: unknown,
  userId?: string,
  ifVersion?: string,
) {
  return mutateTable(organizationId, tableId, userId, async (tx) => {
    const fields = await listTableFieldRows(tableId, tx);
    const current = await store.getRowById(tx, tableId, fields, rowId);
    if (!current) notFound("Row");
    await assertTicketValues(
      organizationId,
      fields,
      { [fieldId]: value },
      current.values,
      tx,
    );
    const field = fields.find((candidate) => candidate.id === fieldId);
    if (!field) notFound("Data table field");
    if (field.type === "link") {
      await relations.writeLinks(
        tx,
        organizationId,
        tableId,
        fieldId,
        rowId,
        { value, ifVersion },
        userId,
      );
      const row = await store.getRowById(tx, tableId, fields, rowId);
      if (!row) notFound("Row");
      await relations.project(
        tx,
        organizationId,
        tableId,
        fields,
        [row],
        userId,
      );
      return {
        ...row,
        tickets: await ticketsForRows(organizationId, fields, [row], tx),
      };
    }
    const coerced = coerceValue(field, value);
    if (await store.cellValueMatches(tx, tableId, rowId, field, coerced)) {
      await relations.project(
        tx,
        organizationId,
        tableId,
        fields,
        [current],
        userId,
      );
      return {
        ...current,
        tickets: await ticketsForRows(organizationId, fields, [current], tx),
      };
    }
    const beforeRow = await store.getRowById(tx, tableId, fields, rowId, true);
    const row = await store.updateCell(
      tx,
      tableId,
      fields,
      rowId,
      fieldId,
      coerced,
      userId,
    );
    const from = current.values[fieldId] ?? null;
    const to = row.values[fieldId] ?? null;
    const tickets = await ticketsForRows(
      organizationId,
      fields,
      [current, row],
      tx,
    );
    await logActivity(tx, {
      tableId,
      userId,
      type: "cell_updated",
      rowId,
      fieldId,
      data: {
        from,
        to,
        title: primaryText(fields, row.values),
        field,
        beforeRow,
        afterRow: await store.getRowById(tx, tableId, fields, rowId, true),
        tickets,
      },
    });
    await relations.project(tx, organizationId, tableId, fields, [row], userId);
    return { ...row, tickets };
  });
}

export async function deleteTableRow(
  organizationId: string,
  tableId: string,
  rowId: string,
  userId?: string,
) {
  return mutateTable(organizationId, tableId, userId, async (tx) => {
    const fields = await listTableFieldRows(tableId, tx);
    const row = await store.getRowById(tx, tableId, fields, rowId, true);
    if (!row) notFound("Row");
    const links = (await tableLinks(tx, tableId)).filter(
      (link) => link.externalId === rowId,
    );
    const tickets = await ticketsForRows(organizationId, fields, [row], tx);
    for (const ref of await ticketRefs(
      organizationId,
      [...new Set(links.map((link) => link.taskId))],
      tx,
    ))
      tickets[ref.id] = ref;
    await tx.execute(
      sql`UPDATE ${relations.rowRef(tableId)} SET deleted_at = now() WHERE id = ${rowId}`,
    );
    if (links.length)
      await tx.delete(externalLinkTable).where(
        inArray(
          externalLinkTable.id,
          links.map((link) => link.id),
        ),
      );
    await logActivity(tx, {
      tableId,
      userId,
      type: "row_deleted",
      rowId,
      data: {
        title: primaryText(fields, row.values),
        row,
        values: row.values,
        fields,
        links,
        tickets,
      },
    });
  });
}

export async function queryDataTable(
  organizationId: string,
  tableId: string,
  spec: store.QuerySpec,
) {
  requireLive(await requireTable(organizationId, tableId));
  const fields = await listTableFields(tableId);
  return store.runQuery(db, tableId, fields, spec);
}

async function requireDashboard(organizationId: string, dashboardId: string) {
  const [dashboard] = await db
    .select()
    .from(dataTableDashboardTable)
    .where(
      and(
        eq(dataTableDashboardTable.id, dashboardId),
        eq(dataTableDashboardTable.organizationId, organizationId),
      ),
    )
    .limit(1);
  return dashboard ?? notFound("Dashboard");
}

/** Every panel's tableId must reference a live table in the same org. */
async function validatePanelTables(
  organizationId: string,
  panels: { query: { tableId: string } }[],
): Promise<void> {
  const tableIds = [...new Set(panels.map((panel) => panel.query.tableId))];
  const tables = await db
    .select({ id: dataTableTable.id })
    .from(dataTableTable)
    .where(
      and(
        eq(dataTableTable.organizationId, organizationId),
        isNull(dataTableTable.deletedAt),
      ),
    );
  const known = new Set(tables.map((table) => table.id));
  for (const tableId of tableIds) {
    if (!known.has(tableId)) {
      badRequest(`Panel references unknown table: ${tableId}`);
    }
  }
}

export async function listDashboards(organizationId: string) {
  return db
    .select()
    .from(dataTableDashboardTable)
    .where(eq(dataTableDashboardTable.organizationId, organizationId))
    .orderBy(asc(dataTableDashboardTable.createdAt));
}

export async function createDashboard(
  organizationId: string,
  values: { name: string },
) {
  const [created] = await db
    .insert(dataTableDashboardTable)
    .values({
      organizationId,
      name: values.name,
      slug: await uniqueResourceSlug(
        db,
        dataTableDashboardTable,
        organizationId,
        values.name,
      ),
    })
    .returning();
  return created ?? notFound("Created dashboard");
}

export async function getDashboard(
  organizationId: string,
  dashboardId: string,
) {
  return requireDashboard(organizationId, dashboardId);
}

export async function updateDashboard(
  organizationId: string,
  dashboardId: string,
  values: { name?: string; panels?: DashboardPanelSpec[] },
) {
  await requireDashboard(organizationId, dashboardId);
  if (values.panels) {
    await validatePanelTables(organizationId, values.panels);
  }
  const [updated] = await db
    .update(dataTableDashboardTable)
    .set({
      ...(values.name !== undefined ? { name: values.name } : {}),
      ...(values.panels !== undefined ? { panels: values.panels } : {}),
      updatedAt: new Date(),
    })
    .where(eq(dataTableDashboardTable.id, dashboardId))
    .returning();
  return updated ?? notFound("Dashboard");
}

export async function deleteDashboard(
  organizationId: string,
  dashboardId: string,
) {
  await requireDashboard(organizationId, dashboardId);
  await db
    .delete(dataTableDashboardTable)
    .where(eq(dataTableDashboardTable.id, dashboardId));
  return { success: true as const };
}

// ── row ↔ task links (S4) ──────────────────────────────────────────────────
// Rows link to tickets through the task resources table (resource type
// "table_row"): the reverse lookup is then an indexed query, and the ticket
// side reuses the existing resources UI. Deliberately no "linkticket" field
// type — ponytail: add one if rows need in-grid ticket columns.

const TABLE_ROW_RESOURCE = "table_row";

export async function getRowTickets(
  organizationId: string,
  tableId: string,
  rowId: string,
) {
  // The row must live in the param table: without this, a forged rowId from
  // another org leaks its ticket list through a table the caller can view.
  const fields = (await listTableFieldRows(tableId)).map(toStoreField);
  const row = await store.getRowById(db, tableId, fields, rowId);
  if (!row) notFound("Row");
  const links = await db
    .select({
      id: externalLinkTable.id,
      taskId: externalLinkTable.taskId,
      url: externalLinkTable.url,
      title: externalLinkTable.title,
      taskTitle: taskTable.title,
      taskStatus: taskTable.status,
      taskNumber: taskTable.number,
      boardSlug: boardTable.slug,
    })
    .from(externalLinkTable)
    .innerJoin(taskTable, eq(taskTable.id, externalLinkTable.taskId))
    .innerJoin(boardTable, eq(boardTable.id, taskTable.boardId))
    .where(
      and(
        eq(externalLinkTable.externalId, rowId),
        eq(externalLinkTable.resourceType, TABLE_ROW_RESOURCE),
        eq(boardTable.organizationId, organizationId),
        isNull(taskTable.deletedAt),
      ),
    );
  return links.map((link) => ({
    id: link.id,
    taskId: link.taskId,
    url: link.url,
    title: link.title,
    taskTitle: link.taskTitle,
    taskStatus: link.taskStatus,
    key: `${link.boardSlug.toUpperCase()}-${link.taskNumber ?? "?"}`,
    boardSlug: link.boardSlug,
  }));
}

async function requireOrgTask(
  organizationId: string,
  taskId: string,
  executor: Executor = db,
) {
  // A task hangs off a board; its organization comes through that join (the
  // same path the organization-access middleware uses).
  const [task] = await executor
    .select({ id: taskTable.id })
    .from(taskTable)
    .innerJoin(boardTable, eq(boardTable.id, taskTable.boardId))
    .where(
      and(
        eq(taskTable.id, taskId),
        eq(boardTable.organizationId, organizationId),
      ),
    );
  if (!task) notFound("Task");
  return task;
}

export async function linkRowToTask(
  organizationId: string,
  tableId: string,
  rowId: string,
  taskId: string,
  userId?: string,
) {
  return mutateTable(organizationId, tableId, userId, async (tx, table) => {
    await requireOrgTask(organizationId, taskId, tx);
    const fields = await listTableFieldRows(tableId, tx);
    const row = await store.getRowById(tx, tableId, fields, rowId);
    if (!row) notFound("Row");
    const existing = await tx
      .select({ id: externalLinkTable.id })
      .from(externalLinkTable)
      .where(
        and(
          eq(externalLinkTable.taskId, taskId),
          eq(externalLinkTable.externalId, rowId),
          eq(externalLinkTable.resourceType, TABLE_ROW_RESOURCE),
        ),
      );
    if (existing.length)
      return { success: true as const, alreadyLinked: true as const };
    const [org] = await tx
      .select({ slug: organizationTable.slug })
      .from(organizationTable)
      .where(eq(organizationTable.id, organizationId));
    const clientUrl = process.env.KANEO_CLIENT_URL;
    if (!clientUrl) badRequest("KANEO_CLIENT_URL is not configured");
    const [link] = await tx
      .insert(externalLinkTable)
      .values({
        taskId,
        integrationId: null,
        externalId: rowId,
        resourceType: TABLE_ROW_RESOURCE,
        url: `${clientUrl}/dashboard/organization/${org?.slug}/table/${tableId}`,
        title: primaryText(fields, row.values) ?? table.name,
        metadata: JSON.stringify({ tableId, tableName: table.name }),
      })
      .returning();
    const [ref] = await ticketRefs(organizationId, [taskId], tx);
    await logActivity(tx, {
      tableId,
      userId,
      type: "ticket_linked",
      rowId,
      data: {
        taskId,
        key: ref?.key,
        title: ref?.title,
        ticket: ref,
        link,
        rowTitle: primaryText(fields, row.values),
      },
    });
    return { success: true as const, alreadyLinked: false as const };
  });
}

export async function unlinkRowTask(
  organizationId: string,
  tableId: string,
  rowId: string,
  taskId: string,
  userId?: string,
) {
  return mutateTable(organizationId, tableId, userId, async (tx) => {
    await requireOrgTask(organizationId, taskId, tx);
    const fields = await listTableFieldRows(tableId, tx);
    const row = await store.getRowById(tx, tableId, fields, rowId);
    if (!row) notFound("Row");
    const removed = await tx
      .delete(externalLinkTable)
      .where(
        and(
          eq(externalLinkTable.taskId, taskId),
          eq(externalLinkTable.externalId, rowId),
          eq(externalLinkTable.resourceType, TABLE_ROW_RESOURCE),
          sql`${externalLinkTable.metadata}::jsonb->>'tableId' = ${tableId}`,
        ),
      )
      .returning();
    if (removed.length) {
      const [ref] = await ticketRefs(organizationId, [taskId], tx);
      await logActivity(tx, {
        tableId,
        userId,
        type: "ticket_unlinked",
        rowId,
        data: {
          taskId,
          key: ref?.key,
          title: ref?.title,
          ticket: ref,
          links: removed,
          rowTitle: primaryText(fields, row.values),
        },
      });
    }
    return { success: true as const };
  });
}

/**
 * "Included in" for a ticket: every row that includes it — via an explicit
 * row link or a ticket-type cell holding it — with the row's full field
 * values, so table rows act as custom fields without widening the ticket.
 */
export async function listRowsForTask(
  organizationId: string,
  taskId: string,
  userId: string,
) {
  await requireOrgTask(organizationId, taskId);
  const links = await db
    .select({
      externalId: externalLinkTable.externalId,
      metadata: externalLinkTable.metadata,
    })
    .from(externalLinkTable)
    .where(
      and(
        eq(externalLinkTable.taskId, taskId),
        eq(externalLinkTable.resourceType, TABLE_ROW_RESOURCE),
      ),
    );
  const linkedRows = new Map<string, Set<string>>();
  for (const link of links) {
    let tableId = "";
    try {
      tableId =
        (link.metadata
          ? (JSON.parse(link.metadata) as { tableId?: string }).tableId
          : "") ?? "";
    } catch {
      tableId = "";
    }
    if (!tableId) continue;
    const ids = linkedRows.get(tableId) ?? new Set<string>();
    ids.add(link.externalId);
    linkedRows.set(tableId, ids);
  }
  // Tables that can hold the ticket in a cell: live, this org, ≥1 ticket field.
  const withTicketFields = await db
    .selectDistinct({ id: dataTableTable.id })
    .from(dataTableTable)
    .innerJoin(
      dataTableFieldTable,
      eq(dataTableFieldTable.tableId, dataTableTable.id),
    )
    .where(
      and(
        eq(dataTableTable.organizationId, organizationId),
        isNull(dataTableTable.deletedAt),
        eq(dataTableFieldTable.type, "ticket"),
      ),
    );
  const candidateIds = [
    ...new Set([...linkedRows.keys(), ...withTicketFields.map((t) => t.id)]),
  ];
  const tables = [];
  for (const tableId of candidateIds) {
    // Same lattice as the table routes: hidden tables never leak a name or
    // a value through a ticket; edit privilege decides inline editing.
    const privilege = await getResourcePrivilege({
      organizationId,
      resourceType: "table",
      resourceId: tableId,
      userId,
    });
    if (!privilegeAllows(privilege, "view")) continue;
    const [table] = await db
      .select({
        name: dataTableTable.name,
        slug: dataTableTable.slug,
        icon: dataTableTable.icon,
      })
      .from(dataTableTable)
      .where(
        and(
          eq(dataTableTable.id, tableId),
          eq(dataTableTable.organizationId, organizationId),
          isNull(dataTableTable.deletedAt),
        ),
      );
    if (!table) continue;
    const fieldRows = await listTableFieldRows(tableId);
    const fields = fieldRows.map(toStoreField);
    const linked = linkedRows.get(tableId) ?? new Set<string>();
    const rows = await store.getRowsIncludingTicket(db, tableId, fields, {
      rowIds: [...linked],
      taskId,
    });
    if (rows.length === 0) continue;
    await relations.project(
      db,
      organizationId,
      tableId,
      fieldRows,
      rows,
      userId,
    );
    tables.push({
      tableId,
      tableName: table.name,
      tableSlug: table.slug,
      icon: table.icon,
      canEdit: privilegeAllows(privilege, "edit"),
      fields: fieldRows,
      rows: rows.map((row) => ({ ...row, linked: linked.has(row.id) })),
      tickets: await ticketsForRows(organizationId, fields, rows),
    });
  }
  const [org] = await db
    .select({ slug: organizationTable.slug })
    .from(organizationTable)
    .where(eq(organizationTable.id, organizationId));
  return { organizationSlug: org?.slug ?? "", tables };
}

// ── public form (nocodb-parity #10) ─────────────────────────────────────
// Anonymous create-only access through an unguessable slug. Revoking clears
// the slug; republishing after a revoke issues a FRESH slug, so a revoked
// link can never be resurrected by anyone holding it.

const FORM_FILLABLE_TYPES: ReadonlySet<FieldType> = new Set([
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
  "url",
  "email",
]);
// Whole-table submissions per rolling minute; created_at is unindexed on the
// physical tables, so this is a bounded scan per public POST.
// ponytail: per-table counter column once any form sees real traffic.
const FORM_RATE_PER_MINUTE = 30;

async function publicFormTable(slug: string) {
  const [table] = await db
    .select()
    .from(dataTableTable)
    .where(
      and(eq(dataTableTable.formSlug, slug), isNull(dataTableTable.deletedAt)),
    )
    .limit(1);
  // 404, never 403/410: a missing, revoked or flag-disabled form must be
  // indistinguishable so the slug space cannot be probed.
  return table ?? notFound("Form");
}

async function publicFormFields(table: typeof dataTableTable.$inferSelect) {
  const allow = new Set(table.formFields ?? []);
  const fields = await listTableFieldRows(table.id);
  return fields.filter(
    (field) => allow.has(field.id) && FORM_FILLABLE_TYPES.has(field.type),
  );
}

export async function getPublicForm(slug: string) {
  const table = await publicFormTable(slug);
  await assertTablesEnabled(table.organizationId);
  const fields = await publicFormFields(table);
  return {
    name: table.name,
    fields: fields.map((field) => {
      const choices = Array.isArray(field.options?.choices)
        ? (field.options.choices as {
            id: string;
            label: string;
            color?: string;
          }[])
        : undefined;
      return {
        id: field.id,
        name: field.name,
        type: field.type,
        required: field.options?.required === true,
        description:
          typeof field.options?.description === "string"
            ? field.options.description
            : null,
        ...(choices ? { choices } : {}),
        ...(field.type === "currency" && typeof field.options?.code === "string"
          ? { currencyCode: field.options.code }
          : {}),
        ...(typeof field.options?.precision === "number"
          ? { precision: field.options.precision }
          : {}),
      };
    }),
  };
}

export async function submitPublicForm(
  slug: string,
  values: Record<string, unknown>,
) {
  const table = await publicFormTable(slug);
  await assertTablesEnabled(table.organizationId);
  const fields = await publicFormFields(table);
  const byId = new Map(fields.map((field) => [field.id, field]));
  // Off-form keys fail the same way whether the field is hidden, deleted or
  // never existed: no allowlist shape leaks through error text.
  for (const fieldId of Object.keys(values))
    if (!byId.has(fieldId)) badRequest("Unknown form field");
  const coerced: Record<string, unknown> = {};
  for (const [fieldId, value] of Object.entries(values)) {
    const field = byId.get(fieldId);
    if (!field) badRequest("Unknown form field");
    coerced[fieldId] = coerceValue(field, value);
  }
  for (const field of fields) {
    if (
      field.options?.required === true &&
      (coerced[field.id] === undefined || coerced[field.id] === null)
    )
      badRequest("This field is required");
  }
  const recent = await db.execute(
    sql`SELECT count(*)::int AS n FROM ${store.tableRef(table.id)} WHERE created_at > now() - interval '1 minute'`,
  );
  if (Number(recent.rows[0]?.n ?? 0) >= FORM_RATE_PER_MINUTE)
    throw new HTTPException(429, {
      message: "Too many submissions; try again shortly",
    });
  await db.transaction(async (tx) => {
    const row = await store.insertRow(
      tx,
      table.id,
      fields.map(toStoreField),
      coerced,
      null,
    );
    await logActivity(tx, {
      tableId: table.id,
      type: "create_row",
      rowId: row.id,
      data: { public: true, values: coerced },
    });
  });
  return { ok: true };
}

export async function publishForm(
  organizationId: string,
  tableId: string,
  fields: string[],
  userId?: string,
) {
  return mutateTable(organizationId, tableId, userId, async (tx, table) => {
    const live = await tx
      .select({
        id: dataTableFieldTable.id,
        type: dataTableFieldTable.type,
      })
      .from(dataTableFieldTable)
      .where(
        and(
          eq(dataTableFieldTable.tableId, tableId),
          isNull(dataTableFieldTable.deletedAt),
        ),
      );
    const byId = new Map(live.map((field) => [field.id, field]));
    for (const fieldId of fields) {
      const field = byId.get(fieldId);
      if (
        !field ||
        !isFieldType(field.type) ||
        !FORM_FILLABLE_TYPES.has(field.type)
      )
        badRequest("Form fields must be live, fillable fields of this table");
    }
    if (new Set(fields).size !== fields.length)
      badRequest("Duplicate form field");
    // Updating the allowlist keeps the slug; only a revoke + republish
    // rotates it.
    const [updated] = await tx
      .update(dataTableTable)
      .set({
        formSlug: table.formSlug ?? createId(),
        formFields: fields,
        updatedAt: new Date(),
      })
      .where(eq(dataTableTable.id, tableId))
      .returning();
    await logActivity(tx, {
      tableId,
      userId,
      type: "form_published",
      data: { fields },
    });
    return updated ?? notFound("Data table");
  });
}

export async function revokeForm(
  organizationId: string,
  tableId: string,
  userId?: string,
) {
  return mutateTable(organizationId, tableId, userId, async (tx, table) => {
    if (!table.formSlug) return table;
    const [updated] = await tx
      .update(dataTableTable)
      .set({ formSlug: null, formFields: null, updatedAt: new Date() })
      .where(eq(dataTableTable.id, tableId))
      .returning();
    await logActivity(tx, {
      tableId,
      userId,
      type: "form_revoked",
      data: {},
    });
    return updated ?? notFound("Data table");
  });
}
