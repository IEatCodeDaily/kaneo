import { and, asc, eq, isNull, max } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import * as v from "valibot";
import db from "../database";
import {
  type DashboardPanelSpec,
  dataTableDashboardTable,
  dataTableFieldTable,
  dataTableTable,
} from "../database/schema";
import { type FieldType, fieldOptionsSchema, isFieldType } from "./fields";
import type { StoreField } from "./store";
import * as store from "./store";

// Function declarations, not const arrows: TS only narrows flow after
// never-returning calls to declared functions (the guards below rely on it).
function notFound(resource: string): never {
  throw new HTTPException(404, { message: `${resource} not found` });
}

function badRequest(message: string): never {
  throw new HTTPException(400, { message });
}

async function requireTable(organizationId: string, tableId: string) {
  const [table] = await db
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

/** Trashed tables stay readable (restore banner) but not writable. */
function requireLive<T extends { deletedAt: Date | null }>(table: T): T {
  if (table.deletedAt !== null) {
    badRequest("Restore the table before editing it");
  }
  return table;
}

async function requireField(tableId: string, fieldId: string) {
  const [field] = await db
    .select()
    .from(dataTableFieldTable)
    .where(
      and(
        eq(dataTableFieldTable.id, fieldId),
        eq(dataTableFieldTable.tableId, tableId),
      ),
    )
    .limit(1);
  return field ?? notFound("Data table field");
}

/** Full field metadata rows (name, position, timestamps), known types only. */
async function listTableFieldRows(tableId: string) {
  const fields = await db
    .select()
    .from(dataTableFieldTable)
    .where(eq(dataTableFieldTable.tableId, tableId))
    .orderBy(asc(dataTableFieldTable.position));
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
) {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(dataTableTable)
      .values({ organizationId, name: values.name, icon: values.icon ?? null })
      .returning();
    if (!created) notFound("Created data table");
    await store.createTable(tx, created.id);
    return created;
  });
}

export async function getDataTable(
  organizationId: string,
  tableId: string,
  offset = 0,
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
  return { ...table, fields: fieldRows, rows, total };
}

export async function updateDataTable(
  organizationId: string,
  tableId: string,
  values: { name?: string; icon?: string | null },
) {
  const [updated] = await db
    .update(dataTableTable)
    .set({ ...values, updatedAt: new Date() })
    .where(
      and(
        eq(dataTableTable.id, tableId),
        eq(dataTableTable.organizationId, organizationId),
      ),
    )
    .returning();
  return updated ?? notFound("Data table");
}

export async function softDeleteDataTable(
  organizationId: string,
  tableId: string,
) {
  const [updated] = await db
    .update(dataTableTable)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(dataTableTable.id, tableId),
        eq(dataTableTable.organizationId, organizationId),
      ),
    )
    .returning();
  return updated ?? notFound("Data table");
}

export async function restoreDataTable(
  organizationId: string,
  tableId: string,
) {
  const [updated] = await db
    .update(dataTableTable)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(dataTableTable.id, tableId),
        eq(dataTableTable.organizationId, organizationId),
      ),
    )
    .returning();
  return updated ?? notFound("Data table");
}

/** Hard delete: drops the physical table and the metadata row atomically. */
export async function purgeDataTable(organizationId: string, tableId: string) {
  const table = await requireTable(organizationId, tableId);
  await db.transaction(async (tx) => {
    await store.dropTable(tx, table.id);
    await tx.delete(dataTableTable).where(eq(dataTableTable.id, table.id));
  });
  return { success: true as const };
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
) {
  requireLive(await requireTable(organizationId, tableId));
  const options = parseFieldOptions(values.type, values.options);
  let position = values.position;
  if (position === undefined) {
    const [result] = await db
      .select({ position: max(dataTableFieldTable.position) })
      .from(dataTableFieldTable)
      .where(eq(dataTableFieldTable.tableId, tableId));
    position = (result?.position ?? -1) + 1;
  }
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(dataTableFieldTable)
      .values({
        tableId,
        name: values.name,
        type: values.type,
        options,
        position,
      })
      .returning();
    if (!created) notFound("Created data table field");
    await store.addField(tx, {
      tableId,
      fieldId: created.id,
      type: values.type,
    });
    return created;
  });
}

export async function updateTableField(
  organizationId: string,
  tableId: string,
  fieldId: string,
  values: { name?: string; options?: unknown; type?: FieldType },
) {
  requireLive(await requireTable(organizationId, tableId));
  const field = await requireField(tableId, fieldId);
  if (!isFieldType(field.type)) {
    // Metadata written outside the registry would make the cast matrix unsound.
    badRequest("Field has an unknown type and cannot be migrated");
  }
  // Hoist the narrowed type: property narrowing does not survive into the
  // transaction callback below.
  const fromType: FieldType = field.type;
  const nextType =
    values.type && values.type !== fromType ? values.type : undefined;
  const options =
    values.options !== undefined
      ? parseFieldOptions(nextType ?? fromType, values.options)
      : undefined;

  return db.transaction(async (tx) => {
    if (nextType) {
      await store.changeFieldType(tx, {
        tableId,
        fieldId,
        from: fromType,
        to: nextType,
      });
    }
    const [updated] = await tx
      .update(dataTableFieldTable)
      .set({
        ...(values.name !== undefined ? { name: values.name } : {}),
        ...(options !== undefined ? { options } : {}),
        ...(nextType ? { type: nextType } : {}),
      })
      .where(eq(dataTableFieldTable.id, fieldId))
      .returning();
    return updated ?? notFound("Data table field");
  });
}

export async function deleteTableField(
  organizationId: string,
  tableId: string,
  fieldId: string,
) {
  requireLive(await requireTable(organizationId, tableId));
  const field = await requireField(tableId, fieldId);
  return db.transaction(async (tx) => {
    await store.dropField(tx, { tableId, fieldId: field.id });
    await tx
      .delete(dataTableFieldTable)
      .where(eq(dataTableFieldTable.id, field.id));
    return { success: true as const };
  });
}

export async function addTableRow(
  organizationId: string,
  tableId: string,
  values: Record<string, unknown> | undefined,
) {
  const table = requireLive(await requireTable(organizationId, tableId));
  const fields = await listTableFields(tableId);
  return store.insertRow(db, table.id, fields, values ?? {});
}

export async function updateTableCell(
  organizationId: string,
  tableId: string,
  rowId: string,
  fieldId: string,
  value: unknown,
) {
  requireLive(await requireTable(organizationId, tableId));
  const fields = await listTableFields(tableId);
  return store.updateCell(db, tableId, fields, rowId, fieldId, value);
}

export async function deleteTableRow(
  organizationId: string,
  tableId: string,
  rowId: string,
) {
  requireLive(await requireTable(organizationId, tableId));
  return store.deleteRow(db, tableId, rowId);
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
    .values({ organizationId, name: values.name })
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
