import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { reconcile } from "../../apps/api/src/data-table/store";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createBoardFixture,
  createOrganizationMember,
} from "./helpers/fixtures";

async function physicalTableName(tableId: string) {
  const result = await db.execute(
    sql`SELECT to_regclass(${`kaneo_tables.t_${tableId}`}) AS name`,
  );
  return result.rows[0]?.name as string | null;
}

async function physicalColumns(tableId: string) {
  const result = await db.execute(
    sql`SELECT column_name, data_type FROM information_schema.columns
        WHERE table_schema = 'kaneo_tables' AND table_name = ${`t_${tableId}`}
        ORDER BY column_name`,
  );
  return result.rows as { column_name: string; data_type: string }[];
}

async function physicalIndexes(tableId: string) {
  const result = await db.execute(
    sql`SELECT indexname FROM pg_indexes
        WHERE schemaname = 'kaneo_tables' AND tablename = ${`t_${tableId}`}`,
  );
  return result.rows.map((row) => row.indexname as string);
}

async function createTableViaApi(
  app: ReturnType<typeof createApp>["app"],
  organizationId: string,
  name: string,
) {
  const response = await app.request(
    `/api/data-table/organization/${organizationId}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    },
  );
  expect(response.status).toBe(200);
  return (await response.json()) as typeof schema.dataTableTable.$inferSelect;
}

type FieldRow = typeof schema.dataTableFieldTable.$inferSelect;

async function createFieldViaApi(
  app: ReturnType<typeof createApp>["app"],
  organizationId: string,
  tableId: string,
  payload: Record<string, unknown>,
) {
  const response = await app.request(
    `/api/data-table/organization/${organizationId}/${tableId}/fields`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  // Error bodies are plain text; only success responses are field JSON.
  const text = await response.text();
  const field = response.ok ? (JSON.parse(text) as FieldRow) : null;
  return { response, field };
}

async function addRowViaApi(
  app: ReturnType<typeof createApp>["app"],
  organizationId: string,
  tableId: string,
  values: Record<string, unknown> = {},
) {
  const response = await app.request(
    `/api/data-table/organization/${organizationId}/${tableId}/rows`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values }),
    },
  );
  expect(response.status).toBe(200);
  return (await response.json()) as {
    id: string;
    position: number;
    createdAt: string;
    updatedAt: string;
    values: Record<string, unknown>;
  };
}

describe("API integration: data tables (kaneo_tables engine)", () => {
  let member: Awaited<ReturnType<typeof createOrganizationMember>>;
  let app: ReturnType<typeof createApp>["app"];

  beforeEach(async () => {
    await resetTestDatabase();
    member = await createOrganizationMember({ role: "owner" });
    await db
      .update(schema.organizationTable)
      .set({ tablesEnabled: true })
      .where(eq(schema.organizationTable.id, member.organization.id));
    mockAuthenticatedSession(member.user);
    app = createApp().app;
  });

  describe("store engine", () => {
    it("creates a physical table with system columns and a DDL ledger entry", async () => {
      const table = await createTableViaApi(app, member.organization.id, "CRM");

      const columns = await physicalColumns(table.id);
      expect(columns.map((column) => column.column_name).sort()).toEqual([
        "created_at",
        "id",
        "position",
        "updated_at",
      ]);
      expect(columns.find((c) => c.column_name === "position")?.data_type).toBe(
        "double precision",
      );
      expect(
        columns.find((c) => c.column_name === "created_at")?.data_type,
      ).toBe("timestamp with time zone");

      const ledger = await db
        .select()
        .from(schema.dataTableDdlLogTable)
        .where(eq(schema.dataTableDdlLogTable.dataTableId, table.id));
      expect(ledger).toHaveLength(1);
      expect(ledger[0].statement).toContain("CREATE TABLE");
    });

    it("adds a typed column plus index for indexed field types", async () => {
      const table = await createTableViaApi(
        app,
        member.organization.id,
        "Tasks",
      );
      const { field } = await createFieldViaApi(
        app,
        member.organization.id,
        table.id,
        {
          name: "Status",
          type: "select",
          options: { choices: [{ id: "open", label: "Open" }] },
        },
      );

      const columns = await physicalColumns(table.id);
      expect(
        columns.find((c) => c.column_name === `c_${field.id}`)?.data_type,
      ).toBe("text");
      const indexes = await physicalIndexes(table.id);
      expect(indexes).toContain(`t_${table.id}_c_${field.id}_idx`);
    });

    it("casts valid text rows to numeric and nulls invalid ones on type change", async () => {
      const table = await createTableViaApi(
        app,
        member.organization.id,
        "Budget",
      );
      const { field } = await createFieldViaApi(
        app,
        member.organization.id,
        table.id,
        { name: "Amount", type: "text" },
      );
      const first = await addRowViaApi(app, member.organization.id, table.id, {
        [field.id]: "12.5",
      });
      const second = await addRowViaApi(app, member.organization.id, table.id, {
        [field.id]: "abc",
      });

      const update = await app.request(
        `/api/data-table/organization/${member.organization.id}/${table.id}/fields/${field.id}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "number" }),
        },
      );
      expect(update.status).toBe(200);

      const detail = await app.request(
        `/api/data-table/organization/${member.organization.id}/${table.id}`,
      );
      const payload = (await detail.json()) as {
        rows: { id: string; values: Record<string, unknown> }[];
      };
      const valuesById = new Map(
        payload.rows.map((row) => [row.id, row.values[field.id]]),
      );
      expect(valuesById.get(first.id)).toBe(12.5);
      expect(valuesById.get(second.id)).toBeNull();
    });

    it("drops a field column and its index", async () => {
      const table = await createTableViaApi(
        app,
        member.organization.id,
        "Drop",
      );
      const { field } = await createFieldViaApi(
        app,
        member.organization.id,
        table.id,
        { name: "Owner", type: "user" },
      );

      const remove = await app.request(
        `/api/data-table/organization/${member.organization.id}/${table.id}/fields/${field.id}`,
        { method: "DELETE" },
      );
      expect(remove.status).toBe(200);

      const columns = await physicalColumns(table.id);
      expect(
        columns.find((c) => c.column_name === `c_${field.id}`),
      ).toBeUndefined();
      const indexes = await physicalIndexes(table.id);
      expect(indexes).not.toContain(`t_${table.id}_c_${field.id}_idx`);
    });

    it("reconcile heals a physically dropped column", async () => {
      const table = await createTableViaApi(
        app,
        member.organization.id,
        "Heal",
      );
      const { field } = await createFieldViaApi(
        app,
        member.organization.id,
        table.id,
        { name: "Due", type: "date" },
      );
      await db.execute(
        sql.raw(
          `ALTER TABLE kaneo_tables."t_${table.id}" DROP COLUMN "c_${field.id}"`,
        ),
      );

      const reports = await reconcile();
      const report = reports.find((entry) => entry.tableId === table.id);
      expect(report?.addedColumns).toContain(`c_${field.id}`);

      const columns = await physicalColumns(table.id);
      expect(
        columns.find((c) => c.column_name === `c_${field.id}`)?.data_type,
      ).toBe("date");
    });

    it("purge drops the physical table and metadata; soft delete keeps it", async () => {
      const table = await createTableViaApi(
        app,
        member.organization.id,
        "Trash",
      );

      const softDelete = await app.request(
        `/api/data-table/organization/${member.organization.id}/${table.id}`,
        { method: "DELETE" },
      );
      expect(softDelete.status).toBe(200);
      expect(await physicalTableName(table.id)).toBe(
        `kaneo_tables.t_${table.id}`,
      );

      const list = await app.request(
        `/api/data-table/organization/${member.organization.id}`,
      );
      const tables = (await list.json()) as { id: string }[];
      expect(tables.find((entry) => entry.id === table.id)).toBeUndefined();

      // Deleted tables still resolve on detail so the client can offer restore.
      const detail = await app.request(
        `/api/data-table/organization/${member.organization.id}/${table.id}`,
      );
      expect(detail.status).toBe(200);
      const detailPayload = (await detail.json()) as {
        deletedAt: string | null;
      };
      expect(detailPayload.deletedAt).not.toBeNull();

      const restore = await app.request(
        `/api/data-table/organization/${member.organization.id}/${table.id}/restore`,
        { method: "POST" },
      );
      expect(restore.status).toBe(200);
      const restored = (await restore.json()) as { deletedAt: string | null };
      expect(restored.deletedAt).toBeNull();

      const purge = await app.request(
        `/api/data-table/organization/${member.organization.id}/${table.id}/purge`,
        { method: "POST" },
      );
      expect(purge.status).toBe(200);
      expect(await purge.json()).toEqual({ success: true });
      expect(await physicalTableName(table.id)).toBeNull();

      const purgedDetail = await app.request(
        `/api/data-table/organization/${member.organization.id}/${table.id}`,
      );
      expect(purgedDetail.status).toBe(404);
    });
  });

  describe("field + row routes", () => {
    it("rejects invalid field types and invalid options with 400", async () => {
      const table = await createTableViaApi(
        app,
        member.organization.id,
        "Validation",
      );

      const badType = await createFieldViaApi(
        app,
        member.organization.id,
        table.id,
        { name: "Nope", type: "bogus" },
      );
      expect(badType.response.status).toBe(400);

      const badOptions = await createFieldViaApi(
        app,
        member.organization.id,
        table.id,
        { name: "Status", type: "select", options: { choices: [] } },
      );
      expect(badOptions.response.status).toBe(400);

      const optionsOnPlainText = await createFieldViaApi(
        app,
        member.organization.id,
        table.id,
        { name: "Title", type: "text", options: { choices: [] } },
      );
      expect(optionsOnPlainText.response.status).toBe(400);
    });

    it("rejects values that cannot be coerced for the column type", async () => {
      const table = await createTableViaApi(
        app,
        member.organization.id,
        "Coerce",
      );
      const { field } = await createFieldViaApi(
        app,
        member.organization.id,
        table.id,
        { name: "Points", type: "number" },
      );
      const row = await addRowViaApi(app, member.organization.id, table.id);

      const bad = await app.request(
        `/api/data-table/organization/${member.organization.id}/${table.id}/rows/${row.id}/cells/${field.id}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ value: "abc" }),
        },
      );
      expect(bad.status).toBe(400);

      const good = await app.request(
        `/api/data-table/organization/${member.organization.id}/${table.id}/rows/${row.id}/cells/${field.id}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ value: 7 }),
        },
      );
      expect(good.status).toBe(200);
      const updated = (await good.json()) as {
        values: Record<string, unknown>;
      };
      expect(updated.values[field.id]).toBe(7);
    });

    it("rejects unknown field ids in row values with 400", async () => {
      const table = await createTableViaApi(
        app,
        member.organization.id,
        "Unknown",
      );
      const response = await app.request(
        `/api/data-table/organization/${member.organization.id}/${table.id}/rows`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ values: { not_a_field: 1 } }),
        },
      );
      expect(response.status).toBe(400);
    });

    it("creates rows with coerced values and returns them keyed by field id", async () => {
      const table = await createTableViaApi(
        app,
        member.organization.id,
        "Rows",
      );
      const amount = await createFieldViaApi(
        app,
        member.organization.id,
        table.id,
        { name: "Amount", type: "currency", options: { code: "usd" } },
      );
      const done = await createFieldViaApi(
        app,
        member.organization.id,
        table.id,
        { name: "Done", type: "checkbox" },
      );
      expect(amount.field.options).toMatchObject({ code: "USD" });

      const row = await addRowViaApi(app, member.organization.id, table.id, {
        [amount.field.id]: 42.5,
        [done.field.id]: true,
      });
      expect(row.values[amount.field.id]).toBe(42.5);
      expect(row.values[done.field.id]).toBe(true);
      expect(typeof row.position).toBe("number");

      const detail = await app.request(
        `/api/data-table/organization/${member.organization.id}/${table.id}`,
      );
      const payload = (await detail.json()) as {
        rows: unknown[];
        total: number;
        fields: { id: string; name: string; position: number }[];
      };
      expect(payload.total).toBe(1);
      expect(payload.rows).toHaveLength(1);
      // The client renders headers from these: name and position must ship.
      expect(
        payload.fields.map(({ name, position }) => ({ name, position })),
      ).toEqual([
        { name: "Amount", position: expect.any(Number) },
        { name: "Done", position: expect.any(Number) },
      ]);
    });
  });

  describe("ticket field", () => {
    async function seedTask(organizationId: string, title: string) {
      const { board, columns } = await createBoardFixture({
        organizationId,
        slug: "kfl",
      });
      const [task] = await db
        .insert(schema.taskTable)
        .values({
          boardId: board.id,
          columnId: columns.todo.id,
          title,
          status: "to-do",
          priority: "medium",
          number: 7,
          position: 1,
        })
        .returning();
      return task;
    }

    it("links same-org tickets, rejects foreign ones, and ships the lookup", async () => {
      const table = await createTableViaApi(app, member.organization.id, "Ops");
      const { field } = await createFieldViaApi(
        app,
        member.organization.id,
        table.id,
        { name: "Tickets", type: "ticket" },
      );
      expect(field?.type).toBe("ticket");
      const own = await seedTask(member.organization.id, "Fix the pump");
      const other = await createOrganizationMember();
      const foreign = await seedTask(other.organization.id, "Not yours");

      const row = await addRowViaApi(app, member.organization.id, table.id);
      const cellPath = (rowId: string) =>
        `/api/data-table/organization/${member.organization.id}/${table.id}/rows/${rowId}/cells/${field?.id}`;
      const put = (rowId: string, value: unknown) =>
        app.request(cellPath(rowId), {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ value }),
        });

      // A ticket from another organization must never be linkable.
      expect((await put(row.id, [foreign.id])).status).toBe(400);
      expect((await put(row.id, ["not-a-task"])).status).toBe(400);

      const ok = await put(row.id, [own.id]);
      expect(ok.status).toBe(200);
      const written = (await ok.json()) as {
        tickets: Record<string, { key: string; title: string }>;
      };
      expect(written.tickets[own.id]).toMatchObject({
        key: "KFL-7",
        title: "Fix the pump",
      });

      const detail = await app.request(
        `/api/data-table/organization/${member.organization.id}/${table.id}`,
      );
      const body = (await detail.json()) as {
        rows: { values: Record<string, unknown> }[];
        tickets: Record<string, { key: string }>;
      };
      expect(body.rows[0].values[field?.id ?? ""]).toEqual([own.id]);
      expect(body.tickets[own.id]?.key).toBe("KFL-7");
      expect(body.tickets[foreign.id]).toBeUndefined();
    });
  });

  describe("query endpoint", () => {
    async function seedQueryTable() {
      const table = await createTableViaApi(
        app,
        member.organization.id,
        "Deals",
      );
      const status = await createFieldViaApi(
        app,
        member.organization.id,
        table.id,
        {
          name: "Status",
          type: "select",
          options: {
            choices: [
              { id: "won", label: "Won" },
              { id: "lost", label: "Lost" },
            ],
          },
        },
      );
      const amount = await createFieldViaApi(
        app,
        member.organization.id,
        table.id,
        { name: "Amount", type: "number" },
      );
      const closed = await createFieldViaApi(
        app,
        member.organization.id,
        table.id,
        { name: "Closed", type: "date" },
      );
      await addRowViaApi(app, member.organization.id, table.id, {
        [status.field.id]: "won",
        [amount.field.id]: 10,
        [closed.field.id]: "2026-01-05",
      });
      await addRowViaApi(app, member.organization.id, table.id, {
        [status.field.id]: "won",
        [amount.field.id]: 2.5,
        [closed.field.id]: "2026-01-05",
      });
      await addRowViaApi(app, member.organization.id, table.id, {
        [status.field.id]: "lost",
        [amount.field.id]: 99,
        [closed.field.id]: "2026-02-01",
      });
      return {
        table,
        status: status.field,
        amount: amount.field,
        closed: closed.field,
      };
    }

    async function query(
      tableId: string,
      spec: Record<string, unknown>,
    ): Promise<{
      status: number;
      payload: { rows: { label: unknown; value: number }[] };
    }> {
      const response = await app.request(
        `/api/data-table/organization/${member.organization.id}/${tableId}/query`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(spec),
        },
      );
      // 400s carry plain-text messages; only 200s are query JSON.
      const text = await response.text();
      let payload: { rows: { label: unknown; value: number }[] };
      try {
        payload = JSON.parse(text) as {
          rows: { label: unknown; value: number }[];
        };
      } catch {
        payload = { rows: [] };
      }
      return {
        status: response.status,
        payload,
      };
    }

    it("groups counts by a select field, returning stored ids as labels", async () => {
      const { table, status } = await seedQueryTable();
      const { status: code, payload } = await query(table.id, {
        metric: { agg: "count" },
        groupBy: { fieldId: status.id },
      });
      expect(code).toBe(200);
      expect(payload.rows).toEqual([
        { label: "lost", value: 1 },
        { label: "won", value: 2 },
      ]);
    });

    it("sums a numeric field with an equality filter", async () => {
      const { table, status, amount } = await seedQueryTable();
      const { payload } = await query(table.id, {
        metric: { agg: "sum", fieldId: amount.id },
        filters: [{ fieldId: status.id, op: "eq", value: "won" }],
      });
      expect(payload.rows).toEqual([{ label: null, value: 12.5 }]);
    });

    it("buckets date fields by day and rejects mismatched ops", async () => {
      const { table, status, closed, amount } = await seedQueryTable();
      const { payload } = await query(table.id, {
        metric: { agg: "count" },
        groupBy: { fieldId: closed.id, bucket: "day" },
      });
      expect(payload.rows.map((row) => String(row.label).slice(0, 10))).toEqual(
        ["2026-01-05", "2026-02-01"],
      );
      expect(payload.rows.map((row) => row.value)).toEqual([2, 1]);

      // bucket on a non-temporal field is a 400
      const badBucket = await query(table.id, {
        metric: { agg: "count" },
        groupBy: { fieldId: amount.id, bucket: "day" },
      });
      expect(badBucket.status).toBe(400);

      // gt is not a valid op for a select (text-family) field
      const badOp = await query(table.id, {
        metric: { agg: "count" },
        filters: [{ fieldId: status.id, op: "gt", value: 1 }],
      });
      expect(badOp.status).toBe(400);
    });
  });

  describe("dashboards", () => {
    it("round-trips CRUD and validates panel table references", async () => {
      const organizationId = member.organization.id;
      const table = await createTableViaApi(app, organizationId, "Metrics");

      const created = await app.request(
        `/api/data-table/organization/${organizationId}/dashboards`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "Ops" }),
        },
      );
      expect(created.status).toBe(200);
      const dashboard = (await created.json()) as {
        id: string;
        panels: unknown[];
      };
      expect(dashboard.panels).toEqual([]);

      const panels = [
        {
          id: "panel-1",
          title: "Deal count",
          type: "stat",
          span: 6,
          query: {
            tableId: table.id,
            metric: { agg: "count" },
            limit: 10,
          },
        },
      ];
      const updated = await app.request(
        `/api/data-table/organization/${organizationId}/dashboards/${dashboard.id}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ panels }),
        },
      );
      expect(updated.status).toBe(200);
      const updatedPayload = (await updated.json()) as { panels: unknown[] };
      expect(updatedPayload.panels).toEqual(panels);

      const badPanel = await app.request(
        `/api/data-table/organization/${organizationId}/dashboards/${dashboard.id}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            panels: [
              {
                id: "panel-2",
                title: "Ghost",
                type: "bar",
                span: 12,
                query: {
                  tableId: "table-does-not-exist",
                  metric: { agg: "count" },
                },
              },
            ],
          }),
        },
      );
      expect(badPanel.status).toBe(400);

      const badSpan = await app.request(
        `/api/data-table/organization/${organizationId}/dashboards/${dashboard.id}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            panels: [
              {
                id: "panel-3",
                title: "Wide",
                type: "bar",
                span: 7,
                query: { tableId: table.id, metric: { agg: "count" } },
              },
            ],
          }),
        },
      );
      expect(badSpan.status).toBe(400);

      const list = await app.request(
        `/api/data-table/organization/${organizationId}/dashboards`,
      );
      const dashboards = (await list.json()) as { id: string }[];
      expect(dashboards.map((entry) => entry.id)).toContain(dashboard.id);

      const single = await app.request(
        `/api/data-table/organization/${organizationId}/dashboards/${dashboard.id}`,
      );
      expect(single.status).toBe(200);

      const removed = await app.request(
        `/api/data-table/organization/${organizationId}/dashboards/${dashboard.id}`,
        { method: "DELETE" },
      );
      expect(removed.status).toBe(200);
      const gone = await app.request(
        `/api/data-table/organization/${organizationId}/dashboards/${dashboard.id}`,
      );
      expect(gone.status).toBe(404);
    });
  });
});
