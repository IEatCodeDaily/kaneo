import { eq, inArray, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import {
  dataTableFieldTable,
  dataTableRelationTable,
  dataTableTable,
} from "../database/schema";
import { insertTableRow, mutateTable, ticketsForRows } from "./controllers";
import * as relations from "./relations";
import * as store from "./store";

export async function getLinkedRow(
  organizationId: string,
  tableId: string,
  rowId: string,
  userId: string,
) {
  await relations.authorize(db, organizationId, [tableId], userId, "view");
  const fields = await relations.targetFields(db, tableId);
  const row = await store.getRowById(db, tableId, fields, rowId);
  if (!row) throw new HTTPException(404, { message: "Record not found" });
  const tickets = await ticketsForRows(organizationId, fields, [row]);
  await relations.project(db, organizationId, tableId, fields, [row], userId);
  const [table] = await db
    .select()
    .from(dataTableTable)
    .where(eq(dataTableTable.id, tableId));
  return {
    row,
    fields,
    table: { ...table, fields, rows: [row], total: 1, tickets },
    canEdit: await relations.allowed(organizationId, tableId, userId, "edit"),
  };
}
export async function getLinkOptions(
  organizationId: string,
  tableId: string,
  fieldId: string,
  userId: string,
  query = "",
  cursor?: string,
) {
  const relation = await relations.relationFor(
    db,
    organizationId,
    tableId,
    fieldId,
  );
  const side = relations.endpoint(relation, fieldId);
  await relations.authorize(
    db,
    organizationId,
    [tableId, side.targetTableId],
    userId,
    "view",
  );
  const fields = await relations.targetFields(db, side.targetTableId);
  const primary = fields[0];
  let value = sql`NULL::text`;
  if (primary && !["link", "ticket", "json"].includes(primary.type)) {
    const column = sql.identifier(store.column(primary.id));
    if (primary.type === "select" || primary.type === "multiselect") {
      value = sql`(SELECT string_agg(choice->>'label', ', ' ORDER BY ordinality) FROM jsonb_array_elements(${JSON.stringify(primary.options?.choices ?? [])}::jsonb) WITH ORDINALITY AS choices(choice, ordinality) WHERE ${primary.type === "select" ? sql`choice->>'id' = ${column}` : sql`${column} @> jsonb_build_array(choice->>'id')`})`;
    } else if (primary.type === "user")
      value = sql`(SELECT name FROM "user" WHERE id = ${column})`;
    else value = sql`${column}::text`;
  }
  const scope = JSON.stringify([organizationId, tableId, fieldId, query]);
  let after: { label: string; id: string } | null = null;
  if (cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString());
      if (
        decoded.scope !== scope ||
        typeof decoded.label !== "string" ||
        typeof decoded.id !== "string"
      )
        throw new Error("Invalid cursor");
      after = decoded;
    } catch {
      throw new HTTPException(400, { message: "Invalid record cursor" });
    }
  }
  const escaped = query.replace(/[\\%_]/g, (character) => `\\${character}`);
  const result = await db.execute(sql`WITH records AS (
    SELECT id, COALESCE(NULLIF(${value}, ''), 'Untitled record') AS label FROM ${relations.rowRef(side.targetTableId)} WHERE deleted_at IS NULL
  ) SELECT id, label FROM records WHERE label ILIKE ${`%${escaped}%`} ESCAPE '\\'
    ${after ? sql`AND (label, id) > (${after.label}, ${after.id})` : sql``}
    ORDER BY label, id LIMIT 51`);
  const records = result.rows
    .slice(0, 50)
    .map((row) => ({ id: String(row.id), label: String(row.label) }));
  const last = records[records.length - 1];
  const canLink =
    (await relations.allowed(organizationId, tableId, userId, "edit")) &&
    (await relations.allowed(
      organizationId,
      side.targetTableId,
      userId,
      "edit",
    ));
  // Field options in the create form have the same opposite-table redaction as row pages.
  await relations.project(
    db,
    organizationId,
    side.targetTableId,
    fields,
    [],
    userId,
  );
  return {
    records,
    hasMore: result.rows.length > 50,
    nextCursor:
      result.rows.length > 50 && last
        ? Buffer.from(JSON.stringify({ scope, ...last })).toString("base64url")
        : null,
    canLink,
    canCreate: canLink,
    primaryField: primary,
    fields,
    targetTableId: side.targetTableId,
    localMax: side.localMax,
  };
}
export async function getRowLinks(
  organizationId: string,
  tableId: string,
  rowId: string,
  fieldId: string,
  userId: string,
  offset = 0,
) {
  const relation = await relations.relationFor(
    db,
    organizationId,
    tableId,
    fieldId,
  );
  const side = relations.endpoint(relation, fieldId);
  await relations.authorize(
    db,
    organizationId,
    [tableId, side.targetTableId],
    userId,
    "view",
  );
  const source = await db.execute(
    sql`SELECT id FROM ${relations.rowRef(tableId)} WHERE id = ${rowId}`,
  );
  if (!source.rows.length)
    throw new HTTPException(404, { message: "Record not found" });
  const ids = await relations.retainedIds(db, relation, fieldId, rowId);
  const byId = new Map(
    (await relations.labels(db, side.targetTableId, ids)).map((row) => [
      row.id,
      row,
    ]),
  );
  const records = ids.flatMap((id) => {
    const record = byId.get(id);
    return record ? [record] : [];
  });
  return {
    records: records.slice(offset, offset + 50),
    total: records.filter((row) => !row.deleted).length,
    hasMore: records.length > offset + 50,
    nextCursor: records.length > offset + 50 ? offset + 50 : null,
    version: relations.version(relation, ids),
  };
}
export async function mutateLinks(
  organizationId: string,
  tableId: string,
  rowId: string,
  fieldId: string,
  input: { add?: unknown; remove?: unknown; ifVersion?: string },
  userId: string,
) {
  return mutateTable(organizationId, tableId, userId, async (tx) => {
    await relations.writeLinks(
      tx,
      organizationId,
      tableId,
      fieldId,
      rowId,
      input,
      userId,
    );
    const fields = await relations.targetFields(tx, tableId);
    const row = await store.getRowById(tx, tableId, fields, rowId);
    if (!row) throw new HTTPException(404, { message: "Record not found" });
    await relations.project(tx, organizationId, tableId, fields, [row], userId);
    return row;
  });
}
export async function createLinkedRow(
  organizationId: string,
  tableId: string,
  rowId: string,
  fieldId: string,
  values: Record<string, unknown>,
  userId: string,
  ifVersion?: string,
) {
  return mutateTable(organizationId, tableId, userId, async (tx) => {
    const relation = await relations.relationFor(
      tx,
      organizationId,
      tableId,
      fieldId,
    );
    const side = relations.endpoint(relation, fieldId);
    await relations.authorize(
      tx,
      organizationId,
      [tableId, side.targetTableId],
      userId,
      "edit",
    );
    const targetFields = await relations.targetFields(tx, side.targetTableId);
    if (
      targetFields.some(
        (field) => field.type === "link" && Object.hasOwn(values, field.id),
      )
    )
      throw new HTTPException(400, {
        message: "Create linked records without nested relationships",
      });
    const target = await insertTableRow(
      tx,
      organizationId,
      side.targetTableId,
      values,
      userId,
    );
    const remove =
      side.localMax === "one"
        ? await relations.retainedIds(tx, relation, fieldId, rowId)
        : [];
    await relations.writeLinks(
      tx,
      organizationId,
      tableId,
      fieldId,
      rowId,
      { add: [target.id], remove, ifVersion },
      userId,
    );
    return target;
  });
}
export async function rowLifecycle(
  organizationId: string,
  tableId: string,
  rowId: string,
  userId: string,
  purge: boolean,
) {
  return mutateTable(organizationId, tableId, userId, async (tx) => {
    const found = await tx.execute(
      sql`SELECT deleted_at FROM ${relations.rowRef(tableId)} WHERE id = ${rowId}`,
    );
    if (!found.rows.length)
      throw new HTTPException(404, { message: "Record not found" });
    if (purge) {
      if (!found.rows[0]?.deleted_at)
        throw new HTTPException(409, {
          message: "Move this record to trash first",
        });
      for (const relation of await relations.incident(tx, tableId)) {
        const edges = await tx.execute(
          sql`SELECT source_row_id, target_row_id FROM ${relations.junctionRef(relation.id)} WHERE ${relation.sourceTableId === tableId ? sql`source_row_id = ${rowId}` : sql`false`} OR ${relation.targetTableId === tableId ? sql`target_row_id = ${rowId}` : sql`false`}`,
        );
        for (const edge of edges.rows)
          await relations.edgeActivity(
            tx,
            relation,
            String(edge.source_row_id),
            String(edge.target_row_id),
            "link_removed",
            userId,
            "row_purged",
          );
      }
      await store.deleteRow(tx, tableId, rowId);
    } else
      await tx.execute(
        sql`UPDATE ${relations.rowRef(tableId)} SET deleted_at = NULL WHERE id = ${rowId}`,
      );
    return { success: true as const };
  });
}
export async function pairLifecycle(
  organizationId: string,
  tableId: string,
  fieldId: string,
  userId: string,
  purge: boolean,
) {
  return mutateTable(organizationId, tableId, userId, async (tx) => {
    const [field] = await tx
      .select()
      .from(dataTableFieldTable)
      .where(eq(dataTableFieldTable.id, fieldId));
    if (!field || field.tableId !== tableId || !field.deletedAt)
      throw new HTTPException(404, { message: "Trashed field not found" });
    if (field.type !== "link") {
      await relations.authorize(
        tx,
        organizationId,
        [tableId],
        userId,
        purge ? "manage" : "edit",
      );
      if (purge) {
        await store.dropField(tx, { tableId, fieldId });
        await tx
          .delete(dataTableFieldTable)
          .where(eq(dataTableFieldTable.id, fieldId));
      } else
        await tx
          .update(dataTableFieldTable)
          .set({ deletedAt: null })
          .where(eq(dataTableFieldTable.id, fieldId));
      return { success: true as const };
    }
    const relation = await relations.relationFor(
      tx,
      organizationId,
      tableId,
      fieldId,
      true,
    );
    await relations.authorize(
      tx,
      organizationId,
      [relation.sourceTableId, relation.targetTableId],
      userId,
      purge ? "manage" : "edit",
    );
    if (!relation.deletedAt)
      throw new HTTPException(409, { message: "Relationship is not in trash" });
    if (purge) {
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
          "relation_purged",
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
    } else {
      await tx
        .update(dataTableRelationTable)
        .set({ deletedAt: null })
        .where(eq(dataTableRelationTable.id, relation.id));
      await tx
        .update(dataTableFieldTable)
        .set({ deletedAt: null })
        .where(
          inArray(dataTableFieldTable.id, [
            relation.sourceFieldId,
            relation.targetFieldId,
          ]),
        );
    }
    return { success: true as const };
  });
}
