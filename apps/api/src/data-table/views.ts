import { and, asc, eq, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import * as v from "valibot";
import db from "../database";
import {
  dataTableFieldTable,
  dataTableTable,
  dataTableViewTable,
} from "../database/schema";

// Filters deliberately have no view-owned schema: the row-query boundary owns
// their interpretation. Round-trip any JSON shape, including nested groups.
const jsonDocument = v.pipe(
  v.unknown(),
  v.check((value) => {
    try {
      const text = JSON.stringify(value);
      return (
        text !== undefined &&
        Buffer.byteLength(text, "utf8") <= 65536 &&
        JSON.stringify(JSON.parse(text)) === text
      );
    } catch {
      return false;
    }
  }, "Expected a JSON document of at most 64 KiB"),
);
const ids = v.pipe(
  v.array(v.pipe(v.string(), v.maxLength(128))),
  v.maxLength(1000),
);
export const viewConfigSchema = v.strictObject({
  filters: jsonDocument,
  sort: v.nullable(
    v.object({ fieldId: v.string(), dir: v.picklist(["asc", "desc"]) }),
  ),
  groupFieldId: v.nullable(v.string()),
  hiddenFields: ids,
  fieldOrder: ids,
  columnWidths: v.record(
    v.string(),
    v.pipe(v.number(), v.integer(), v.minValue(80), v.maxValue(800)),
  ),
  rowHeight: v.picklist(["compact", "comfortable", "tall", "extra"]),
  frozenColumns: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(0),
    v.maxValue(1000),
  ),
  summaries: v.record(
    v.string(),
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
  showSystemFields: v.boolean(),
});
export type ViewConfig = v.InferOutput<typeof viewConfigSchema>;
export const viewNameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(100),
);
export const createViewSchema = v.strictObject({
  name: viewNameSchema,
  config: v.optional(viewConfigSchema),
  duplicateFrom: v.optional(v.string()),
});
export const updateViewSchema = v.strictObject({
  name: v.optional(viewNameSchema),
  config: v.optional(viewConfigSchema),
  // Compare-and-set makes carry-over one-time even across concurrent browsers.
  initializeOnly: v.optional(v.boolean()),
});
const emptyConfig: ViewConfig = {
  filters: [],
  sort: null,
  groupFieldId: null,
  hiddenFields: [],
  fieldOrder: [],
  columnWidths: {},
  rowHeight: "compact",
  frozenColumns: 0,
  summaries: {},
  showSystemFields: false,
};
const missing = () =>
  new HTTPException(404, { message: "Table view not found" });
const scope = (organizationId: string, tableId: string) =>
  and(
    eq(dataTableViewTable.organizationId, organizationId),
    eq(dataTableViewTable.tableId, tableId),
  );

// Lock the parent, not the view: concurrent deletes/duplicates serialize on the
// same table, including requests that name different views.
async function lockedTable(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
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
  if (!table) throw missing();
  if (table.deletedAt)
    throw new HTTPException(400, {
      message: "Restore the table before editing views",
    });
}
async function validateFields(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  tableId: string,
  config: ViewConfig,
) {
  const fields = await tx
    .select({ id: dataTableFieldTable.id })
    .from(dataTableFieldTable)
    .where(
      and(
        eq(dataTableFieldTable.tableId, tableId),
        isNull(dataTableFieldTable.deletedAt),
      ),
    );
  const allowed = new Set([
    ...fields.map((f) => f.id),
    "__row_id",
    "__created_at",
    "__updated_at",
    "__created_by",
    "__updated_by",
  ]);
  const refs = [
    ...config.hiddenFields,
    ...config.fieldOrder,
    ...Object.keys(config.columnWidths),
    ...Object.keys(config.summaries),
    ...(config.sort ? [config.sort.fieldId] : []),
    ...(config.groupFieldId ? [config.groupFieldId] : []),
  ];
  if (refs.some((id) => !allowed.has(id)))
    throw new HTTPException(400, {
      message: "View fields must belong to this table",
    });
  if (Buffer.byteLength(JSON.stringify(config), "utf8") > 131072)
    throw new HTTPException(400, {
      message: "View configuration exceeds 128 KiB",
    });
}
export async function listViews(organizationId: string, tableId: string) {
  const [table] = await db
    .select({ id: dataTableTable.id })
    .from(dataTableTable)
    .where(
      and(
        eq(dataTableTable.id, tableId),
        eq(dataTableTable.organizationId, organizationId),
      ),
    );
  if (!table) throw missing();
  return db
    .select()
    .from(dataTableViewTable)
    .where(scope(organizationId, tableId))
    .orderBy(asc(dataTableViewTable.createdAt), asc(dataTableViewTable.id));
}
export async function createView(
  organizationId: string,
  tableId: string,
  input: v.InferOutput<typeof createViewSchema>,
) {
  return db.transaction(async (tx) => {
    await lockedTable(tx, organizationId, tableId);
    let config = input.config ?? emptyConfig;
    if (input.duplicateFrom) {
      const [source] = await tx
        .select()
        .from(dataTableViewTable)
        .where(
          and(
            scope(organizationId, tableId),
            eq(dataTableViewTable.id, input.duplicateFrom),
          ),
        );
      if (!source) throw missing();
      config = source.config ?? emptyConfig;
    }
    await validateFields(tx, tableId, config);
    const [created] = await tx
      .insert(dataTableViewTable)
      .values({
        organizationId,
        tableId,
        name: input.name,
        config,
        isDefault: false,
      })
      .returning();
    return created;
  });
}
export async function updateView(
  organizationId: string,
  tableId: string,
  viewId: string,
  input: v.InferOutput<typeof updateViewSchema>,
) {
  return db.transaction(async (tx) => {
    await lockedTable(tx, organizationId, tableId);
    const where = and(
      scope(organizationId, tableId),
      eq(dataTableViewTable.id, viewId),
    );
    const [current] = await tx.select().from(dataTableViewTable).where(where);
    if (!current) throw missing();
    if (input.initializeOnly && current.config !== null) return current;
    if (input.config) await validateFields(tx, tableId, input.config);
    const [updated] = await tx
      .update(dataTableViewTable)
      .set({
        name: input.name ?? current.name,
        config: input.config ?? current.config,
        updatedAt: new Date(),
      })
      .where(where)
      .returning();
    return updated;
  });
}
export async function deleteView(
  organizationId: string,
  tableId: string,
  viewId: string,
) {
  return db.transaction(async (tx) => {
    await lockedTable(tx, organizationId, tableId);
    const views = await tx
      .select()
      .from(dataTableViewTable)
      .where(scope(organizationId, tableId))
      .orderBy(asc(dataTableViewTable.createdAt), asc(dataTableViewTable.id));
    const target = views.find((view) => view.id === viewId);
    if (!target) throw missing();
    if (views.length === 1)
      throw new HTTPException(400, { message: "Cannot delete the last view" });
    await tx
      .delete(dataTableViewTable)
      .where(
        and(scope(organizationId, tableId), eq(dataTableViewTable.id, viewId)),
      );
    if (target.isDefault)
      await tx
        .update(dataTableViewTable)
        .set({ isDefault: true })
        .where(
          eq(
            dataTableViewTable.id,
            views.find((view) => view.id !== viewId)!.id,
          ),
        );
    return { success: true };
  });
}
