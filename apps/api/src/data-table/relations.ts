import { createHash } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type db from "../database";
import {
  dataTableActivityTable,
  dataTableDdlLogTable,
  dataTableFieldTable,
  dataTableRelationTable,
  dataTableTable,
  userTable,
} from "../database/schema";
import { getResourcePrivilege, privilegeAllows } from "../resource-access";
import { isFieldType } from "./fields";
import * as store from "./store";

type Executor = typeof db | store.DataTableTx;
type Relation = typeof dataTableRelationTable.$inferSelect;
type Field = typeof dataTableFieldTable.$inferSelect;
export const CARDINALITIES = [
  "many-to-one",
  "one-to-many",
  "many-to-many",
  "one-to-one",
] as const;
export type Cardinality = (typeof CARDINALITIES)[number];
function fail(status: 400 | 403 | 404 | 409 | 428, message: string): never {
  throw new HTTPException(status, { message });
}
export function junction(id: string) {
  if (!/^[a-zA-Z0-9]+$/.test(id)) fail(400, "Invalid relationship identifier");
  return `l_${id}`;
}
export const junctionRef = (id: string) =>
  sql.raw(`kaneo_tables."${junction(id)}"`);
export const rowRef = (id: string) =>
  sql.raw(`kaneo_tables."${store.physical(id)}"`);
export const isRelation = (field: store.StoreField) =>
  field.type === "link" && typeof field.options?.relationId === "string";
export function maxima(
  cardinality: Cardinality,
): ["one" | "many", "one" | "many"] {
  return [
    cardinality === "many-to-one" || cardinality === "one-to-one"
      ? "one"
      : "many",
    cardinality === "one-to-many" || cardinality === "one-to-one"
      ? "one"
      : "many",
  ];
}
export function endpoint(relation: Relation, fieldId: string) {
  const source = relation.sourceFieldId === fieldId;
  if (!source && relation.targetFieldId !== fieldId)
    fail(404, "Relationship not found");
  return {
    local: source ? "source_row_id" : "target_row_id",
    opposite: source ? "target_row_id" : "source_row_id",
    tableId: source ? relation.sourceTableId : relation.targetTableId,
    targetTableId: source ? relation.targetTableId : relation.sourceTableId,
    inverseFieldId: source ? relation.targetFieldId : relation.sourceFieldId,
    localMax: source ? relation.sourceMax : relation.targetMax,
    inverseMax: source ? relation.targetMax : relation.sourceMax,
    side: source ? "source" : "target",
  };
}
export async function incident(executor: Executor, tableId: string) {
  return executor
    .select()
    .from(dataTableRelationTable)
    .where(
      or(
        eq(dataTableRelationTable.sourceTableId, tableId),
        eq(dataTableRelationTable.targetTableId, tableId),
      ),
    );
}
export async function relationFor(
  executor: Executor,
  organizationId: string,
  tableId: string,
  fieldId: string,
  retained = false,
) {
  const [relation] = await executor
    .select()
    .from(dataTableRelationTable)
    .where(
      and(
        eq(dataTableRelationTable.organizationId, organizationId),
        or(
          and(
            eq(dataTableRelationTable.sourceTableId, tableId),
            eq(dataTableRelationTable.sourceFieldId, fieldId),
          ),
          and(
            eq(dataTableRelationTable.targetTableId, tableId),
            eq(dataTableRelationTable.targetFieldId, fieldId),
          ),
        ),
        retained ? undefined : isNull(dataTableRelationTable.deletedAt),
      ),
    );
  return relation ?? fail(404, "Relationship not found");
}
export async function allowed(
  organizationId: string,
  tableId: string,
  userId: string | undefined,
  required: "view" | "edit" | "manage",
) {
  if (!userId) return false;
  return privilegeAllows(
    await getResourcePrivilege({
      organizationId,
      resourceType: "table",
      resourceId: tableId,
      userId,
    }),
    required,
  );
}
export async function authorize(
  executor: Executor,
  organizationId: string,
  ids: string[],
  userId: string | undefined,
  required: "view" | "edit" | "manage",
  live = true,
) {
  for (const id of new Set(ids)) {
    const [table] = await executor
      .select()
      .from(dataTableTable)
      .where(
        and(
          eq(dataTableTable.id, id),
          eq(dataTableTable.organizationId, organizationId),
        ),
      );
    if (!table || !(await allowed(organizationId, id, userId, "view")))
      fail(404, "Data unavailable");
    if (!(await allowed(organizationId, id, userId, required)))
      fail(
        403,
        "Editing this relationship requires edit access to both tables",
      );
    if (live && table.deletedAt)
      fail(409, "Restore the table before editing this relationship");
  }
}
export async function ddl(
  tx: store.DataTableTx,
  relation: Relation,
  statement: string,
) {
  await tx.execute(sql.raw(statement));
  await tx.insert(dataTableDdlLogTable).values({
    dataTableId: relation.sourceTableId,
    statement: `/* relation ${relation.id}; tables ${relation.sourceTableId}, ${relation.targetTableId} */ ${statement}`,
  });
}
export async function createJunction(
  tx: store.DataTableTx,
  relation: Relation,
) {
  const name = `kaneo_tables."${junction(relation.id)}"`;
  await ddl(
    tx,
    relation,
    `CREATE TABLE ${name} (
    source_row_id text NOT NULL REFERENCES kaneo_tables."${store.physical(relation.sourceTableId)}"(id) ON DELETE CASCADE,
    target_row_id text NOT NULL REFERENCES kaneo_tables."${store.physical(relation.targetTableId)}"(id) ON DELETE CASCADE,
    position bigint GENERATED BY DEFAULT AS IDENTITY,
    PRIMARY KEY (source_row_id, target_row_id)
    ${relation.sourceMax === "one" ? ", UNIQUE(source_row_id)" : ""}
    ${relation.targetMax === "one" ? ", UNIQUE(target_row_id)" : ""}
    ${relation.sourceTableId === relation.targetTableId ? ", CHECK(source_row_id <> target_row_id)" : ""}
  )`,
  );
  for (const [local, opposite] of [
    ["source_row_id", "target_row_id"],
    ["target_row_id", "source_row_id"],
  ])
    await ddl(
      tx,
      relation,
      `CREATE INDEX ON ${name} (${local}, position, ${opposite})`,
    );
}
export function creationOptions(options: unknown) {
  if (!options || typeof options !== "object" || Array.isArray(options))
    fail(400, "Choose a target table");
  const value = options as Record<string, unknown>;
  if (
    Object.keys(value).some(
      (key) =>
        ![
          "targetTableId",
          "cardinality",
          "inverseName",
          "description",
          "required",
        ].includes(key),
    ) ||
    value.required === true
  )
    fail(400, "Unsupported relationship settings; links are optional");
  if (typeof value.targetTableId !== "string" || !value.targetTableId)
    fail(400, "Choose a target table");
  const cardinality = value.cardinality ?? "many-to-one";
  if (!CARDINALITIES.includes(cardinality as Cardinality))
    fail(400, "Invalid relationship");
  if (
    value.inverseName !== undefined &&
    (typeof value.inverseName !== "string" ||
      !value.inverseName.trim() ||
      value.inverseName.length > 255)
  )
    fail(400, "Invalid reciprocal field name");
  return {
    targetTableId: value.targetTableId,
    cardinality: cardinality as Cardinality,
    inverseName: value.inverseName as string | undefined,
  };
}
export async function createRelation(
  tx: store.DataTableTx,
  organizationId: string,
  tableId: string,
  input: { name: string; options?: unknown; position?: number },
  userId?: string,
  legacy?: Field,
) {
  const options = creationOptions(input.options);
  await authorize(
    tx,
    organizationId,
    [tableId, options.targetTableId],
    userId,
    "edit",
    !legacy,
  );
  const [source] = await tx
    .select()
    .from(dataTableTable)
    .where(eq(dataTableTable.id, tableId));
  const fields = await tx
    .select()
    .from(dataTableFieldTable)
    .where(
      inArray(dataTableFieldTable.tableId, [
        ...new Set([tableId, options.targetTableId]),
      ]),
    )
    .orderBy(asc(dataTableFieldTable.position), asc(dataTableFieldTable.id));
  if (
    !legacy &&
    [tableId, options.targetTableId].some(
      (id) =>
        !fields.some(
          (field) =>
            field.tableId === id && !field.deletedAt && field.type !== "link",
        ),
    )
  )
    fail(400, "Create a primary value field before a relationship");
  const names = new Set(
    fields
      .filter((field) => field.tableId === options.targetTableId)
      .map((field) => field.name),
  );
  const baseName =
    options.inverseName?.trim() || source?.name || "Related records";
  let inverseName = baseName;
  for (
    let suffix = 2;
    names.has(inverseName) ||
    (tableId === options.targetTableId && inverseName === input.name);
    suffix++
  )
    inverseName = `${baseName} (${suffix})`;
  const relationId = createId();
  const sourceFieldId = legacy?.id ?? createId();
  const targetFieldId = createId();
  const [sourceMax, targetMax] = maxima(options.cardinality);
  const sourceOptions = {
    relationId,
    side: "source",
    targetTableId: options.targetTableId,
    inverseFieldId: targetFieldId,
    localMax: sourceMax,
    inverseMax: targetMax,
    ...(legacy ? { legacyColumn: true } : {}),
  };
  const position = (id: string) =>
    Math.max(
      -1,
      ...fields
        .filter((field) => field.tableId === id)
        .map((field) => field.position),
    ) + 1;
  const [field] = legacy
    ? await tx
        .update(dataTableFieldTable)
        .set({ options: sourceOptions })
        .where(eq(dataTableFieldTable.id, sourceFieldId))
        .returning()
    : await tx
        .insert(dataTableFieldTable)
        .values({
          id: sourceFieldId,
          tableId,
          type: "link",
          name: input.name,
          options: sourceOptions,
          position: input.position ?? position(tableId),
        })
        .returning();
  const [inverseField] = await tx
    .insert(dataTableFieldTable)
    .values({
      id: targetFieldId,
      tableId: options.targetTableId,
      type: "link",
      name: inverseName,
      position:
        position(options.targetTableId) +
        (tableId === options.targetTableId ? 1 : 0),
      options: {
        relationId,
        side: "target",
        targetTableId: tableId,
        inverseFieldId: sourceFieldId,
        localMax: targetMax,
        inverseMax: sourceMax,
      },
    })
    .returning();
  const [relation] = await tx
    .insert(dataTableRelationTable)
    .values({
      id: relationId,
      organizationId,
      sourceTableId: tableId,
      targetTableId: options.targetTableId,
      sourceFieldId,
      targetFieldId,
      sourceMax,
      targetMax,
    })
    .returning();
  if (!field || !inverseField || !relation)
    throw new Error("Relationship creation failed");
  await createJunction(tx, relation);
  for (const created of [field, inverseField])
    await tx.insert(dataTableActivityTable).values({
      tableId: created.tableId,
      userId,
      type: "field_created",
      fieldId: created.id,
      data: { name: created.name, field: created, afterField: created },
    });
  return { ...field, relation, inverseField };
}
export function ids(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.some((id) => typeof id !== "string" || !id) ||
    value.length > 100
  )
    fail(400, "Use an array of at most 100 linked records");
  return [...new Set(value as string[])];
}
export async function retainedIds(
  executor: Executor,
  relation: Relation,
  fieldId: string,
  rowId: string,
) {
  const side = endpoint(relation, fieldId);
  const result = await executor.execute(
    sql`SELECT ${sql.identifier(side.opposite)} AS id FROM ${junctionRef(relation.id)} WHERE ${sql.identifier(side.local)} = ${rowId} ORDER BY position, ${sql.identifier(side.opposite)}`,
  );
  return result.rows.map((row) => row.id as string);
}
export const version = (relation: Relation, values: string[]) =>
  createHash("sha256")
    .update(
      JSON.stringify([
        relation.id,
        relation.sourceMax,
        relation.targetMax,
        relation.updatedAt,
        values,
      ]),
    )
    .digest("hex");
export async function edgeActivity(
  tx: store.DataTableTx,
  relation: Relation,
  sourceRowId: string,
  targetRowId: string,
  type: "link_added" | "link_removed",
  userId?: string,
  cause = "user",
) {
  const mutationId = createId();
  for (const [fieldId, rowId, oppositeRowId] of [
    [relation.sourceFieldId, sourceRowId, targetRowId],
    [relation.targetFieldId, targetRowId, sourceRowId],
  ]) {
    if (!fieldId || !rowId || !oppositeRowId)
      throw new Error("Invalid edge event");
    const side = endpoint(relation, fieldId);
    const [record] = await labels(tx, side.targetTableId, [oppositeRowId]);
    await tx.insert(dataTableActivityTable).values({
      tableId: side.tableId,
      fieldId,
      rowId,
      userId,
      type,
      data: {
        mutationId,
        relationId: relation.id,
        side: side.side,
        targetTableId: side.targetTableId,
        inverseFieldId: side.inverseFieldId,
        oppositeRowId,
        label: record?.label ?? "Untitled record",
        cause,
      },
    });
  }
}
export async function writeLinks(
  tx: store.DataTableTx,
  organizationId: string,
  tableId: string,
  fieldId: string,
  rowId: string,
  input: {
    value?: unknown;
    add?: unknown;
    remove?: unknown;
    ifVersion?: string;
  },
  userId?: string,
  creating = false,
) {
  const relation = await relationFor(tx, organizationId, tableId, fieldId);
  const side = endpoint(relation, fieldId);
  await authorize(
    tx,
    organizationId,
    [tableId, side.targetTableId],
    userId,
    "edit",
  );
  const row = await tx.execute(
    sql`SELECT id FROM ${rowRef(tableId)} WHERE id = ${rowId} AND deleted_at IS NULL`,
  );
  if (!row.rows.length) fail(404, "Record not found");
  const current = await retainedIds(tx, relation, fieldId, rowId);
  const replacement = input.value !== undefined;
  if (replacement && !creating && !input.ifVersion)
    fail(428, "Refresh the relationship before replacing its records");
  if (input.ifVersion && input.ifVersion !== version(relation, current))
    fail(409, "This relationship changed. Refresh and try again");
  const remove = replacement
    ? current.filter((id) => !ids(input.value).includes(id))
    : ids(input.remove ?? []);
  const add = replacement
    ? ids(input.value).filter((id) => !current.includes(id))
    : ids(input.add ?? []).filter((id) => !current.includes(id));
  if (add.some((id) => remove.includes(id)))
    fail(400, "Cannot add and remove the same record");
  const next = [...current.filter((id) => !remove.includes(id)), ...add];
  if (side.localMax === "one" && next.length > 1)
    fail(409, "This relationship allows only one linked record");
  if (
    !creating &&
    side.localMax === "one" &&
    current.length &&
    add.length &&
    !input.ifVersion
  )
    fail(428, "Refresh the relationship before replacing its record");
  for (const id of add) {
    if (tableId === side.targetTableId && id === rowId)
      fail(400, "A record cannot link to itself");
    const target = await tx.execute(
      sql`SELECT id FROM ${rowRef(side.targetTableId)} WHERE id = ${id} AND deleted_at IS NULL`,
    );
    if (!target.rows.length) fail(400, "Linked record is unavailable");
    if (side.inverseMax === "one") {
      const occupied = await tx.execute(
        sql`SELECT 1 FROM ${junctionRef(relation.id)} WHERE ${sql.identifier(side.opposite)} = ${id} AND ${sql.identifier(side.local)} <> ${rowId}`,
      );
      if (occupied.rows.length)
        fail(
          409,
          "That record already belongs to another record. Unlink it there first",
        );
    }
  }
  for (const id of remove) {
    const deleted = await tx.execute(
      sql`DELETE FROM ${junctionRef(relation.id)} WHERE ${sql.identifier(side.local)} = ${rowId} AND ${sql.identifier(side.opposite)} = ${id} RETURNING source_row_id, target_row_id`,
    );
    for (const edge of deleted.rows)
      await edgeActivity(
        tx,
        relation,
        edge.source_row_id as string,
        edge.target_row_id as string,
        "link_removed",
        userId,
      );
  }
  for (const id of add) {
    const source = side.side === "source" ? rowId : id;
    const target = side.side === "source" ? id : rowId;
    const inserted = await tx.execute(
      sql`INSERT INTO ${junctionRef(relation.id)} (source_row_id, target_row_id) VALUES (${source}, ${target}) ON CONFLICT (source_row_id, target_row_id) DO NOTHING RETURNING source_row_id`,
    );
    if (inserted.rows.length)
      await edgeActivity(tx, relation, source, target, "link_added", userId);
  }
  await tx.execute(
    sql`UPDATE ${rowRef(tableId)} SET updated_at = now(), updated_by = ${userId ?? null} WHERE id = ${rowId}`,
  );
}
export async function targetFields(executor: Executor, tableId: string) {
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
  return fields.flatMap((field) =>
    isFieldType(field.type) ? [{ ...field, type: field.type }] : [],
  );
}
export async function labels(
  executor: Executor,
  tableId: string,
  rowIds: string[],
) {
  if (!rowIds.length) return [];
  const fields = await targetFields(executor, tableId);
  const primary = fields[0];
  const value =
    primary && !["link", "ticket", "json"].includes(primary.type)
      ? sql.identifier(store.column(primary.id))
      : sql`NULL`;
  const result = await executor.execute(
    sql`SELECT id, deleted_at, ${value} AS value FROM ${rowRef(tableId)} WHERE id IN (${sql.join(
      rowIds.map((id) => sql`${id}`),
      sql`, `,
    )})`,
  );
  const users =
    primary?.type === "user"
      ? await executor
          .select({ id: userTable.id, name: userTable.name })
          .from(userTable)
          .where(
            inArray(
              userTable.id,
              result.rows.flatMap((row) =>
                typeof row.value === "string" ? [row.value] : [],
              ),
            ),
          )
      : [];
  return result.rows.map((row) => {
    let label = row.value;
    if (primary?.type === "select" || primary?.type === "multiselect") {
      const choices = primary.options?.choices;
      label = Array.isArray(choices)
        ? (Array.isArray(label) ? label : [label])
            .flatMap((id) =>
              choices
                .filter((choice) => choice.id === id)
                .map((choice) => choice.label),
            )
            .join(", ")
        : "";
    }
    if (primary?.type === "user")
      label = users.find((user) => user.id === row.value)?.name;
    if (label instanceof Date) label = label.toISOString();
    return {
      id: row.id as string,
      label: row.deleted_at
        ? "Deleted record"
        : label == null || label === "" || typeof label === "object"
          ? "Untitled record"
          : String(label),
      deleted: Boolean(row.deleted_at),
    };
  });
}
export async function project(
  executor: Executor,
  organizationId: string,
  tableId: string,
  fields: store.StoreField[],
  rows: store.TableRow[],
  userId?: string,
  preview = 3,
) {
  for (const field of fields.filter((field) => field.type === "link")) {
    let relation: Relation | undefined;
    if (isRelation(field))
      relation = await relationFor(
        executor,
        organizationId,
        tableId,
        field.id,
        true,
      );
    const opposite = relation
      ? endpoint(relation, field.id).targetTableId
      : undefined;
    const [table] = opposite
      ? await executor
          .select()
          .from(dataTableTable)
          .where(
            and(
              eq(dataTableTable.id, opposite),
              eq(dataTableTable.organizationId, organizationId),
            ),
          )
      : [];
    const accessible =
      table &&
      !table.deletedAt &&
      !relation?.deletedAt &&
      (await allowed(organizationId, table.id, userId, "view"));
    const refs = accessible
      ? await labels(executor, table.id, [
          ...new Set(
            rows.flatMap((row) =>
              Array.isArray(row.values[field.id])
                ? (row.values[field.id] as string[])
                : [],
            ),
          ),
        ])
      : [];
    const byId = new Map(refs.map((ref) => [ref.id, ref]));
    for (const row of rows) {
      const retained = Array.isArray(row.values[field.id])
        ? (row.values[field.id] as string[])
        : [];
      const records = retained.flatMap((id) => {
        const ref = byId.get(id);
        return ref && !ref.deleted ? [ref] : [];
      });
      row.values[field.id] =
        accessible && relation
          ? {
              kind: "link",
              status: "ok",
              records: records.slice(0, preview),
              total: records.length,
              hasMore: records.length > preview,
              searchText: records.map((record) => record.label).join(" "),
              version: version(relation, retained),
            }
          : {
              kind: "link",
              status: "unavailable",
              records: [],
              total: null,
              hasMore: false,
              version: null,
            };
      if (row.rawValues) delete row.rawValues[field.id];
    }
    if (!accessible) field.options = { unavailable: true };
  }
  // Lookup fields resolve through their link field's relation: without view
  // access to the TARGET table the resolved values must not ship.
  for (const field of fields.filter((f) => f.type === "lookup")) {
    const linkField = fields.find((f) => f.id === field.options?.linkFieldId);
    const targetTableId = linkField?.options?.targetTableId;
    const accessible =
      linkField?.type === "link" &&
      typeof targetTableId === "string" &&
      (await allowed(organizationId, targetTableId, userId, "view"));
    if (accessible) continue;
    for (const row of rows) {
      row.values[field.id] = { kind: "lookup", status: "unavailable" };
      if (row.rawValues) delete row.rawValues[field.id];
    }
    field.options = { unavailable: true };
  }
  return rows;
}
/** Recursively redact exact archives at delivery; unresolved historical dependencies fail closed. */
export async function redactHistory(
  executor: Executor,
  organizationId: string,
  value: unknown,
  userId?: string,
  linkFields?: Set<string>,
): Promise<unknown> {
  if (!linkFields) {
    const retained =
      await executor.execute(sql`SELECT f.id FROM data_table_field f JOIN data_table t ON t.id = f.table_id WHERE t.organization_id = ${organizationId} AND f.type = 'link'
      UNION SELECT a.field_id AS id FROM data_table_activity a JOIN data_table t ON t.id = a.table_id WHERE t.organization_id = ${organizationId} AND (a.data->'field'->>'type' = 'link' OR a.data->>'fieldType' = 'link')`);
    return redactHistory(
      executor,
      organizationId,
      value,
      userId,
      new Set(retained.rows.map((row) => String(row.id))),
    );
  }
  if (Array.isArray(value))
    return Promise.all(
      value.map((item) =>
        redactHistory(executor, organizationId, item, userId, linkFields),
      ),
    );
  if (!value || typeof value !== "object" || value instanceof Date)
    return value;
  const obj = value as Record<string, unknown>;
  // History may contain relation ids buried in field definitions or values maps.
  // Until the exact archive supports dependency-aware restores, omit relation-containing payloads entirely.
  if (
    typeof obj.relationId === "string" &&
    typeof obj.targetTableId === "string" &&
    typeof obj.label === "string"
  ) {
    const visible = await allowed(
      organizationId,
      obj.targetTableId,
      userId,
      "view",
    );
    return visible ? obj : { redacted: true, restorable: false };
  }
  const encoded = JSON.stringify(obj);
  if (
    encoded.includes('"relationId"') ||
    encoded.includes('"type":"link"') ||
    encoded.includes('"fieldType":"link"')
  )
    return {
      redacted: true,
      restorable: false,
      message: "Relationship history requires live endpoint access",
    };
  return Object.fromEntries(
    await Promise.all(
      Object.entries(obj).map(async ([key, item]) => [
        key,
        linkFields?.has(key)
          ? { kind: "link", status: "unavailable", redacted: true }
          : await redactHistory(
              executor,
              organizationId,
              item,
              userId,
              linkFields,
            ),
      ]),
    ),
  );
}
