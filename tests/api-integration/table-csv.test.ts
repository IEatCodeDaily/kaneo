import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { parseCsv } from "../../apps/api/src/data-table/csv";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createOrganizationMember } from "./helpers/fixtures";

describe("CSV: server-authoritative batches and full exports", () => {
  let member: Awaited<ReturnType<typeof createOrganizationMember>>;
  let app: ReturnType<typeof createApp>["app"];
  const root = (id = "") =>
    `/api/data-table/organization/${member.organization.id}${id ? `/${id}` : ""}`;
  const request = (path: string, body: unknown) =>
    app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const json = async (promise: Promise<Response>) => {
    const response = await promise;
    const body = await response.text();
    expect(response.status, body).toBe(200);
    return JSON.parse(body);
  };
  const table = async (name: string) => {
    const t = await json(request(root(), { name }));
    const f = await json(
      request(`${root(t.id)}/fields`, { name: "Name", type: "text" }),
    );
    return { id: t.id as string, primary: f.id as string };
  };
  const field = (id: string, name: string, type: string, options?: unknown) =>
    json(request(`${root(id)}/fields`, { name, type, options }));
  const row = (t: { id: string; primary: string }, name: string) =>
    json(request(`${root(t.id)}/rows`, { values: { [t.primary]: name } }));
  const load = async (id: string) =>
    (await (await app.request(root(id))).json()).rows;
  const csv = (
    id: string,
    text: string,
    mapping: (string | null)[],
    preview = false,
    offset = 0,
  ) =>
    json(
      request(`${root(id)}/row-import`, {
        csv: text,
        mapping,
        preview,
        offset,
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
  it("keeps unknown middle headers in place, previews without writes, and round-trips quotes/newlines/Unicode and raw numbers", async () => {
    const t = await table("Round trip");
    const amount = await field(t.id, "Amount", "currency", { code: "IDR" });
    const text =
      'Name,Ignored,Amount\r\n"café 東京, says ""hi""\r\nsecond line",DO NOT SHIFT,1234.56\r\n';
    expect(
      (await csv(t.id, text, [t.primary, null, amount.id], true)).errors,
    ).toEqual([]);
    expect(await load(t.id)).toHaveLength(0);
    expect((await csv(t.id, text, [t.primary, null, amount.id])).created).toBe(
      1,
    );
    const exported = await (
      await request(`${root(t.id)}/row-export`, { limit: 1, offset: 999 })
    ).text();
    expect(parseCsv(exported)[1]?.cells).toEqual([
      'café 東京, says "hi"\r\nsecond line',
      "1234.56",
    ]);
    expect((await csv(t.id, exported, [t.primary, amount.id])).created).toBe(1);
    const rows = await load(t.id);
    expect(rows[0].values).toEqual(rows[1].values);
  });
  it("reports source physical lines and fields, rejects entire batches, and commits independent batches", async () => {
    const t = await table("Atomic");
    const amount = await field(t.id, "Amount", "number");
    const text = 'Name,Amount\n"two\nlines",3\nbad,nope\n';
    for (const preview of [true, false]) {
      const result = await csv(t.id, text, [t.primary, amount.id], preview);
      expect(result.created).toBe(0);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ line: 4, field: "Amount" }),
      );
      expect(result.errors).toContainEqual(
        expect.objectContaining({ line: 2, field: "Batch" }),
      );
      expect(await load(t.id)).toHaveLength(0);
    }
    const data = `Name,Amount\n${Array.from({ length: 51 }, (_, i) => `row${i},${i === 50 ? "invalid" : i}`).join("\n")}`;
    expect((await csv(t.id, data, [t.primary, amount.id])).created).toBe(50);
    const failed = await csv(t.id, data, [t.primary, amount.id], false, 50);
    expect(failed.created).toBe(0);
    expect(failed.errors[0]).toMatchObject({ line: 52, field: "Amount" });
    expect(await load(t.id)).toHaveLength(50);
  });
  it("rejects malformed CSV, duplicate mappings, missing required fields and invalid booleans without silent loss", async () => {
    const t = await table("Validation");
    const flag = await field(t.id, "Flag", "checkbox");
    const required = await field(t.id, "Required", "text", { required: true });
    const result = await csv(t.id, "Name,Flag\nx,maybe", [t.primary, flag.id]);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ line: 2, field: "Flag" }),
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({ line: 2, field: "Required" }),
    );
    expect(
      (
        await request(`${root(t.id)}/row-import`, {
          csv: 'Name\n"open',
          mapping: [t.primary],
          preview: false,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(`${root(t.id)}/row-import`, {
          csv: "Name,Other\nx,y",
          mapping: [t.primary, t.primary],
        })
      ).status,
    ).toBe(400);
    expect(
      (await csv(t.id, "Name,Required\nx,y,extra", [t.primary, required.id]))
        .errors[0],
    ).toMatchObject({ line: 2, field: "CSV" });
    expect(await load(t.id)).toHaveLength(0);
  });
  it("neutralises formula-leading cells and headers and reimports escaped text", async () => {
    const t = await table("Formula");
    const extra = await field(t.id, "=header", "text");
    const values = [
      "=1+1",
      "+SUM(A1)",
      "-9",
      "-2+3",
      "@user",
      "\tformula",
      "\rformula",
      "'=literal",
      "'plain",
      "safe",
    ];
    for (const value of values)
      await json(
        request(`${root(t.id)}/rows`, {
          values: { [t.primary]: value, [extra.id]: value },
        }),
      );
    const response = await request(`${root(t.id)}/row-export`, {});
    expect(response.status).toBe(200);
    const exported = await response.text();
    const parsed = parseCsv(exported);
    expect(parsed[0]?.cells[1]).toBe("'=header");
    expect(parsed.slice(1).map((r) => r.cells[0])).toEqual(
      // Plain numbers like -9 stay machine-readable; only formula text is escaped.
      values.map((v) => (v === "safe" || v === "-9" ? v : `'${v}`)),
    );
    expect((await csv(t.id, exported, [t.primary, extra.id])).created).toBe(
      values.length,
    );
    const rows = await load(t.id);
    expect(
      rows
        .slice(values.length)
        .map((r: { values: Record<string, unknown> }) => r.values[t.primary]),
    ).toEqual(values);
  });
  it("resolves exact case-insensitive link primary values and exports all links, never preview truncation or ids", async () => {
    const source = await table("Invoices");
    const target = await table("Customers");
    const link = await field(source.id, "Customer", "link", {
      targetTableId: target.id,
      cardinality: "many-to-many",
    });
    for (const name of ["Acme", "Beta", "東京", "Café"])
      await row(target, name);
    const result = await csv(
      source.id,
      'Name,Customer\nINV-1,"acme, BETA, 東京, café"',
      [source.primary, link.id],
    );
    expect(result).toMatchObject({ created: 1, errors: [] });
    const data = await load(source.id);
    expect(data[0].values[link.id].total).toBe(4);
    const exported = await (
      await request(`${root(source.id)}/row-export`, {})
    ).text();
    expect(parseCsv(exported)[1]?.cells).toEqual([
      "INV-1",
      "Acme, Beta, 東京, Café",
    ]);
    expect(exported).not.toContain(target.id);
  });
  it("reports missing and ambiguous links by line and rejects one-only multiples and occupied inverse slots", async () => {
    const source = await table("Source");
    const target = await table("Target");
    const link = await field(source.id, "Related", "link", {
      targetTableId: target.id,
      cardinality: "one-to-one",
    });
    await row(target, "Duplicate");
    await row(target, "DUPLICATE");
    await row(target, "Unique");
    await row(target, "Other");
    for (const [value, message] of [
      ["Missing", "not found"],
      ["duplicate", "ambiguous"],
      ["Unique, Other", "only one"],
    ]) {
      const result = await csv(source.id, `Name,Related\nx,"${value}"`, [
        source.primary,
        link.id,
      ]);
      expect(result.created).toBe(0);
      expect(result.errors[0]).toMatchObject({
        line: 2,
        field: "Related",
        message: expect.stringContaining(message!),
      });
    }
    expect(await load(source.id)).toHaveLength(0);
    expect(
      (
        await csv(source.id, "Name,Related\nx,Unique", [
          source.primary,
          link.id,
        ])
      ).created,
    ).toBe(1);
    expect(
      (
        await csv(source.id, "Name,Related\ny,Unique", [
          source.primary,
          link.id,
        ])
      ).errors[0],
    ).toMatchObject({ line: 2, field: "Related" });
    expect(await load(source.id)).toHaveLength(1);
  });
  it("rejects cross-org paths, source view-only writes, and link targets without mutual edit/view access", async () => {
    const source = await table("Source");
    const target = await table("Hidden target");
    const link = await field(source.id, "Related", "link", {
      targetTableId: target.id,
      cardinality: "many-to-many",
    });
    await row(target, "SECRET");
    const foreign = await createOrganizationMember({ role: "owner" });
    const body = {
      csv: "Name,Related\nx,SECRET",
      mapping: [source.primary, link.id],
      preview: false,
    };
    expect(
      (
        await request(
          `/api/data-table/organization/${foreign.organization.id}/${source.id}/row-import`,
          body,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          `/api/data-table/organization/${foreign.organization.id}/${source.id}/row-export`,
          {},
        )
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
      .set({ orgPrivilege: "view" })
      .where(eq(schema.dataTableTable.id, source.id));
    await db
      .update(schema.dataTableTable)
      .set({ orgPrivilege: "view" })
      .where(eq(schema.dataTableTable.id, target.id));
    mockAuthenticatedSession(editor.user);
    expect((await request(`${root(source.id)}/row-import`, body)).status).toBe(
      404,
    );
    await db
      .update(schema.dataTableTable)
      .set({ orgPrivilege: "edit" })
      .where(eq(schema.dataTableTable.id, source.id));
    expect((await request(`${root(source.id)}/row-import`, body)).status).toBe(
      403,
    );
    await db
      .update(schema.dataTableTable)
      .set({ orgPrivilege: "none" })
      .where(eq(schema.dataTableTable.id, target.id));
    expect((await request(`${root(source.id)}/row-import`, body)).status).toBe(
      404,
    );
    const exported = await request(`${root(source.id)}/row-export`, {});
    expect(exported.status).toBe(404);
    expect(await exported.text()).not.toContain("SECRET");
    const count = await db.execute(
      sql.raw(`SELECT count(*)::int AS n FROM kaneo_tables."t_${source.id}"`),
    );
    expect(count.rows[0]?.n).toBe(0);
  });
});
