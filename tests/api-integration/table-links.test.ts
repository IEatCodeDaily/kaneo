import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { migrateLegacyLinks } from "../../apps/api/src/data-table/migrate-links";
import db, { getDatabasePool, schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createOrganizationMember } from "./helpers/fixtures";

describe("table links: real PostgreSQL graph", () => {
  let member: Awaited<ReturnType<typeof createOrganizationMember>>;
  let app: ReturnType<typeof createApp>["app"];
  const root = (table = "") =>
    `/api/data-table/organization/${member.organization.id}${table ? `/${table}` : ""}`;
  const request = (path: string, body: unknown = {}, method = "POST") =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const json = async (response: Promise<Response>) => {
    const r = await response;
    const body = await r.text();
    expect(r.status, body).toBe(200);
    return JSON.parse(body);
  };
  const table = async (name: string) => {
    const t = await json(request(root(), { name }));
    const field = await json(
      request(`${root(t.id)}/fields`, { name: "Name", type: "text" }),
    );
    return { ...t, primary: field.id };
  };
  const row = (t: { id: string; primary: string }, name: string, values = {}) =>
    json(
      request(`${root(t.id)}/rows`, {
        values: { [t.primary]: name, ...values },
      }),
    );
  const link = (source: string, target: string, cardinality: string) =>
    json(
      request(`${root(source)}/fields`, {
        name: "Related",
        type: "link",
        options: { targetTableId: target, cardinality },
      }),
    );
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
  it.each(["many-to-one", "one-to-many", "many-to-many", "one-to-one"])(
    "%s creates inverse, writes both ways and cascades without deleting business records",
    async (cardinality) => {
      const source = await table("Invoice");
      const target = await table("Customer");
      const field = await link(source.id, target.id, cardinality);
      const a = await row(source, "INV-001");
      const b = await row(target, "CUST-001");
      const path = `${root(source.id)}/rows/${a.id}/links/${field.id}`;
      await json(request(path, { add: [b.id, b.id] }));
      const inverse = await json(
        Promise.resolve(app.request(`${root(target.id)}/rows/${b.id}`)),
      );
      expect(inverse.row.values[field.inverseField.id].records[0].label).toBe(
        "INV-001",
      );
      const events = await (
        await app.request(`${root(target.id)}/activity`)
      ).json();
      expect(
        events.some((event: { type: string }) => event.type === "link_added"),
      ).toBe(true);
      const constraints = await db.execute(
        sql`SELECT contype FROM pg_constraint WHERE conrelid = ${`kaneo_tables.l_${field.relation.id}`}::regclass`,
      );
      expect(
        constraints.rows.filter((item) => item.contype === "f"),
      ).toHaveLength(2);
      const indexes = await db.execute(
        sql`SELECT indexdef FROM pg_indexes WHERE schemaname = 'kaneo_tables' AND tablename = ${`l_${field.relation.id}`}`,
      );
      expect(indexes.rows.length).toBeGreaterThanOrEqual(3);
      await json(
        request(
          `${root(target.id)}/rows/${b.id}/links/${field.inverseField.id}`,
          { remove: [a.id] },
        ),
      );
      expect((await json(Promise.resolve(app.request(path)))).records).toEqual(
        [],
      );
      await json(request(path, { add: [b.id] }));
      expect(
        (
          await app.request(`${root(target.id)}/rows/${b.id}`, {
            method: "DELETE",
          })
        ).status,
      ).toBe(200);
      expect(
        (await json(Promise.resolve(app.request(path)))).records[0].deleted,
      ).toBe(true);
      await json(request(`${root(target.id)}/rows/${b.id}/purge`));
      expect((await json(Promise.resolve(app.request(path)))).records).toEqual(
        [],
      );
      expect(
        (await app.request(`${root(source.id)}/rows/${a.id}`)).status,
      ).toBe(200);
    },
  );
  it.each(["many-to-one", "one-to-many", "one-to-one"])(
    "%s rejects racing unique-side writes in separate database transactions",
    async (cardinality) => {
      const source = await table("Source");
      const target = await table("Target");
      const field = await link(source.id, target.id, cardinality);
      const a = await row(source, "A");
      const b = await row(source, "B");
      const x = await row(target, "X");
      const y = await row(target, "Y");
      const clients = await Promise.all([
        getDatabasePool().connect(),
        getDatabasePool().connect(),
      ]);
      const first = clients[0]!;
      const second = clients[1]!;
      try {
        await first.query("BEGIN");
        await second.query("BEGIN");
        const insert = `INSERT INTO kaneo_tables."l_${field.relation.id}" (source_row_id,target_row_id) VALUES ($1,$2)`;
        await first.query(insert, [a.id, x.id]);
        const conflict = second
          .query(
            insert,
            cardinality === "many-to-one" ? [a.id, y.id] : [b.id, x.id],
          )
          .catch((error) => error);
        await first.query("COMMIT");
        expect((await conflict).code).toBe("23505");
        await second.query("ROLLBACK");
      } finally {
        first.release();
        second.release();
      }
      const response = await request(
        `${root(cardinality === "many-to-one" ? source.id : target.id)}/rows/${cardinality === "many-to-one" ? a.id : x.id}/links/${cardinality === "many-to-one" ? field.id : field.inverseField.id}`,
        { add: [cardinality === "many-to-one" ? y.id : b.id] },
      );
      expect(response.status).toBe(409);
    },
  );
  it("reserves trashed one-only slots until unlink, allows self-links except same-row edges, and rejects stale replacement", async () => {
    const t = await table("PO");
    const a = await row(t, "A");
    const b = await row(t, "B");
    const c = await row(t, "C");
    const f = await link(t.id, t.id, "one-to-one");
    const path = (id: string) => `${root(t.id)}/rows/${id}/links/${f.id}`;
    expect((await request(path(a.id), { add: [a.id] })).status).toBe(400);
    await json(request(path(a.id), { add: [b.id] }));
    const before = await (await app.request(path(a.id))).json();
    await app.request(`${root(t.id)}/rows/${a.id}`, { method: "DELETE" });
    expect((await request(path(c.id), { add: [b.id] })).status).toBe(409);
    await json(request(`${root(t.id)}/rows/${a.id}/restore`));
    await json(request(path(a.id), { remove: [b.id] }));
    expect(
      (
        await request(
          `${root(t.id)}/rows/${a.id}/cells/${f.id}`,
          { value: [c.id], ifVersion: before.version },
          "PUT",
        )
      ).status,
    ).toBe(409);
    await json(request(path(c.id), { add: [b.id] }));
  });
  it("rejects cross-org metadata, target-view-only graph writes, and hides all target data after revocation", async () => {
    const a = await table("A");
    const b = await table("B");
    const f = await link(a.id, b.id, "many-to-many");
    const x = await row(a, "A-value");
    const y = await row(b, "SECRET PRIMARY");
    await json(
      request(`${root(a.id)}/rows/${x.id}/links/${f.id}`, { add: [y.id] }),
    );
    const foreign = await createOrganizationMember({ role: "owner" });
    const [other] = await db
      .insert(schema.dataTableTable)
      .values({
        organizationId: foreign.organization.id,
        name: "Foreign",
        slug: `foreign-${randomUUID()}`,
      })
      .returning();
    expect(
      (
        await request(`${root(a.id)}/fields`, {
          name: "No",
          type: "link",
          options: { targetTableId: other!.id },
        })
      ).status,
    ).toBe(404);
    const editor = await createOrganizationMember({ role: "member" });
    await db.insert(schema.organizationMemberTable).values({
      organizationId: member.organization.id,
      userId: editor.user.id,
      role: "member",
      joinedAt: new Date(),
    });
    await db
      .update(schema.dataTableTable)
      .set({ orgPrivilege: "edit" })
      .where(eq(schema.dataTableTable.id, a.id));
    await db
      .update(schema.dataTableTable)
      .set({ orgPrivilege: "view" })
      .where(eq(schema.dataTableTable.id, b.id));
    mockAuthenticatedSession(editor.user);
    expect(
      (
        await request(`${root(a.id)}/rows/${x.id}/links/${f.id}`, {
          remove: [y.id],
        })
      ).status,
    ).toBe(403);
    await db
      .update(schema.dataTableTable)
      .set({ orgPrivilege: "none" })
      .where(eq(schema.dataTableTable.id, b.id));
    const response = await app.request(root(a.id));
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).not.toContain("SECRET PRIMARY");
    expect(body).not.toContain(y.id);
    expect(body).not.toContain(b.id);
    expect(
      await (await app.request(`${root(a.id)}/activity`)).text(),
    ).not.toContain("SECRET PRIMARY");
  });
  it("migrates legacy arrays transactionally, dedupes order, preserves blocked bytes, and is repeatable", async () => {
    const a = await table("Legacy");
    const b = await table("Target");
    const x = await row(a, "A");
    const y = await row(b, "B");
    const [field] = await db
      .insert(schema.dataTableFieldTable)
      .values({
        tableId: a.id,
        name: "Old",
        type: "link",
        options: { targetTableId: b.id },
        position: 1,
      })
      .returning();
    await db.execute(
      sql.raw(
        `ALTER TABLE kaneo_tables."t_${a.id}" ADD COLUMN "c_${field!.id}" jsonb`,
      ),
    );
    await db.execute(
      sql`UPDATE ${sql.raw(`kaneo_tables."t_${a.id}"`)} SET ${sql.identifier(`c_${field!.id}`)} = ${JSON.stringify([y.id, y.id])}::jsonb WHERE id = ${x.id}`,
    );
    expect((await migrateLegacyLinks(member.user.id))[0]?.status).toBe("ready");
    expect((await migrateLegacyLinks(member.user.id, true))[0]?.edges).toBe(1);
    expect(await migrateLegacyLinks(member.user.id, true)).toEqual([]);
    const body = await (await app.request(root(a.id))).json();
    expect(body.rows[0].values[field!.id].records[0].label).toBe("B");
    const [bad] = await db
      .insert(schema.dataTableFieldTable)
      .values({
        tableId: a.id,
        name: "Bad",
        type: "link",
        options: { targetTableId: b.id },
      })
      .returning();
    await db.execute(
      sql.raw(
        `ALTER TABLE kaneo_tables."t_${a.id}" ADD COLUMN "c_${bad!.id}" jsonb DEFAULT '["missing"]'::jsonb`,
      ),
    );
    expect((await migrateLegacyLinks(member.user.id, true))[0]?.status).toBe(
      "blocked",
    );
    const raw = await db.execute(
      sql`SELECT ${sql.identifier(`c_${bad!.id}`)} AS value FROM ${sql.raw(`kaneo_tables."t_${a.id}"`)}`,
    );
    expect(raw.rows[0]?.value).toEqual(["missing"]);
  });
  it("paginates beyond the grid ceiling and previews three of 37 without losing totals or full-label search", async () => {
    const a = await table("Parent");
    const b = await table("Child");
    const f = await link(a.id, b.id, "many-to-many");
    const x = await row(a, "Parent");
    await db.execute(
      sql`INSERT INTO ${sql.raw(`kaneo_tables."t_${b.id}"`)} (id, position, ${sql.identifier(`c_${b.primary}`)}) SELECT 'record' || n, n, 'Child ' || lpad(n::text, 4, '0') FROM generate_series(1, 1100) AS n`,
    );
    const options = await json(
      Promise.resolve(
        app.request(`${root(a.id)}/fields/${f.id}/link-options?q=1100`),
      ),
    );
    expect(options.records).toEqual([
      { id: "record1100", label: "Child 1100" },
    ]);
    await json(
      request(`${root(a.id)}/rows/${x.id}/links/${f.id}`, {
        add: Array.from({ length: 37 }, (_, i) => `record${i + 1}`),
      }),
    );
    const detail = await json(
      Promise.resolve(app.request(`${root(a.id)}/rows/${x.id}`)),
    );
    const cell = detail.row.values[f.id];
    expect(cell.records).toHaveLength(3);
    expect(cell.total).toBe(37);
    expect(cell.hasMore).toBe(true);
    expect(cell.searchText).toContain("Child 0037");
    const page = await json(
      Promise.resolve(app.request(`${root(a.id)}/fields/${f.id}/link-options`)),
    );
    expect(page.records).toHaveLength(50);
    expect(page.nextCursor).toEqual(expect.any(String));
    const second = await json(
      Promise.resolve(
        app.request(
          `${root(a.id)}/fields/${f.id}/link-options?cursor=${encodeURIComponent(page.nextCursor)}`,
        ),
      ),
    );
    expect(second.records[0].label).toBe("Child 0051");
    expect(
      (
        await app.request(
          `${root(a.id)}/fields/${f.id}/link-options?q=different&cursor=${encodeURIComponent(page.nextCursor)}`,
        )
      ).status,
    ).toBe(400);
  });
  it("rolls back invalid row+edge creation, paired DDL failures, and mirrored audit failures", async () => {
    const a = await table("Invoice");
    const b = await table("Customer");
    const x = await row(a, "INV");
    const f = await link(a.id, b.id, "many-to-one");
    const required = await json(
      request(`${root(b.id)}/fields`, {
        name: "Required",
        type: "text",
        options: { required: true },
      }),
    );
    expect(
      (
        await request(`${root(a.id)}/rows/${x.id}/links/${f.id}/new-row`, {
          values: { [b.primary]: "Invalid" },
        })
      ).status,
    ).toBe(400);
    expect((await json(Promise.resolve(app.request(root(b.id))))).rows).toEqual(
      [],
    );
    expect(
      (
        await request(`${root(a.id)}/rows`, {
          values: { [a.primary]: "Invalid", [f.id]: ["missing"] },
        })
      ).status,
    ).toBe(400);
    expect(
      (await json(Promise.resolve(app.request(root(a.id))))).rows,
    ).toHaveLength(1);
    const y = await row(b, "Valid", { [required.id]: "Present" });
    await db.execute(
      sql.raw(
        "CREATE FUNCTION reject_link_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type = 'link_added' THEN RAISE EXCEPTION 'injected link audit failure'; END IF; RETURN NEW; END $$",
      ),
    );
    await db.execute(
      sql.raw(
        "CREATE TRIGGER reject_link_audit BEFORE INSERT ON data_table_activity FOR EACH ROW EXECUTE FUNCTION reject_link_audit()",
      ),
    );
    try {
      expect(
        (
          await request(`${root(a.id)}/rows/${x.id}/links/${f.id}`, {
            add: [y.id],
          })
        ).status,
      ).toBe(500);
    } finally {
      await db.execute(
        sql.raw(
          "DROP TRIGGER reject_link_audit ON data_table_activity; DROP FUNCTION reject_link_audit()",
        ),
      );
    }
    expect(
      (
        await json(
          Promise.resolve(
            app.request(`${root(a.id)}/rows/${x.id}/links/${f.id}`),
          ),
        )
      ).records,
    ).toEqual([]);
    await db.execute(
      sql.raw(
        "CREATE FUNCTION reject_link_ddl() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.statement LIKE '%relation %' THEN RAISE EXCEPTION 'injected link DDL failure'; END IF; RETURN NEW; END $$",
      ),
    );
    await db.execute(
      sql.raw(
        "CREATE TRIGGER reject_link_ddl BEFORE INSERT ON data_table_ddl_log FOR EACH ROW EXECUTE FUNCTION reject_link_ddl()",
      ),
    );
    try {
      expect(
        (
          await request(`${root(a.id)}/fields`, {
            name: "Rejected pair",
            type: "link",
            options: { targetTableId: b.id },
          })
        ).status,
      ).toBe(500);
    } finally {
      await db.execute(
        sql.raw(
          "DROP TRIGGER reject_link_ddl ON data_table_ddl_log; DROP FUNCTION reject_link_ddl()",
        ),
      );
    }
    expect(await db.select().from(schema.dataTableRelationTable)).toHaveLength(
      1,
    );
    expect(
      (await db.select().from(schema.dataTableFieldTable)).filter(
        (field) => field.name === "Rejected pair",
      ),
    ).toHaveLength(0);
  });
  it("trashes and restores both fields together, preserving retained membership, then purges the junction before its table", async () => {
    const a = await table("A");
    const b = await table("B");
    const f = await link(a.id, b.id, "one-to-one");
    const x = await row(a, "A");
    const y = await row(b, "B");
    await json(
      request(`${root(a.id)}/rows/${x.id}/links/${f.id}`, { add: [y.id] }),
    );
    expect(
      (
        await app.request(`${root(b.id)}/fields/${f.inverseField.id}`, {
          method: "DELETE",
        })
      ).status,
    ).toBe(200);
    expect(
      (await json(Promise.resolve(app.request(root(a.id))))).fields.map(
        (field: { id: string }) => field.id,
      ),
    ).not.toContain(f.id);
    await json(request(`${root(a.id)}/fields/${f.id}/restore`));
    expect(
      (
        await json(
          Promise.resolve(
            app.request(`${root(a.id)}/rows/${x.id}/links/${f.id}`),
          ),
        )
      ).records[0].label,
    ).toBe("B");
    await app.request(root(b.id), { method: "DELETE" });
    const suspended = await json(Promise.resolve(app.request(root(a.id))));
    expect(suspended.rows[0].values[f.id].status).toBe("unavailable");
    await json(request(`${root(b.id)}/purge`));
    const physical = await db.execute(
      sql`SELECT to_regclass(${`kaneo_tables.l_${f.relation.id}`}) AS name`,
    );
    expect(physical.rows[0]?.name).toBeNull();
    expect((await app.request(`${root(a.id)}/rows/${x.id}`)).status).toBe(200);
  });
});
