import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reconcile } from "../../apps/api/src/data-table/store";
import db, { getDatabase, schema } from "../../apps/api/src/database";
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
    createdBy: string | null;
    updatedBy: string | null;
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

  describe("durable table history", () => {
    const jsonHeaders = { "content-type": "application/json" };
    type Event = {
      id: string;
      type: string;
      rowId: string | null;
      userId: string | null;
      data: Record<string, unknown>;
      createdAt: string;
    };
    const root = (org: string, table: string) =>
      `/api/data-table/organization/${org}/${table}`;
    const write = (path: string, body: unknown, method = "POST") =>
      app.request(path, {
        method,
        headers: jsonHeaders,
        body: JSON.stringify(body),
      });
    const history = async (path: string) => {
      const response = await app.request(`${path}/activity`);
      expect(response.status).toBe(200);
      return (await response.json()) as Event[];
    };

    it("reconcile recovers missing physical tables, including zero-field tables, before add row", async () => {
      const org = member.organization.id;
      const empty = await createTableViaApi(app, org, "Empty legacy");
      const typed = await createTableViaApi(app, org, "Typed legacy");
      const { field } = await createFieldViaApi(app, org, typed.id, {
        name: "Name",
        type: "text",
      });
      for (const table of [empty, typed]) {
        await db.execute(sql.raw(`DROP TABLE kaneo_tables."t_${table.id}"`));
      }
      const reports = await reconcile();
      expect(reports.map((r) => r.tableId)).toEqual(
        expect.arrayContaining([empty.id, typed.id]),
      );
      expect(await physicalTableName(empty.id)).not.toBeNull();
      expect(await physicalTableName(typed.id)).not.toBeNull();
      expect((await addRowViaApi(app, org, empty.id)).id).toEqual(
        expect.any(String),
      );
      expect(
        (await addRowViaApi(app, org, typed.id, { [field!.id]: "Recovered" }))
          .values[field!.id],
      ).toBe("Recovered");
      expect(
        (await reconcile()).filter((r) =>
          [empty.id, typed.id].includes(r.tableId),
        ),
      ).toEqual([]);
    });

    it("recovers a trashed legacy table without a physical table or baseline", async () => {
      const org = member.organization.id;
      const table = await createTableViaApi(app, org, "Trashed legacy");
      const { field } = await createFieldViaApi(app, org, table.id, {
        name: "Name",
        type: "text",
      });
      await db
        .update(schema.dataTableTable)
        .set({ deletedAt: new Date() })
        .where(eq(schema.dataTableTable.id, table.id));
      await db
        .delete(schema.dataTableActivityTable)
        .where(eq(schema.dataTableActivityTable.tableId, table.id));
      await db.execute(sql.raw(`DROP TABLE kaneo_tables."t_${table.id}"`));
      await reconcile();
      expect(await physicalTableName(table.id)).not.toBeNull();
      const path = root(org, table.id);
      expect((await write(`${path}/restore`, {})).status).toBe(200);
      expect(
        (await addRowViaApi(app, org, table.id, { [field!.id]: "Recovered" }))
          .values[field!.id],
      ).toBe("Recovered");
      const baseline = (await history(path)).find(
        (event) => event.type === "baseline",
      )!;
      expect(baseline.data.rows).toEqual([]);
      expect(baseline.data.boundary).toBe(
        "No complete history is claimed before this snapshot",
      );
    });

    it.each(["purge", "field"])(
      "reconcile rechecks %s after entering its repair transaction",
      async (change) => {
        const org = member.organization.id;
        const table = await createTableViaApi(app, org, change);
        const { field } = await createFieldViaApi(app, org, table.id, {
          name: "Missing",
          type: "text",
        });
        await db.execute(
          sql.raw(
            change === "purge"
              ? `DROP TABLE kaneo_tables."t_${table.id}"`
              : `ALTER TABLE kaneo_tables."t_${table.id}" DROP COLUMN "c_${field!.id}"`,
          ),
        );
        let entered!: () => void;
        let release!: () => void;
        const ready = new Promise<void>((resolve) => {
          entered = resolve;
        });
        const barrier = new Promise<void>((resolve) => {
          release = resolve;
        });
        const database = getDatabase();
        const transaction = database.transaction.bind(database);
        let first = true;
        // Spy on the real instance: the exported lazy proxy has no own methods.
        // Pause only reconciliation's first repair, not the competing writer.
        const spy = vi
          .spyOn(database, "transaction")
          .mockImplementation(async (...args) => {
            if (first) {
              first = false;
              entered();
              await barrier;
            }
            return transaction(...args);
          });
        const repairing = reconcile();
        try {
          await Promise.race([
            ready,
            repairing.then(() => {
              throw new Error(
                "Reconciliation never entered its repair transaction",
              );
            }),
          ]);
          if (change === "purge") {
            expect(
              (await write(`${root(org, table.id)}/purge`, {})).status,
            ).toBe(200);
          } else {
            // Model a writer deleting already-missing storage under the production metadata lock.
            await db.transaction(async (tx) => {
              await tx
                .select()
                .from(schema.dataTableTable)
                .where(eq(schema.dataTableTable.id, table.id))
                .for("update");
              await tx
                .delete(schema.dataTableFieldTable)
                .where(eq(schema.dataTableFieldTable.id, field!.id));
            });
          }
        } finally {
          release();
          await repairing.finally(() => spy.mockRestore());
        }
        if (change === "purge")
          expect(await physicalTableName(table.id)).toBeNull();
        else
          expect(
            (await physicalColumns(table.id)).map((col) => col.column_name),
          ).not.toContain(`c_${field!.id}`);
      },
    );

    it.each([
      {
        type: "text",
        value: "9007199254740993.1234567890123456789",
        target: "number",
      },
      { type: "datetime", value: "2026-03-12T10:30:00.123456Z" },
      { type: "json", value: {} },
    ])(
      "archives and restores raw $type values without display precision loss",
      async (spec) => {
        const org = member.organization.id;
        const table = await createTableViaApi(app, org, "Exact archive");
        const path = root(org, table.id);
        const { field } = await createFieldViaApi(app, org, table.id, {
          name: spec.type,
          type: spec.type,
        });
        const row = await addRowViaApi(app, org, table.id, {
          [field!.id]: spec.value,
        });
        const col = sql.raw(`"c_${field!.id}"`);
        const relation = sql.raw(`kaneo_tables."t_${table.id}"`);
        if (spec.target)
          expect(
            (
              await write(
                `${path}/fields/${field!.id}`,
                { type: spec.target },
                "PUT",
              )
            ).status,
          ).toBe(200);
        if (spec.type === "json")
          await db.execute(
            sql`UPDATE ${relation} SET ${col} = ${'{"large":9007199254740993.1234567890123456789,"nested":[null,1.0000000000000000001]}'}::jsonb WHERE id = ${row.id}`,
          );
        const raw = async () =>
          (
            await db.execute(
              sql`SELECT ${col}::text AS value FROM ${relation} WHERE id = ${row.id}`,
            )
          ).rows[0].value as string;
        const original = await raw();
        if (spec.target) expect(original).toBe(spec.value);
        if (spec.type === "datetime")
          expect(original).toContain("10:30:00.123456");
        // Display API remains numeric/Date/JSON; the parallel raw transport is authoritative.
        const archive = (await (
          await app.request(`${path}/history-export`)
        ).json()) as {
          rows: {
            id: string;
            values: Record<string, unknown>;
            rawValues: Record<string, string | null>;
          }[];
        };
        const archived = archive.rows.find((item) => item.id === row.id)!;
        if (spec.target)
          expect(typeof archived.values[field!.id]).toBe("number");
        expect(archived.rawValues?.[field!.id]).toBe(original);
        await db
          .delete(schema.dataTableActivityTable)
          .where(eq(schema.dataTableActivityTable.tableId, table.id));
        expect(
          (
            await write(
              `${path}/fields/${field!.id}`,
              { type: "checkbox" },
              "PUT",
            )
          ).status,
        ).toBe(200);
        const events = await history(path);
        const baseline = events.find((event) => event.type === "baseline")!;
        expect(baseline.data.rows).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: row.id,
              rawValues: expect.objectContaining({ [field!.id]: original }),
            }),
          ]),
        );
        const event = events.find((entry) => entry.type === "field_updated")!;
        const exact = await db.execute(
          sql`SELECT backup->>'rawValue' AS value FROM data_table_activity, jsonb_array_elements(data->'beforeColumn') backup WHERE data_table_activity.id = ${event.id} AND backup->>'id' = ${row.id}`,
        );
        expect(exact.rows[0]?.value).toBe(original);
        expect(
          (await write(`${path}/activity/${event.id}/revert`, {})).status,
        ).toBe(200);
        expect(await raw()).toBe(original);
        expect(
          (await app.request(`${path}/rows/${row.id}`, { method: "DELETE" }))
            .status,
        ).toBe(200);
        const deleted = (await history(path)).find(
          (entry) => entry.type === "row_deleted",
        )!;
        expect(deleted.data.row).toMatchObject({
          rawValues: { [field!.id]: original },
        });
      },
    );

    it("audits an exact numeric edit even when display numbers compare equal", async () => {
      const org = member.organization.id;
      const table = await createTableViaApi(app, org, "Exact edits");
      const { field } = await createFieldViaApi(app, org, table.id, {
        name: "Amount",
        type: "text",
      });
      const row = await addRowViaApi(app, org, table.id, {
        [field!.id]: "9007199254740993",
      });
      const path = root(org, table.id);
      expect(
        (await write(`${path}/fields/${field!.id}`, { type: "number" }, "PUT"))
          .status,
      ).toBe(200);
      expect(
        (
          await write(
            `${path}/rows/${row.id}/cells/${field!.id}`,
            { value: 9007199254740992 },
            "PUT",
          )
        ).status,
      ).toBe(200);
      const stored = await db.execute(
        sql.raw(
          `SELECT "c_${field!.id}"::text AS value FROM kaneo_tables."t_${table.id}" WHERE id = '${row.id}'`,
        ),
      );
      expect(stored.rows[0]?.value).toBe("9007199254740992");
      const event = (await history(path)).find(
        (entry) => entry.type === "cell_updated",
      )!;
      expect(event.data.beforeRow).toMatchObject({
        rawValues: { [field!.id]: "9007199254740993" },
      });
      expect(event.data.afterRow).toMatchObject({
        rawValues: { [field!.id]: "9007199254740992" },
      });
      expect(
        (
          await write(
            `${path}/rows/${row.id}/cells/${field!.id}`,
            { value: 9007199254740992 },
            "PUT",
          )
        ).status,
      ).toBe(200);
      expect(
        (await history(path)).filter((entry) => entry.type === "cell_updated"),
      ).toHaveLength(1);
    });

    it("validates comments, scopes rows, and enforces view versus edit and organization access", async () => {
      const org = member.organization.id;
      const table = await createTableViaApi(app, org, "Comments");
      const path = root(org, table.id);
      const row = await addRowViaApi(app, org, table.id);
      const otherTable = await createTableViaApi(app, org, "Other");
      const otherRow = await addRowViaApi(app, org, otherTable.id);
      for (const content of ["", "  \n ", "x".repeat(20001), 7, null]) {
        expect((await write(`${path}/comments`, { content })).status).toBe(400);
      }
      expect(
        (await write(`${path}/comments`, { content: "x", rowId: otherRow.id }))
          .status,
      ).toBe(404);
      const comment = await write(`${path}/comments`, {
        content: "  A useful note  ",
        rowId: row.id,
      });
      expect(comment.status).toBe(200);
      const entry = (await comment.json()) as Event;
      expect(entry).toMatchObject({
        type: "comment_added",
        rowId: row.id,
        userId: member.user.id,
        data: { content: "A useful note" },
      });
      expect((await history(path))[0]).toMatchObject({
        id: entry.id,
        data: { content: "A useful note" },
      });
      expect(
        (await write(`${path}/comments`, { content: "table note" })).status,
      ).toBe(200);
      expect(
        (await write(`${path}/comments`, { content: "x".repeat(20000) }))
          .status,
      ).toBe(200);
      const rowHistory = await app.request(`${path}/activity?rowId=${row.id}`);
      expect(
        ((await rowHistory.json()) as Event[]).filter(
          (event) => event.type === "comment_added",
        ),
      ).toHaveLength(1);
      await db
        .update(schema.organizationMemberTable)
        .set({ role: "member" })
        .where(eq(schema.organizationMemberTable.userId, member.user.id));
      await db
        .update(schema.dataTableTable)
        .set({ orgPrivilege: "view" })
        .where(eq(schema.dataTableTable.id, table.id));
      expect((await app.request(`${path}/activity`)).status).toBe(200);
      expect((await app.request(`${path}/history-export`)).status).toBe(200);
      expect(
        (await write(`${path}/comments`, { content: "forbidden" })).status,
      ).toBe(404);
      expect(
        (await write(`${path}/activity/${entry.id}/revert`, {})).status,
      ).toBe(404);
      const foreign = await createOrganizationMember();
      await db
        .update(schema.organizationTable)
        .set({ tablesEnabled: true })
        .where(eq(schema.organizationTable.id, foreign.organization.id));
      const forged = root(foreign.organization.id, table.id);
      expect((await app.request(`${forged}/activity`)).status).not.toBe(200);
      expect((await app.request(`${forged}/history-export`)).status).not.toBe(
        200,
      );
      expect(
        (await write(`${forged}/comments`, { content: "wrong organization" }))
          .status,
      ).not.toBe(200);
      mockAuthenticatedSession(foreign.user);
      expect((await app.request(`${path}/activity`)).status).not.toBe(200);
      expect((await app.request(`${path}/history-export`)).status).not.toBe(
        200,
      );
      expect(
        (await write(`${path}/comments`, { content: "foreign" })).status,
      ).not.toBe(200);
      expect(
        (await write(`${path}/activity/${entry.id}/revert`, {})).status,
      ).not.toBe(200);
    });

    it("paginates all events beyond 200 with stable ties and validates bounds", async () => {
      const table = await createTableViaApi(
        app,
        member.organization.id,
        "Long history",
      );
      const path = root(member.organization.id, table.id);
      await db
        .delete(schema.dataTableActivityTable)
        .where(eq(schema.dataTableActivityTable.tableId, table.id));
      await db.insert(schema.dataTableActivityTable).values(
        Array.from({ length: 205 }, (_, index) => ({
          tableId: table.id,
          type: "comment_added",
          createdAt: new Date("2026-01-01T00:00:00Z"),
          data: { content: String(index) },
        })),
      );
      const expected = await db
        .select()
        .from(schema.dataTableActivityTable)
        .where(eq(schema.dataTableActivityTable.tableId, table.id));
      const ids: string[] = [];
      for (const offset of [0, 100, 200]) {
        const response = await app.request(
          `${path}/activity?offset=${offset}&limit=100`,
        );
        expect(response.status).toBe(200);
        const events = (await response.json()) as Event[];
        ids.push(...events.map((event) => event.id));
      }
      expect(new Set(ids).size).toBe(expected.length);
      expect(ids).toHaveLength(expected.length);
      expect(await history(path)).toHaveLength(100);
      expect((await history(path)).map((event) => event.id)).toEqual(
        ids.slice(0, 100),
      );
      for (const query of [
        "offset=-1",
        "offset=1.5",
        "offset=NaN",
        "limit=0",
        "limit=101",
        "limit=Infinity",
      ]) {
        expect((await app.request(`${path}/activity?${query}`)).status).toBe(
          400,
        );
      }
      const exported = await app.request(`${path}/history-export`);
      expect(exported.status).toBe(200);
      const body = (await exported.json()) as {
        events: Event[];
        historyStartsAt: string | null;
      };
      expect(body.events).toHaveLength(expected.length);
      expect(body.historyStartsAt).toBeNull(); // Old logs are not a baseline.
    });

    it("archives options-only changes, complete rows, table identity, and an honest legacy baseline", async () => {
      const org = member.organization.id;
      const table = await createTableViaApi(app, org, "Legacy");
      const { field } = await createFieldViaApi(app, org, table.id, {
        name: "State",
        type: "select",
        options: { choices: [{ id: "open", label: "Original label" }] },
      });
      const row = await addRowViaApi(app, org, table.id, {
        [field!.id]: "open",
      });
      // Simulate an existing table whose historical changes were never audited.
      await db
        .delete(schema.dataTableActivityTable)
        .where(eq(schema.dataTableActivityTable.tableId, table.id));
      const path = root(org, table.id);
      expect(
        (
          await write(
            `${path}/fields/${field!.id}`,
            { options: { choices: [{ id: "open", label: "New label" }] } },
            "PUT",
          )
        ).status,
      ).toBe(200);
      expect(
        (await write(path, { name: "Renamed", icon: "database" }, "PUT"))
          .status,
      ).toBe(200);
      expect(
        (await app.request(`${path}/rows/${row.id}`, { method: "DELETE" }))
          .status,
      ).toBe(200);
      const events = await history(path);
      const baseline = events.find((e) => e.type === "baseline")!;
      expect(baseline.data).toMatchObject({
        table: { name: "Legacy" },
        fields: [
          {
            id: field!.id,
            options: { choices: [{ label: "Original label" }] },
          },
        ],
        rows: [row],
      });
      expect(
        events.find((e) => e.type === "field_updated")?.data,
      ).toMatchObject({
        beforeField: { options: { choices: [{ label: "Original label" }] } },
        afterField: { options: { choices: [{ label: "New label" }] } },
      });
      expect(
        events.find((e) => e.type === "field_updated")?.data,
      ).not.toHaveProperty("beforeColumn");
      expect(events.find((e) => e.type === "row_deleted")?.data).toMatchObject({
        row,
        fields: [{ name: "State" }],
        values: row.values,
      });
      expect(
        events.find((e) => e.type === "table_updated")?.data,
      ).toMatchObject({
        before: { name: "Legacy" },
        after: { name: "Renamed", icon: "database" },
      });
      const exported = await app.request(`${path}/history-export`);
      const body = (await exported.json()) as {
        version: number;
        rows: unknown[];
        events: Event[];
        historyStartsAt: string;
      };
      expect(body.version).toBe(1);
      expect(body.rows).toEqual([]);
      expect(body.events).toHaveLength(events.length);
      expect(body.historyStartsAt).toBe(baseline.createdAt);
    });

    it("archives and restores a destructive whole column beyond 1000 rows and refuses later edits", async () => {
      const org = member.organization.id;
      const table = await createTableViaApi(app, org, "Large restore");
      const { field } = await createFieldViaApi(app, org, table.id, {
        name: "Original",
        type: "text",
      });
      await db.execute(
        sql.raw(
          `INSERT INTO kaneo_tables."t_${table.id}" (id, position, "c_${field!.id}") SELECT 'legacy' || n, n, 'lost-' || n FROM generate_series(1, 1005) n`,
        ),
      );
      await db
        .delete(schema.dataTableActivityTable)
        .where(eq(schema.dataTableActivityTable.tableId, table.id));
      const path = root(org, table.id);
      expect(
        (
          await write(
            `${path}/fields/${field!.id}`,
            { type: "number", name: "Converted", options: { precision: 2 } },
            "PUT",
          )
        ).status,
      ).toBe(200);
      expect(
        (await history(path)).find((entry) => entry.type === "baseline")?.data
          .rows,
      ).toHaveLength(1005);
      const event = (await history(path)).find(
        (e) => e.type === "field_updated",
      )!;
      expect(event.data.beforeColumn).toHaveLength(1005);
      expect(event.data.afterColumn).toHaveLength(1005);
      expect(
        (await write(`${path}/activity/${event.id}/revert`, {})).status,
      ).toBe(200);
      const exported = await app.request(`${path}/history-export`);
      const body = (await exported.json()) as {
        fields: FieldRow[];
        rows: { id: string; values: Record<string, unknown> }[];
        events: Event[];
      };
      expect(body.fields[0]).toMatchObject({
        name: "Original",
        type: "text",
        options: null,
      });
      expect(body.rows).toHaveLength(1005);
      expect(
        body.rows.find((r) => r.id === "legacy1005")?.values[field!.id],
      ).toBe("lost-1005");
      expect(body.events[0]).toMatchObject({
        type: "field_reverted",
        data: { activityId: event.id },
      });
      expect(body.events.find((e) => e.id === event.id)).toEqual(event);
      expect(
        (await write(`${path}/activity/${event.id}/revert`, {})).status,
      ).toBe(409);
      expect(
        (await write(`${path}/fields/${field!.id}`, { type: "number" }, "PUT"))
          .status,
      ).toBe(200);
      const next = (await history(path)).find(
        (e) => e.type === "field_updated",
      )!;
      expect(
        (
          await write(
            `${path}/rows/legacy1005/cells/${field!.id}`,
            { value: 42 },
            "PUT",
          )
        ).status,
      ).toBe(200);
      expect(
        (await write(`${path}/activity/${next.id}/revert`, {})).status,
      ).toBe(409);
      const other = await createTableViaApi(app, org, "Other");
      expect(
        (await write(`${root(org, other.id)}/activity/${next.id}/revert`, {}))
          .status,
      ).toBe(404);
    });

    it("preserves archived choice labels, ticket titles and link snapshots through later changes", async () => {
      const org = member.organization.id;
      const table = await createTableViaApi(app, org, "References");
      const { field } = await createFieldViaApi(app, org, table.id, {
        name: "State",
        type: "select",
        options: { choices: [{ id: "open", label: "Original label" }] },
      });
      const { field: tickets } = await createFieldViaApi(app, org, table.id, {
        name: "Ticket",
        type: "ticket",
      });
      const { board, columns } = await createBoardFixture({
        organizationId: org,
        slug: "arc",
      });
      const [task] = await db
        .insert(schema.taskTable)
        .values({
          boardId: board.id,
          columnId: columns.todo.id,
          title: "Original ticket",
          status: "to-do",
          priority: "medium",
          number: 8,
          position: 1,
        })
        .returning();
      const row = await addRowViaApi(app, org, table.id, {
        [field!.id]: "open",
        [tickets!.id]: [task.id],
      });
      const path = root(org, table.id);
      expect(
        (await write(`${path}/rows/${row.id}/tickets?taskId=${task.id}`, {}))
          .status,
      ).toBe(200);
      expect(
        (
          await app.request(
            `${path}/rows/${row.id}/tickets?taskId=${task.id}`,
            { method: "DELETE" },
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await write(
            `${path}/fields/${field!.id}`,
            { type: "checkbox" },
            "PUT",
          )
        ).status,
      ).toBe(200);
      const conversion = (await history(path)).find(
        (event) => event.type === "field_updated",
      )!;
      expect(conversion.data).toMatchObject({
        fromType: "select",
        toType: "checkbox",
        beforeField: { options: { choices: [{ label: "Original label" }] } },
      });
      expect(conversion.data).not.toHaveProperty("fromName");
      expect(
        (await history(path)).find((event) => event.type === "row_created")
          ?.data.title,
      ).toBe("Original label");
      expect(
        (await history(path)).find((event) => event.type === "ticket_linked")
          ?.data.rowTitle,
      ).toBe("Original label");
      const archive = (await (
        await app.request(`${path}/history-export`)
      ).json()) as { tickets: Record<string, { title: string }> };
      expect(archive.tickets[task.id].title).toBe("Original ticket");
      expect(
        (await write(`${path}/activity/${conversion.id}/revert`, {})).status,
      ).toBe(200);
      expect(
        (
          await write(
            `${path}/rows/${row.id}/cells/${field!.id}`,
            { value: null },
            "PUT",
          )
        ).status,
      ).toBe(200);
      await db
        .update(schema.taskTable)
        .set({ title: "Changed ticket" })
        .where(eq(schema.taskTable.id, task.id));
      const events = await history(path);
      expect(
        events.find((event) => event.type === "cell_updated")?.data,
      ).toMatchObject({
        from: "open",
        to: null,
        field: {
          name: "State",
          type: "select",
          options: { choices: [{ label: "Original label" }] },
        },
      });
      expect(
        events.find((event) => event.type === "row_created")?.data,
      ).toMatchObject({
        row,
        tickets: { [task.id]: { title: "Original ticket", key: "ARC-8" } },
      });
      expect(
        events.find((event) => event.type === "ticket_linked")?.data,
      ).toMatchObject({
        key: "ARC-8",
        title: "Original ticket",
        link: { externalId: row.id },
      });
      expect(
        events.find((event) => event.type === "ticket_unlinked")?.data,
      ).toMatchObject({ links: [{ externalId: row.id }] });
      expect(
        (await app.request(`${path}/fields/${field!.id}`, { method: "DELETE" }))
          .status,
      ).toBe(200);
      expect(
        (await history(path)).find((event) => event.type === "field_deleted")
          ?.data,
      ).toMatchObject({
        beforeField: { name: "State", type: "select" },
        beforeColumn: [{ id: row.id, value: null }],
      });
      expect((await app.request(path, { method: "DELETE" })).status).toBe(200);
      expect((await write(`${path}/restore`, {})).status).toBe(200);
      expect(
        (await history(path)).slice(0, 2).map((event) => event.type),
      ).toEqual(["table_restored", "table_deleted"]);
    });

    it("restores scalar, temporal, JSON and array columns verbatim without revalidating archived values", async () => {
      const org = member.organization.id;
      const table = await createTableViaApi(app, org, "Restore types");
      const path = root(org, table.id);
      for (const spec of [
        { type: "number", value: 12.5 },
        { type: "date", value: "2026-03-12" },
        { type: "datetime", value: "2026-03-12T10:30:00.000Z" },
        { type: "checkbox", value: true },
        { type: "json", value: { nested: [1, "two"] } },
        {
          type: "multiselect",
          value: ["a", "b"],
          options: {
            choices: [
              { id: "a", label: "A" },
              { id: "b", label: "B" },
            ],
          },
        },
      ]) {
        const { field } = await createFieldViaApi(app, org, table.id, {
          name: spec.type,
          type: spec.type,
          options: spec.options,
        });
        const row = await addRowViaApi(app, org, table.id, {
          [field!.id]: spec.value,
        });
        expect(
          (await write(`${path}/fields/${field!.id}`, { type: "text" }, "PUT"))
            .status,
        ).toBe(200);
        const event = (await history(path)).find(
          (entry) =>
            entry.type === "field_updated" && entry.data.fromType === spec.type,
        )!;
        expect(
          (await write(`${path}/activity/${event.id}/revert`, {})).status,
        ).toBe(200);
        const detail = (await (await app.request(path)).json()) as {
          rows: { id: string; values: Record<string, unknown> }[];
        };
        expect(
          detail.rows.find((item) => item.id === row.id)?.values[field!.id],
        ).toEqual(row.values[field!.id]);
      }
    });

    it("refuses conversion restores after field metadata or row membership changes", async () => {
      const org = member.organization.id;
      for (const change of ["metadata", "created", "deleted"]) {
        const table = await createTableViaApi(app, org, change);
        const { field } = await createFieldViaApi(app, org, table.id, {
          name: "Value",
          type: "text",
        });
        const row = await addRowViaApi(app, org, table.id, {
          [field!.id]: "original",
        });
        const path = root(org, table.id);
        expect(
          (
            await write(
              `${path}/fields/${field!.id}`,
              { type: "number" },
              "PUT",
            )
          ).status,
        ).toBe(200);
        const event = (await history(path)).find(
          (item) => item.type === "field_updated",
        )!;
        if (change === "metadata")
          expect(
            (
              await write(
                `${path}/fields/${field!.id}`,
                { options: { precision: 4 } },
                "PUT",
              )
            ).status,
          ).toBe(200);
        if (change === "created") await addRowViaApi(app, org, table.id);
        if (change === "deleted")
          expect(
            (await app.request(`${path}/rows/${row.id}`, { method: "DELETE" }))
              .status,
          ).toBe(200);
        expect(
          (await write(`${path}/activity/${event.id}/revert`, {})).status,
        ).toBe(409);
      }
    });

    it("serializes concurrent row edits with an unbroken before/after history", async () => {
      const org = member.organization.id;
      const table = await createTableViaApi(app, org, "Concurrent");
      const { field } = await createFieldViaApi(app, org, table.id, {
        name: "Value",
        type: "number",
      });
      const row = await addRowViaApi(app, org, table.id, { [field!.id]: 0 });
      const path = root(org, table.id);
      const results = await Promise.all(
        [1, 2, 3, 4].map((value) =>
          write(`${path}/rows/${row.id}/cells/${field!.id}`, { value }, "PUT"),
        ),
      );
      expect(results.map((result) => result.status)).toEqual([
        200, 200, 200, 200,
      ]);
      const events = (await history(path))
        .filter((event) => event.type === "cell_updated")
        .reverse();
      expect(events).toHaveLength(4);
      expect(events[0].data.from).toBe(0);
      for (let index = 1; index < events.length; index++)
        expect(events[index].data.from).toBe(events[index - 1].data.to);
      const detail = (await (await app.request(path)).json()) as {
        rows: { values: Record<string, unknown> }[];
      };
      expect(detail.rows[0].values[field!.id]).toBe(
        events[events.length - 1].data.to,
      );
    });

    it("rolls back row create, edit, and delete when the history insert fails", async () => {
      const org = member.organization.id;
      const table = await createTableViaApi(app, org, "Atomic");
      const { field } = await createFieldViaApi(app, org, table.id, {
        name: "Title",
        type: "text",
      });
      const row = await addRowViaApi(app, org, table.id, {
        [field!.id]: "Before",
      });
      const path = root(org, table.id);
      await db.execute(
        sql.raw(
          `CREATE FUNCTION reject_table_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected audit failure'; END $$`,
        ),
      );
      await db.execute(
        sql.raw(
          "CREATE TRIGGER reject_table_history BEFORE INSERT ON data_table_activity FOR EACH ROW EXECUTE FUNCTION reject_table_history()",
        ),
      );
      try {
        expect(
          (
            await write(`${path}/rows`, {
              values: { [field!.id]: "Should roll back" },
            })
          ).status,
        ).toBe(500);
        expect(
          (
            await write(
              `${path}/rows/${row.id}/cells/${field!.id}`,
              { value: "Should roll back" },
              "PUT",
            )
          ).status,
        ).toBe(500);
        expect(
          (await app.request(`${path}/rows/${row.id}`, { method: "DELETE" }))
            .status,
        ).toBe(500);
      } finally {
        await db.execute(
          sql.raw("DROP TRIGGER reject_table_history ON data_table_activity"),
        );
        await db.execute(sql.raw("DROP FUNCTION reject_table_history()"));
      }
      const detail = (await (await app.request(path)).json()) as {
        rows: unknown[];
      };
      expect(detail.rows).toEqual([row]);
    });
  });

  describe("system field attribution", () => {
    it("attributes creates and edits, preserves creator, and backfills legacy rows idempotently", async () => {
      const org = member.organization.id;
      const table = await createTableViaApi(app, org, "Attribution");
      const { field } = await createFieldViaApi(app, org, table.id, {
        name: "Name",
        type: "text",
      });
      const row = await addRowViaApi(app, org, table.id, {
        [field!.id]: "Initial",
      });
      expect(row).toMatchObject({
        createdBy: member.user.id,
        updatedBy: member.user.id,
      });
      const other = await createOrganizationMember();
      await db.insert(schema.organizationMemberTable).values({
        organizationId: org,
        userId: other.user.id,
        role: "owner",
        joinedAt: new Date(),
      });
      mockAuthenticatedSession(other.user);
      const update = await app.request(
        `/api/data-table/organization/${org}/${table.id}/rows/${row.id}/cells/${field!.id}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ value: "Edited" }),
        },
      );
      expect(update.status).toBe(200);
      expect(await update.json()).toMatchObject({
        createdBy: member.user.id,
        updatedBy: other.user.id,
      });
      // Conversions and restoration also touch physical values in shared store paths.
      const fieldPath = `/api/data-table/organization/${org}/${table.id}/fields/${field!.id}`;
      const converted = await app.request(fieldPath, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "number" }),
      });
      expect(converted.status).toBe(200);
      const events = (await (
        await app.request(
          `/api/data-table/organization/${org}/${table.id}/activity`,
        )
      ).json()) as { id: string; type: string }[];
      const conversion = events.find(
        (event) => event.type === "field_updated",
      )!;
      mockAuthenticatedSession(member.user);
      const restored = await app.request(
        `/api/data-table/organization/${org}/${table.id}/activity/${conversion.id}/revert`,
        { method: "POST" },
      );
      expect(restored.status).toBe(200);
      const restoredRows = await db.execute(
        sql.raw(
          `SELECT created_by, updated_by FROM kaneo_tables."t_${table.id}" WHERE id = '${row.id}'`,
        ),
      );
      expect(restoredRows.rows[0]).toMatchObject({
        created_by: member.user.id,
        updated_by: member.user.id,
      });
      const unknown = await addRowViaApi(app, org, table.id);
      await db
        .delete(schema.dataTableActivityTable)
        .where(eq(schema.dataTableActivityTable.rowId, unknown.id));
      // Simulate a pre-migration physical table, then run the actual migration twice.
      await db.execute(
        sql.raw(
          `ALTER TABLE kaneo_tables."t_${table.id}" DROP COLUMN created_by, DROP COLUMN updated_by`,
        ),
      );
      const migration = readFileSync(
        new URL(
          "../../apps/api/drizzle/0087_table_system_fields.sql",
          import.meta.url,
        ),
        "utf8",
      );
      await db.execute(sql.raw(migration));
      await db.execute(sql.raw(migration));
      const result = await db.execute(
        sql.raw(
          `SELECT id, created_by, updated_by FROM kaneo_tables."t_${table.id}"`,
        ),
      );
      expect(result.rows.find((item) => item.id === row.id)).toMatchObject({
        created_by: member.user.id,
        updated_by: member.user.id,
      });
      expect(result.rows.find((item) => item.id === unknown.id)).toMatchObject({
        created_by: null,
        updated_by: null,
      });
    });
  });

  describe("store engine", () => {
    it("creates a physical table with system columns and a DDL ledger entry", async () => {
      const table = await createTableViaApi(app, member.organization.id, "CRM");

      const columns = await physicalColumns(table.id);
      expect(columns.map((column) => column.column_name).sort()).toEqual([
        "created_at",
        "created_by",
        "id",
        "position",
        "updated_at",
        "updated_by",
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
    it("validates defaults, applies only absent values without backfill, and round-trips descriptions", async () => {
      const org = member.organization.id;
      const table = await createTableViaApi(app, org, "Defaults");
      const oldRow = await addRowViaApi(app, org, table.id);
      const invalid = await createFieldViaApi(app, org, table.id, {
        name: "Bad",
        type: "number",
        options: { defaultValue: "oops" },
      });
      expect(invalid.response.status).toBe(400);
      const { field } = await createFieldViaApi(app, org, table.id, {
        name: "Amount",
        type: "number",
        options: { defaultValue: 42, description: "Expected amount" },
      });
      expect(field!.options).toMatchObject({
        defaultValue: 42,
        description: "Expected amount",
      });
      expect((await addRowViaApi(app, org, table.id)).values[field!.id]).toBe(
        42,
      );
      expect(
        (await addRowViaApi(app, org, table.id, { [field!.id]: null })).values[
          field!.id
        ],
      ).toBeNull();
      expect(
        (await addRowViaApi(app, org, table.id, { [field!.id]: 0 })).values[
          field!.id
        ],
      ).toBe(0);
      const root = `/api/data-table/organization/${org}/${table.id}`;
      const snapshot = await (await app.request(root)).json();
      expect(
        snapshot.rows.find((row: { id: string }) => row.id === oldRow.id)
          .values[field!.id],
      ).toBeNull();
      expect(
        snapshot.fields.find((f: { id: string }) => f.id === field!.id).options
          .description,
      ).toBe("Expected amount");
      const changed = await app.request(`${root}/fields/${field!.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "checkbox" }),
      });
      expect(changed.status).toBe(200);
      expect((await changed.json()).options).toEqual({
        description: "Expected amount",
      });
      expect(
        (await addRowViaApi(app, org, table.id)).values[field!.id],
      ).toBeNull();
    });
    it("uses false defaults before required validation and rejects invalid choice defaults", async () => {
      const org = member.organization.id;
      const table = await createTableViaApi(app, org, "Required defaults");
      const bad = await createFieldViaApi(app, org, table.id, {
        name: "State",
        type: "select",
        options: {
          choices: [{ id: "a", label: "A" }],
          defaultValue: "missing",
        },
      });
      expect(bad.response.status).toBe(400);
      const { field } = await createFieldViaApi(app, org, table.id, {
        name: "Done",
        type: "checkbox",
        options: { required: true, defaultValue: false },
      });
      expect((await addRowViaApi(app, org, table.id)).values[field!.id]).toBe(
        false,
      );
      const response = await app.request(
        `/api/data-table/organization/${org}/${table.id}/rows`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ values: { [field!.id]: null } }),
        },
      );
      expect(response.status).toBe(400);
    });

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
    async function seedTask(
      organizationId: string,
      title: string,
      slug = "kfl",
    ) {
      const { board, columns } = await createBoardFixture({
        organizationId,
        slug,
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

    it("validates ticket defaults and draft picker board scope before a field exists", async () => {
      const org = member.organization.id;
      const table = await createTableViaApi(app, org, "Ticket defaults");
      const own = await seedTask(org, "Default task");
      const other = await createOrganizationMember();
      const foreign = await seedTask(other.organization.id, "Foreign task");
      const root = `/api/data-table/organization/${org}/${table.id}`;
      const invalid = await createFieldViaApi(app, org, table.id, {
        name: "Bad",
        type: "ticket",
        options: { defaultValue: [foreign.id] },
      });
      expect(invalid.response.status).toBe(400);
      const lookup = await app.request(
        `${root}/fields/draft/tickets?boards=${own.boardId}`,
      );
      expect(lookup.status).toBe(200);
      expect(
        (await lookup.json()).map((ref: { id: string }) => ref.id),
      ).toEqual([own.id]);
      const { field } = await createFieldViaApi(app, org, table.id, {
        name: "Ticket",
        type: "ticket",
        options: {
          defaultValue: [own.id],
          boardIds: [own.boardId],
          multiple: false,
        },
      });
      expect(field).not.toBeNull();
      const detail = await (await app.request(root)).json();
      expect(detail.tickets[own.id].title).toBe("Default task");
      expect(
        (await addRowViaApi(app, org, table.id)).values[field!.id],
      ).toEqual([own.id]);
      await db
        .update(schema.taskTable)
        .set({ deletedAt: new Date() })
        .where(eq(schema.taskTable.id, own.id));
      const response = await app.request(`${root}/rows`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(response.status).toBe(400);
    });

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

      // Duplicate ids collapse to one.
      const dup = await put(row.id, [own.id, own.id]);
      expect(
        ((await dup.json()) as { values: Record<string, unknown> }).values[
          field?.id ?? ""
        ],
      ).toEqual([own.id]);

      // A linked ticket deleted later is grandfathered: the cell stays
      // writable (the picker re-commits the whole array) and the dead id
      // drops out of the lookup instead of leaking.
      await db
        .update(schema.taskTable)
        .set({ deletedAt: new Date() })
        .where(eq(schema.taskTable.id, own.id));
      expect((await put(row.id, [own.id])).status).toBe(200);
      const after = (await (
        await app.request(
          `/api/data-table/organization/${member.organization.id}/${table.id}`,
        )
      ).json()) as { tickets: Record<string, unknown> };
      expect(after.tickets[own.id]).toBeUndefined();
    });

    it("logs who created, edited and deleted rows and fields", async () => {
      const org = member.organization.id;
      const table = await createTableViaApi(app, org, "Assets");
      const { field: name } = await createFieldViaApi(app, org, table.id, {
        name: "Name",
        type: "text",
      });
      const { field: cost } = await createFieldViaApi(app, org, table.id, {
        name: "Cost",
        type: "number",
        options: { precision: 0 },
      });
      const row = await addRowViaApi(app, org, table.id, {
        [name?.id ?? ""]: "Pump P-2",
      });
      const put = (value: unknown) =>
        app.request(
          `/api/data-table/organization/${org}/${table.id}/rows/${row.id}/cells/${cost?.id}`,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ value }),
          },
        );
      // Decimals are display-only: a 0-decimal field stores 1.25 as written.
      const written = await put(1.25);
      expect(written.status).toBe(200);
      expect(
        ((await written.json()) as { values: Record<string, unknown> }).values[
          cost?.id ?? ""
        ],
      ).toBe(1.25);
      // An unchanged write is not history.
      await put(1.25);
      expect(
        (
          await app.request(
            `/api/data-table/organization/${org}/${table.id}/rows/${row.id}`,
            { method: "DELETE" },
          )
        ).status,
      ).toBe(200);

      type Entry = {
        type: string;
        rowId: string | null;
        userId: string | null;
        userName: string | null;
        data: Record<string, unknown> | null;
      };
      const read = async (query = "") =>
        (await (
          await app.request(
            `/api/data-table/organization/${org}/${table.id}/activity${query}`,
          )
        ).json()) as Entry[];
      const all = await read();
      expect(all.map((entry) => entry.type)).toEqual([
        "row_deleted",
        "cell_updated",
        "row_created",
        "field_created",
        "field_created",
        "table_created",
        "baseline",
      ]);
      expect(all.every((entry) => entry.userId === member.user.id)).toBe(true);
      expect(all[0].userName).toBe(member.user.name);
      // The deleted row's values survive in the log.
      expect(all[0].data).toMatchObject({
        title: "Pump P-2",
        values: { [name?.id ?? ""]: "Pump P-2" },
      });
      expect(all[1].data).toMatchObject({ from: null, to: 1.25 });

      const forRow = await read(`?rowId=${row.id}`);
      expect(forRow.map((entry) => entry.type)).toEqual([
        "row_deleted",
        "cell_updated",
        "row_created",
      ]);
    });

    it("lists every row that includes a ticket, with fields, under the table lattice", async () => {
      const org = member.organization.id;
      const own = await seedTask(org, "Pump overhaul");
      const json = (path: string, method: string, body?: unknown) =>
        app.request(`/api/data-table/organization/${org}${path}`, {
          method,
          headers: { "content-type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      const included = async () =>
        (await (
          await app.request(
            `/api/data-table/organization/${org}/rows-for-ticket?taskId=${own.id}`,
          )
        ).json()) as {
          tables: {
            tableId: string;
            canEdit: boolean;
            fields: { id: string; name: string }[];
            rows: {
              id: string;
              linked: boolean;
              values: Record<string, unknown>;
            }[];
            tickets: Record<string, { key: string }>;
          }[];
        };

      // Table A holds the ticket in a ticket cell (no explicit link).
      const a = await createTableViaApi(app, org, "Assets");
      const { field: name } = await createFieldViaApi(app, org, a.id, {
        name: "Name",
        type: "text",
      });
      const { field: cost } = await createFieldViaApi(app, org, a.id, {
        name: "Cost",
        type: "number",
      });
      const { field: tk } = await createFieldViaApi(app, org, a.id, {
        name: "Tickets",
        type: "ticket",
      });
      const hit = await addRowViaApi(app, org, a.id, {
        [name?.id ?? ""]: "Pump P-2",
        [cost?.id ?? ""]: 1200,
        [tk?.id ?? ""]: [own.id],
      });
      await addRowViaApi(app, org, a.id, { [name?.id ?? ""]: "Unrelated" });

      // Table B links a row explicitly.
      const b = await createTableViaApi(app, org, "Vendors");
      const { field: vendor } = await createFieldViaApi(app, org, b.id, {
        name: "Vendor",
        type: "text",
      });
      const linkedRow = await addRowViaApi(app, org, b.id, {
        [vendor?.id ?? ""]: "Acme",
      });
      expect(
        (
          await json(
            `/${b.id}/rows/${linkedRow.id}/tickets?taskId=${own.id}`,
            "POST",
          )
        ).status,
      ).toBe(200);

      const body = await included();
      const byId = Object.fromEntries(body.tables.map((t) => [t.tableId, t]));
      expect(Object.keys(byId).sort()).toEqual([a.id, b.id].sort());
      expect(byId[a.id].rows).toHaveLength(1);
      expect(byId[a.id].rows[0]).toMatchObject({
        id: hit.id,
        linked: false,
        values: { [name?.id ?? ""]: "Pump P-2", [cost?.id ?? ""]: 1200 },
      });
      expect(byId[a.id].fields.map((f) => f.name)).toEqual([
        "Name",
        "Cost",
        "Tickets",
      ]);
      expect(byId[a.id].tickets[own.id]?.key).toBe("KFL-7");
      expect(byId[a.id].canEdit).toBe(true);
      expect(byId[b.id].rows[0]).toMatchObject({
        id: linkedRow.id,
        linked: true,
      });

      // Trashed tables drop out.
      await db
        .update(schema.dataTableTable)
        .set({ deletedAt: new Date() })
        .where(eq(schema.dataTableTable.id, b.id));
      expect((await included()).tables.map((t) => t.tableId)).toEqual([a.id]);

      // A plain member: view-only tables are read-only, hidden ones vanish.
      await db
        .update(schema.organizationMemberTable)
        .set({ role: "member" })
        .where(eq(schema.organizationMemberTable.userId, member.user.id));
      await db
        .update(schema.dataTableTable)
        .set({ orgPrivilege: "view" })
        .where(eq(schema.dataTableTable.id, a.id));
      expect((await included()).tables[0]?.canEdit).toBe(false);
      await db
        .update(schema.dataTableTable)
        .set({ orgPrivilege: "none" })
        .where(eq(schema.dataTableTable.id, a.id));
      expect((await included()).tables).toEqual([]);
    });

    it("enforces board scope and single-ticket fields; options follow scope", async () => {
      const org = member.organization.id;
      const table = await createTableViaApi(app, org, "Scoped");
      const ops = await seedTask(org, "Ops ticket", "ops");
      const eng = await seedTask(org, "Eng ticket", "eng");
      const other = await createOrganizationMember();
      const foreignBoard = await seedTask(other.organization.id, "x", "zz");

      // A foreign org's board can't be named in the scope.
      const bad = await createFieldViaApi(app, org, table.id, {
        name: "Bad",
        type: "ticket",
        options: { boardIds: [foreignBoard.boardId] },
      });
      expect(bad.response.status).toBe(400);

      const { field } = await createFieldViaApi(app, org, table.id, {
        name: "Ops ticket",
        type: "ticket",
        options: { boardIds: [ops.boardId], multiple: false },
      });
      const row = await addRowViaApi(app, org, table.id);
      const put = (value: unknown) =>
        app.request(
          `/api/data-table/organization/${org}/${table.id}/rows/${row.id}/cells/${field?.id}`,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ value }),
          },
        );
      expect((await put([eng.id])).status).toBe(400); // off-scope board
      expect((await put([ops.id, ops.id])).status).toBe(200); // dedupes to one
      const ops2 = await seedTask(org, "Ops second", "ops2");
      expect((await put([ops.id, ops2.id])).status).toBe(400); // single

      const options = (await (
        await app.request(
          `/api/data-table/organization/${org}/${table.id}/fields/${field?.id}/tickets?q=`,
        )
      ).json()) as { id: string }[];
      expect(options.map((o) => o.id)).toEqual([ops.id]);
      const byKey = (await (
        await app.request(
          `/api/data-table/organization/${org}/${table.id}/fields/${field?.id}/tickets?q=OPS-7`,
        )
      ).json()) as { id: string }[];
      expect(byKey.map((o) => o.id)).toEqual([ops.id]);
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
    it("hides dashboards behind their own flag while tables stay available", async () => {
      const organizationId = member.organization.id;
      const base = `/api/data-table/organization/${organizationId}`;
      expect((await app.request(`${base}/dashboards`)).status).toBe(404);
      expect(
        (
          await app.request(`${base}/dashboards`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "Ops" }),
          })
        ).status,
      ).toBe(404);
      expect((await app.request(base)).status).toBe(200);
      await db
        .update(schema.organizationTable)
        .set({ dashboardsEnabled: true, tablesEnabled: false })
        .where(eq(schema.organizationTable.id, organizationId));
      // Dashboards read table data, so the Tables flag still gates them.
      expect((await app.request(`${base}/dashboards`)).status).toBe(404);
    });

    it("round-trips CRUD and validates panel table references", async () => {
      const organizationId = member.organization.id;
      await db
        .update(schema.organizationTable)
        .set({ dashboardsEnabled: true })
        .where(eq(schema.organizationTable.id, organizationId));
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
