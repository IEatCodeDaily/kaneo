import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono-openapi";
import * as v from "valibot";
import {
  listAccessibleResourceIds,
  type ResourcePrivilege,
  requireResourcePrivilege,
} from "../resource-access";
import { organizationAccess } from "../utils/organization-access-middleware";
import { requireOrganizationPermission } from "../utils/require-organization-permission";
import {
  addFieldToTable,
  addTableRow,
  createDashboard,
  createDataTable,
  deleteDashboard,
  deleteTableField,
  deleteTableRow,
  getDashboard,
  getDataTable,
  getRowTickets,
  linkRowToTask,
  listDashboards,
  listDataTables,
  listRowsForTask,
  purgeDataTable,
  queryDataTable,
  restoreDataTable,
  softDeleteDataTable,
  unlinkRowTask,
  updateDashboard,
  updateDataTable,
  updateTableCell,
  updateTableField,
} from "./controllers";
import { FIELD_TYPES } from "./fields";
import { assertTablesEnabled } from "./require-tables-enabled";

const idParams = v.object({ organizationId: v.string(), tableId: v.string() });
const writePermission = requireOrganizationPermission({
  organization: ["update"],
});
const nonEmptyName = v.pipe(v.string(), v.trim(), v.minLength(1));

const metricSchema = v.object({
  agg: v.picklist(["count", "sum", "avg", "min", "max"]),
  fieldId: v.optional(v.string()),
});
const groupBySchema = v.object({
  fieldId: v.string(),
  bucket: v.optional(v.picklist(["day", "week", "month"])),
});
const filterSchema = v.object({
  fieldId: v.string(),
  op: v.picklist(["eq", "neq", "in", "lt", "lte", "gt", "gte", "isEmpty"]),
  value: v.optional(v.unknown()),
});
const querySpecSchema = v.object({
  metric: metricSchema,
  groupBy: v.optional(groupBySchema),
  // Caps keep generated SQL (and jsonb panels) bounded.
  filters: v.optional(v.pipe(v.array(filterSchema), v.maxLength(50))),
  limit: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(500)),
  ),
});

const panelSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  title: v.pipe(v.string(), v.minLength(1)),
  type: v.picklist(["stat", "bar", "line", "area", "pie", "table"]),
  span: v.picklist([6, 8, 9, 12, 15, 16, 24]),
  query: v.object({
    tableId: v.string(),
    metric: metricSchema,
    groupBy: v.optional(groupBySchema),
    filters: v.optional(v.pipe(v.array(filterSchema), v.maxLength(50))),
    limit: v.optional(
      v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(500)),
    ),
  }),
});

/**
 * Org-default visibility: tables are governed by the same resource-privilege
 * lattice as boards and repos. Reads need view, row/field/cell writes need
 * edit, and table lifecycle (rename/delete/purge/restore) needs manage. Table
 * creation stays on the organization role permission — there is no resource to
 * grade yet.
 */
function tablePrivilege(required: Exclude<ResourcePrivilege, "none">) {
  return createMiddleware<{ Variables: { userId: string } }>(
    async (c, next) => {
      const allowed = await requireResourcePrivilege({
        organizationId: c.req.param("organizationId") ?? "",
        resourceType: "table",
        resourceId: c.req.param("tableId") ?? "",
        userId: c.get("userId"),
        required,
      });
      if (!allowed) {
        // 404, not 403: a hidden table must not leak its existence.
        throw new HTTPException(404, { message: "Data table not found" });
      }
      await next();
    },
  );
}

const dataTable = new Hono<{ Variables: { userId: string } }>()
  .use("/organization/:organizationId", async (c, next) => {
    await assertTablesEnabled(c.req.param("organizationId"));
    await next();
  })
  .use("/organization/:organizationId/*", async (c, next) => {
    await assertTablesEnabled(c.req.param("organizationId"));
    await next();
  })
  .get(
    "/organization/:organizationId",
    validator("param", v.object({ organizationId: v.string() })),
    organizationAccess.fromParam("organizationId"),
    async (c) => {
      const { organizationId } = c.req.valid("param");
      const tables = await listDataTables(organizationId);
      const visibleIds = new Set(
        await listAccessibleResourceIds({
          organizationId,
          resourceType: "table",
          userId: c.get("userId"),
          resourceIds: tables.map((table) => table.id),
        }),
      );
      return c.json(tables.filter((table) => visibleIds.has(table.id)));
    },
  )
  .post(
    "/organization/:organizationId",
    validator("param", v.object({ organizationId: v.string() })),
    validator(
      "json",
      v.object({
        name: nonEmptyName,
        icon: v.optional(v.nullable(v.string())),
      }),
    ),
    organizationAccess.fromParam("organizationId"),
    writePermission,
    async (c) =>
      c.json(
        await createDataTable(
          c.req.valid("param").organizationId,
          c.req.valid("json"),
        ),
      ),
  )
  .get(
    "/organization/:organizationId/dashboards",
    validator("param", v.object({ organizationId: v.string() })),
    organizationAccess.fromParam("organizationId"),
    async (c) =>
      c.json(await listDashboards(c.req.valid("param").organizationId)),
  )
  .post(
    "/organization/:organizationId/dashboards",
    validator("param", v.object({ organizationId: v.string() })),
    validator("json", v.object({ name: nonEmptyName })),
    organizationAccess.fromParam("organizationId"),
    writePermission,
    async (c) => {
      const { organizationId } = c.req.valid("param");
      return c.json(await createDashboard(organizationId, c.req.valid("json")));
    },
  )
  .get(
    "/organization/:organizationId/dashboards/:dashboardId",
    validator(
      "param",
      v.object({ organizationId: v.string(), dashboardId: v.string() }),
    ),
    organizationAccess.fromParam("organizationId"),
    async (c) => {
      const { organizationId, dashboardId } = c.req.valid("param");
      return c.json(await getDashboard(organizationId, dashboardId));
    },
  )
  .put(
    "/organization/:organizationId/dashboards/:dashboardId",
    validator(
      "param",
      v.object({ organizationId: v.string(), dashboardId: v.string() }),
    ),
    validator(
      "json",
      v.object({
        name: v.optional(nonEmptyName),
        panels: v.optional(v.pipe(v.array(panelSchema), v.maxLength(100))),
      }),
    ),
    organizationAccess.fromParam("organizationId"),
    writePermission,
    async (c) => {
      const { organizationId, dashboardId } = c.req.valid("param");
      return c.json(
        await updateDashboard(organizationId, dashboardId, c.req.valid("json")),
      );
    },
  )
  .delete(
    "/organization/:organizationId/dashboards/:dashboardId",
    validator(
      "param",
      v.object({ organizationId: v.string(), dashboardId: v.string() }),
    ),
    organizationAccess.fromParam("organizationId"),
    writePermission,
    async (c) => {
      const { organizationId, dashboardId } = c.req.valid("param");
      return c.json(await deleteDashboard(organizationId, dashboardId));
    },
  )
  .get(
    "/organization/:organizationId/:tableId",
    validator("param", idParams),
    validator(
      "query",
      v.object({ offset: v.optional(v.pipe(v.string(), v.transform(Number))) }),
    ),
    organizationAccess.fromParam("organizationId"),
    tablePrivilege("view"),
    async (c) => {
      const { organizationId, tableId } = c.req.valid("param");
      const offset = c.req.valid("query").offset ?? 0;
      return c.json(
        await getDataTable(
          organizationId,
          tableId,
          Number.isFinite(offset) && offset > 0 ? offset : 0,
        ),
      );
    },
  )
  .put(
    "/organization/:organizationId/:tableId",
    validator("param", idParams),
    validator(
      "json",
      v.object({
        name: v.optional(nonEmptyName),
        icon: v.optional(v.nullable(v.string())),
      }),
    ),
    organizationAccess.fromParam("organizationId"),
    tablePrivilege("manage"),
    async (c) => {
      const { organizationId, tableId } = c.req.valid("param");
      return c.json(
        await updateDataTable(organizationId, tableId, c.req.valid("json")),
      );
    },
  )
  .delete(
    "/organization/:organizationId/:tableId",
    validator("param", idParams),
    organizationAccess.fromParam("organizationId"),
    tablePrivilege("manage"),
    async (c) => {
      const { organizationId, tableId } = c.req.valid("param");
      return c.json(await softDeleteDataTable(organizationId, tableId));
    },
  )
  .post(
    "/organization/:organizationId/:tableId/purge",
    validator("param", idParams),
    organizationAccess.fromParam("organizationId"),
    tablePrivilege("manage"),
    async (c) => {
      const { organizationId, tableId } = c.req.valid("param");
      return c.json(await purgeDataTable(organizationId, tableId));
    },
  )
  .post(
    "/organization/:organizationId/:tableId/restore",
    validator("param", idParams),
    organizationAccess.fromParam("organizationId"),
    tablePrivilege("manage"),
    async (c) => {
      const { organizationId, tableId } = c.req.valid("param");
      return c.json(await restoreDataTable(organizationId, tableId));
    },
  )
  .post(
    "/organization/:organizationId/:tableId/query",
    validator("param", idParams),
    validator("json", querySpecSchema),
    organizationAccess.fromParam("organizationId"),
    tablePrivilege("view"),
    async (c) => {
      const { organizationId, tableId } = c.req.valid("param");
      return c.json(
        await queryDataTable(organizationId, tableId, {
          ...c.req.valid("json"),
          limit: c.req.valid("json").limit ?? 200,
        }),
      );
    },
  )
  .post(
    "/organization/:organizationId/:tableId/fields",
    validator("param", idParams),
    validator(
      "json",
      v.object({
        name: nonEmptyName,
        type: v.picklist([...FIELD_TYPES]),
        options: v.optional(v.unknown()),
        position: v.optional(v.number()),
      }),
    ),
    organizationAccess.fromParam("organizationId"),
    tablePrivilege("edit"),
    async (c) => {
      const { organizationId, tableId } = c.req.valid("param");
      return c.json(
        await addFieldToTable(organizationId, tableId, c.req.valid("json")),
      );
    },
  )
  .put(
    "/organization/:organizationId/:tableId/fields/:fieldId",
    validator(
      "param",
      v.object({
        organizationId: v.string(),
        tableId: v.string(),
        fieldId: v.string(),
      }),
    ),
    validator(
      "json",
      v.object({
        name: v.optional(nonEmptyName),
        options: v.optional(v.unknown()),
        type: v.optional(v.picklist([...FIELD_TYPES])),
      }),
    ),
    organizationAccess.fromParam("organizationId"),
    tablePrivilege("edit"),
    async (c) => {
      const { organizationId, tableId, fieldId } = c.req.valid("param");
      return c.json(
        await updateTableField(
          organizationId,
          tableId,
          fieldId,
          c.req.valid("json"),
        ),
      );
    },
  )
  .delete(
    "/organization/:organizationId/:tableId/fields/:fieldId",
    validator(
      "param",
      v.object({
        organizationId: v.string(),
        tableId: v.string(),
        fieldId: v.string(),
      }),
    ),
    organizationAccess.fromParam("organizationId"),
    tablePrivilege("edit"),
    async (c) => {
      const { organizationId, tableId, fieldId } = c.req.valid("param");
      return c.json(await deleteTableField(organizationId, tableId, fieldId));
    },
  )
  .post(
    "/organization/:organizationId/:tableId/rows",
    validator("param", idParams),
    validator(
      "json",
      v.object({
        values: v.optional(v.record(v.string(), v.unknown())),
      }),
    ),
    organizationAccess.fromParam("organizationId"),
    tablePrivilege("edit"),
    async (c) => {
      const { organizationId, tableId } = c.req.valid("param");
      return c.json(
        await addTableRow(organizationId, tableId, c.req.valid("json").values),
      );
    },
  )
  .delete(
    "/organization/:organizationId/:tableId/rows/:rowId",
    validator(
      "param",
      v.object({
        organizationId: v.string(),
        tableId: v.string(),
        rowId: v.string(),
      }),
    ),
    organizationAccess.fromParam("organizationId"),
    tablePrivilege("edit"),
    async (c) => {
      const { organizationId, tableId, rowId } = c.req.valid("param");
      await deleteTableRow(organizationId, tableId, rowId);
      return c.json({ success: true });
    },
  )
  .put(
    "/organization/:organizationId/:tableId/rows/:rowId/cells/:fieldId",
    validator(
      "param",
      v.object({
        organizationId: v.string(),
        tableId: v.string(),
        rowId: v.string(),
        fieldId: v.string(),
      }),
    ),
    validator("json", v.object({ value: v.unknown() })),
    organizationAccess.fromParam("organizationId"),
    tablePrivilege("edit"),
    async (c) => {
      const { organizationId, tableId, rowId, fieldId } = c.req.valid("param");
      return c.json(
        await updateTableCell(
          organizationId,
          tableId,
          rowId,
          fieldId,
          c.req.valid("json").value,
        ),
      );
    },
  )
  .get(
    "/organization/:organizationId/:tableId/rows/:rowId/tickets",
    validator(
      "param",
      v.object({
        organizationId: v.string(),
        tableId: v.string(),
        rowId: v.string(),
      }),
    ),
    organizationAccess.fromParam("organizationId"),
    tablePrivilege("view"),
    async (c) => {
      const { rowId } = c.req.valid("param");
      return c.json(await getRowTickets(rowId));
    },
  )
  .post(
    "/organization/:organizationId/:tableId/rows/:rowId/tickets",
    validator(
      "param",
      v.object({
        organizationId: v.string(),
        tableId: v.string(),
        rowId: v.string(),
      }),
    ),
    validator("query", v.object({ taskId: v.string() })),
    organizationAccess.fromParam("organizationId"),
    tablePrivilege("edit"),
    async (c) => {
      const { organizationId, tableId, rowId } = c.req.valid("param");
      const { taskId } = c.req.valid("query");
      return c.json(
        await linkRowToTask(organizationId, tableId, rowId, taskId),
      );
    },
  )
  .delete(
    "/organization/:organizationId/:tableId/rows/:rowId/tickets",
    validator(
      "param",
      v.object({
        organizationId: v.string(),
        tableId: v.string(),
        rowId: v.string(),
      }),
    ),
    validator("query", v.object({ taskId: v.string() })),
    organizationAccess.fromParam("organizationId"),
    tablePrivilege("edit"),
    async (c) => {
      const { organizationId, tableId, rowId } = c.req.valid("param");
      const { taskId } = c.req.valid("query");
      return c.json(
        await unlinkRowTask(organizationId, tableId, rowId, taskId),
      );
    },
  )
  .get(
    "/organization/:organizationId/rows-for-ticket",
    validator("param", v.object({ organizationId: v.string() })),
    validator("query", v.object({ taskId: v.string() })),
    organizationAccess.fromTaskId("taskId"),
    async (c) => {
      const { organizationId } = c.req.valid("param");
      const { taskId } = c.req.valid("query");
      return c.json(await listRowsForTask(organizationId, taskId));
    },
  );

export default dataTable;
