import { Hono } from "hono";
import { validator } from "hono-openapi";
import * as v from "valibot";
import { organizationAccess } from "../utils/organization-access-middleware";
import { requireOrganizationPermission } from "../utils/require-organization-permission";
import {
  addRow,
  addTextField,
  createDataTable,
  deleteDataTable,
  deleteRow,
  deleteTextField,
  getDataTable,
  listDataTables,
  updateCell,
  updateDataTable,
  updateTextField,
} from "./controllers";
import { assertTablesEnabled } from "./require-tables-enabled";

const idParams = v.object({ organizationId: v.string(), tableId: v.string() });
const writePermission = requireOrganizationPermission({
  organization: ["update"],
});
const nonEmptyName = v.pipe(v.string(), v.trim(), v.minLength(1));

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
    async (c) =>
      c.json(await listDataTables(c.req.valid("param").organizationId)),
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
    "/organization/:organizationId/:tableId",
    validator("param", idParams),
    organizationAccess.fromParam("organizationId"),
    async (c) => {
      const { organizationId, tableId } = c.req.valid("param");
      return c.json(await getDataTable(organizationId, tableId));
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
    writePermission,
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
    writePermission,
    async (c) => {
      const { organizationId, tableId } = c.req.valid("param");
      return c.json(await deleteDataTable(organizationId, tableId));
    },
  )
  .post(
    "/organization/:organizationId/:tableId/fields",
    validator("param", idParams),
    validator(
      "json",
      v.object({ name: nonEmptyName, position: v.optional(v.number()) }),
    ),
    organizationAccess.fromParam("organizationId"),
    writePermission,
    async (c) => {
      const { organizationId, tableId } = c.req.valid("param");
      return c.json(
        await addTextField(organizationId, tableId, c.req.valid("json")),
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
        position: v.optional(v.number()),
      }),
    ),
    organizationAccess.fromParam("organizationId"),
    writePermission,
    async (c) => {
      const { organizationId, tableId, fieldId } = c.req.valid("param");
      return c.json(
        await updateTextField(
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
    writePermission,
    async (c) => {
      const { organizationId, tableId, fieldId } = c.req.valid("param");
      return c.json(await deleteTextField(organizationId, tableId, fieldId));
    },
  )
  .post(
    "/organization/:organizationId/:tableId/rows",
    validator("param", idParams),
    validator("json", v.object({ position: v.optional(v.number()) })),
    organizationAccess.fromParam("organizationId"),
    writePermission,
    async (c) => {
      const { organizationId, tableId } = c.req.valid("param");
      return c.json(
        await addRow(organizationId, tableId, c.req.valid("json").position),
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
    writePermission,
    async (c) => {
      const { organizationId, tableId, rowId } = c.req.valid("param");
      return c.json(await deleteRow(organizationId, tableId, rowId));
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
    validator("json", v.object({ value: v.nullable(v.string()) })),
    organizationAccess.fromParam("organizationId"),
    writePermission,
    async (c) => {
      const { organizationId, tableId, rowId, fieldId } = c.req.valid("param");
      return c.json(
        await updateCell(
          organizationId,
          tableId,
          rowId,
          fieldId,
          c.req.valid("json").value,
        ),
      );
    },
  );

export default dataTable;
