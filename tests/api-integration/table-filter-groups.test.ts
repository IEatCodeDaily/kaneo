import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createOrganizationMember } from "./helpers/fixtures";

describe("typed nested table filters (real PostgreSQL)", () => {
  let member: Awaited<ReturnType<typeof createOrganizationMember>>;
  let app: ReturnType<typeof createApp>["app"];
  const request = (path: string, body: unknown, method = "POST") =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const json = async (response: Promise<Response>) => {
    const r = await response;
    const text = await r.text();
    expect(r.status, text).toBe(200);
    return JSON.parse(text);
  };
  const root = (id = "") =>
    `/api/data-table/organization/${member.organization.id}${id ? `/${id}` : ""}`;
  const group = (...children: unknown[]) => ({ conjunction: "and", children });
  const condition = (fieldId: string, op: string, value?: unknown) => ({
    fieldId,
    op,
    ...(value === undefined ? {} : { value }),
  });
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
  it("evaluates typed AND/OR across pages, totals, groups, summaries and CSV; distinguishes null/blank/zero/false and UTC boundaries", async () => {
    const table = await json(request(root(), { name: "Filters" }));
    const fields: Record<string, string> = {};
    for (const [name, type, options] of [
      ["Name", "text"],
      ["Amount", "number"],
      ["When", "datetime"],
      ["Day", "date"],
      ["Done", "checkbox"],
      ["Owner", "user"],
      [
        "Status",
        "select",
        {
          choices: ["Open", "Review", "Closed"].map((id) => ({
            id,
            label: id,
            color: "#123456",
          })),
        },
      ],
      [
        "Tags",
        "multiselect",
        {
          choices: ["a", "b", "c"].map((id) => ({
            id,
            label: id,
            color: "#123456",
          })),
        },
      ],
    ] as const)
      fields[name] = (
        await json(request(`${root(table.id)}/fields`, { name, type, options }))
      ).id;
    const physical = sql.raw(`kaneo_tables."t_${table.id}"`);
    const col = (name: string) => sql.identifier(`c_${fields[name]}`);
    await db.execute(sql`INSERT INTO ${physical} (id, position, created_by, ${col("Name")}, ${col("Amount")}, ${col("Status")}, ${col("Done")}, ${col("When")}, ${col("Day")}, ${col("Owner")}, ${col("Tags")})
      SELECT 'r' || lpad(n::text, 4, '0'), n, ${member.user.id},
      CASE WHEN n = 1 THEN '' WHEN n = 2 THEN NULL ELSE 'Batch ' || n END,
      CASE WHEN n = 1 THEN 0 WHEN n = 2 THEN NULL WHEN n > 1000 THEN 200 ELSE 100 END,
      CASE WHEN n % 3 = 0 THEN 'Closed' WHEN n % 3 = 1 THEN 'Open' ELSE 'Review' END,
      CASE WHEN n = 1 THEN false WHEN n = 2 THEN NULL ELSE true END,
      CASE WHEN n = 1 THEN '2026-03-15T00:00:00Z'::timestamptz WHEN n = 2 THEN '2026-03-15T23:59:59.999Z'::timestamptz WHEN n = 3 THEN '2026-03-16T00:00:00Z'::timestamptz ELSE NULL END,
      CASE WHEN n <= 2 THEN '2026-03-15'::date WHEN n = 3 THEN '2026-03-16'::date ELSE NULL END,
      CASE WHEN n = 1 THEN ${member.user.id} ELSE NULL END,
      CASE WHEN n = 1 THEN '["a","b"]'::jsonb WHEN n = 2 THEN '["a"]'::jsonb WHEN n = 3 THEN NULL ELSE '[]'::jsonb END
      FROM generate_series(1,1005) n`);
    const post = (filters: unknown, suffix = "row-query", extras = {}) =>
      request(`${root(table.id)}/${suffix}`, { filters, ...extras });
    const query = (filters: unknown, extras = {}) =>
      json(post(filters, "row-query", extras));
    const ids = async (filters: unknown) =>
      (await query(filters)).rows.map((row: { id: string }) => row.id);
    const expression = group(
      {
        conjunction: "or",
        children: [
          condition(fields.Status, "eq", "Open"),
          condition(fields.Status, "eq", "Review"),
        ],
      },
      condition(fields.Amount, "gt", 100),
    );
    const result = await query(expression, {
      limit: 1,
      groupFieldId: fields.Status,
      summaries: { [fields.Amount]: "sum" },
    });
    expect(result.total).toBe(3);
    expect(result.tableTotal).toBe(1005);
    expect(result.rows).toHaveLength(1);
    expect(result.summaries[fields.Amount]).toBe(600);
    expect(
      result.groups.reduce((n: number, g: { total: number }) => n + g.total, 0),
    ).toBe(3);
    const allIds = [...(await ids(expression))];
    expect(allIds).toEqual(["r1001", "r1003", "r1004"]);
    const pageTwo = await query(expression, { limit: 1, offset: 1 });
    expect(pageTwo.rows[0].id).toBe(allIds[1]);
    const csv = await post(expression, "row-export", { limit: 1, offset: 999 });
    expect(csv.status).toBe(200);
    const csvText = await csv.text();
    expect(csvText.split("\r\n")).toHaveLength(4);
    for (const id of allIds)
      expect(csvText).toContain(`Batch ${Number(id.slice(1))}`);
    expect(await ids(group(condition(fields.Amount, "eq", 0)))).toEqual([
      "r0001",
    ]);
    expect(await ids(group(condition(fields.Amount, "isEmpty")))).toEqual([
      "r0002",
    ]);
    expect(await ids(group(condition(fields.Name, "eq", "")))).toEqual([
      "r0001",
    ]);
    expect(await ids(group(condition(fields.Name, "isEmpty")))).toEqual([
      "r0002",
    ]);
    // Negative operators include empty cells: NULL is "not checked".
    expect(await ids(group(condition(fields.Done, "isNotChecked")))).toEqual([
      "r0001",
      "r0002",
    ]);
    expect(
      (await query(group(condition(fields.Name, "isNotEmpty")))).total,
    ).toBe(1004);
    expect(
      (await query(group(condition(fields.Name, "contains", "batch")))).total,
    ).toBe(1003);
    expect(
      await ids(group(condition(fields.Name, "notContains", "Batch"))),
    ).toEqual(["r0001", "r0002"]);
    expect(
      (await query(group(condition(fields.Amount, "neq", 100)))).total,
    ).toBe(7); // 0, NULL and the five 200s
    expect(
      await ids(group(condition(fields.Name, "eq", "' OR TRUE; --"))),
    ).toEqual([]);
    expect(await ids(group(condition(fields.Owner, "isMe")))).toEqual([
      "r0001",
    ]);
    expect((await query(group(condition("__created_by", "isMe")))).total).toBe(
      1005,
    );
    for (const name of ["When", "Day"]) {
      expect(
        await ids(group(condition(fields[name], "eq", "2026-03-15"))),
      ).toEqual(["r0001", "r0002"]);
      expect(
        await ids(group(condition(fields[name], "lte", "2026-03-15"))),
      ).toEqual(["r0001", "r0002"]);
      expect(
        await ids(group(condition(fields[name], "gt", "2026-03-15"))),
      ).toEqual(["r0003"]);
      expect(
        await ids(group(condition(fields[name], "lt", "2026-03-16"))),
      ).toEqual(["r0001", "r0002"]);
      expect(
        await ids(group(condition(fields[name], "gte", "2026-03-16"))),
      ).toEqual(["r0003"]);
    }
    expect(
      await ids(
        group(condition(fields.When, "eq", "2026-03-15T23:59:59.999Z")),
      ),
    ).toEqual(["r0002"]);
    expect(
      await ids(group(condition(fields.Tags, "hasAll", ["a", "b"]))),
    ).toEqual(["r0001"]);
    expect(
      await ids(group(condition(fields.Tags, "hasAny", ["b", "c"]))),
    ).toEqual(["r0001"]);
    expect(
      (await query(group(condition(fields.Tags, "hasNone", ["a"])))).total,
    ).toBe(1003);
    expect((await query(group(condition(fields.Tags, "isEmpty")))).total).toBe(
      1003,
    );
    expect(
      (await query(group(condition(fields.Status, "in", ["Open", "Review"]))))
        .total,
    ).toBe(670);
    expect(
      (await query(group(condition(fields.Status, "notIn", ["Closed"])))).total,
    ).toBe(670);
    expect(
      (await query(group(condition(fields.Status, "neq", "Closed")))).total,
    ).toBe(670);
    const legacy = [
      { fieldId: fields.Status, choiceId: "Review" },
      { fieldId: fields.Amount, min: "101", max: "200" },
    ];
    expect(await ids(legacy)).toEqual(
      await ids(
        group(
          condition(fields.Status, "eq", "Review"),
          condition(fields.Amount, "gt", 100),
          condition(fields.Amount, "lte", 200),
        ),
      ),
    );
    // Relative ranges use database UTC calendar days, including today's boundaries.
    await db.execute(
      sql`UPDATE ${physical} SET ${col("When")} = CASE id WHEN 'r0001' THEN CURRENT_DATE::timestamptz WHEN 'r0002' THEN CURRENT_DATE + interval '1 day' - interval '1 millisecond' WHEN 'r0003' THEN CURRENT_DATE + interval '1 day' ELSE NULL END`,
    );
    expect(await ids(group(condition(fields.When, "pastDays", 0)))).toEqual([
      "r0001",
      "r0002",
    ]);
    expect(await ids(group(condition(fields.When, "nextDays", 1)))).toEqual([
      "r0001",
      "r0002",
      "r0003",
    ]);
    expect(await ids(group(condition(fields.When, "pastDays", 1)))).toEqual([
      "r0001",
      "r0002",
    ]);
    const nested = group(group(group(condition(fields.Amount, "eq", 0))));
    expect(await ids(nested)).toEqual(["r0001"]);
    expect((await post(group(nested))).status).toBe(400);
    expect(
      (
        await query(
          group(
            ...Array.from({ length: 50 }, () =>
              condition(fields.Amount, "eq", 0),
            ),
          ),
        )
      ).total,
    ).toBe(1);
    expect(
      (
        await post(
          group(
            ...Array.from({ length: 51 }, () =>
              condition(fields.Amount, "eq", 0),
            ),
          ),
        )
      ).status,
    ).toBe(400);
    for (const invalid of [
      condition(fields.Amount, "contains", "1"),
      condition(fields.Done, "eq", false),
      condition(fields.Name, "gt", "x"),
      condition(fields.When, "eq", "2026-02-30"),
      condition(fields.When, "pastDays", -1),
      condition(fields.Amount, "eq", "0"),
      condition(fields.Amount, "eq"),
      condition(fields.Status, "in", []),
      condition(fields.Status, "eq", "gone"),
      condition(fields.Name, "invented", "x"),
      condition("missing", "isEmpty"),
    ])
      expect((await post(group(invalid))).status, JSON.stringify(invalid)).toBe(
        400,
      );
    expect(
      (await post([{ fieldId: fields.Name, contains: "", op: "invalid" }]))
        .status,
    ).toBe(400);
    const foreign = await createOrganizationMember({ role: "owner" });
    expect(
      (await post(group(condition(fields.Owner, "eq", foreign.user.id))))
        .status,
    ).toBe(400);
    const otherTable = await json(request(root(), { name: "Other" }));
    const otherField = await json(
      request(`${root(otherTable.id)}/fields`, { name: "Other", type: "text" }),
    );
    expect(
      (await post(group(condition(otherField.id, "isEmpty")))).status,
    ).toBe(400);
    await app.request(`${root(table.id)}/fields/${fields.Name}`, {
      method: "DELETE",
    });
    expect((await post(group(condition(fields.Name, "isEmpty")))).status).toBe(
      400,
    );
    expect((await post([{ fieldId: fields.Name, contains: "" }])).status).toBe(
      400,
    );
    mockAuthenticatedSession(foreign.user);
    for (const suffix of ["row-query", "row-export"])
      expect((await post(expression, suffix)).status).not.toBe(200);
  });
  it("filters live link edges and fails closed when the target is inaccessible", async () => {
    const a = await json(request(root(), { name: "A" }));
    const b = await json(request(root(), { name: "B" }));
    await json(request(`${root(a.id)}/fields`, { name: "Name", type: "text" }));
    await json(request(`${root(b.id)}/fields`, { name: "Name", type: "text" }));
    const f = await json(
      request(`${root(a.id)}/fields`, {
        name: "Related",
        type: "link",
        options: { targetTableId: b.id, cardinality: "many-to-many" },
      }),
    );
    const x = await json(request(`${root(a.id)}/rows`, {}));
    const y = await json(request(`${root(b.id)}/rows`, {}));
    await json(
      request(`${root(a.id)}/rows/${x.id}/links/${f.id}`, { add: [y.id] }),
    );
    const query = (op: string, value?: unknown) =>
      request(`${root(a.id)}/row-query`, {
        filters: group(condition(f.id, op, value)),
      });
    expect((await json(query("hasAny", [y.id]))).total).toBe(1);
    expect((await json(query("isEmpty"))).total).toBe(0);
    expect((await query("hasAll", [y.id])).status).toBe(400);
    expect((await query("hasAny", [x.id])).status).toBe(400);
    await app.request(`${root(b.id)}/rows/${y.id}`, { method: "DELETE" });
    expect((await json(query("isEmpty"))).total).toBe(1);
    expect((await query("hasAny", [y.id])).status).toBe(400);
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
      .where(eq(schema.dataTableTable.id, a.id));
    await db
      .update(schema.dataTableTable)
      .set({ orgPrivilege: "none" })
      .where(eq(schema.dataTableTable.id, b.id));
    mockAuthenticatedSession(editor.user);
    expect((await query("isEmpty")).status).toBe(400);
  });
});
