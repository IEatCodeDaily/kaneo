import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createOrganizationMember } from "./helpers/fixtures";

/**
 * Lookup columns: read-only resolution through an existing link field.
 * Rows read returns the linked table's field values; direct writes and
 * query use (filter/sort/summary) reject.
 */
describe("table lookup columns", () => {
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

  it("resolves target field values on rows read and rejects direct writes", async () => {
    const projects = await json(request(root(), { name: "Project" }));
    const teams = await json(request(root(), { name: "Team" }));
    const projectName = await json(
      request(`${root(projects.id)}/fields`, { name: "Name", type: "text" }),
    );
    const budget = await json(
      request(`${root(projects.id)}/fields`, {
        name: "Budget",
        type: "currency",
        options: { code: "USD" },
      }),
    );
    const _teamName = await json(
      request(`${root(teams.id)}/fields`, { name: "Name", type: "text" }),
    );
    const link = await json(
      request(`${root(teams.id)}/fields`, {
        name: "Projects",
        type: "link",
        options: { targetTableId: projects.id, cardinality: "many-to-many" },
      }),
    );
    const alpha = await json(
      request(`${root(projects.id)}/rows`, {
        values: { [projectName.id]: "Alpha", [budget.id]: 1200 },
      }),
    );
    const beta = await json(
      request(`${root(projects.id)}/rows`, {
        values: { [projectName.id]: "Beta", [budget.id]: 340.5 },
      }),
    );
    const team = await json(request(`${root(teams.id)}/rows`, { values: {} }));

    const createLookup = await request(`${root(teams.id)}/fields`, {
      name: "Project budgets",
      type: "lookup",
      options: { linkFieldId: link.id, targetFieldId: budget.id },
    });
    const lookup = await json(Promise.resolve(createLookup));
    expect(lookup.type).toBe("lookup");
    // The creation response snapshots the target field for cheap formatting.
    expect(lookup.options.targetField).toMatchObject({
      id: budget.id,
      name: "Budget",
      type: "currency",
      options: { code: "USD" },
    });

    await json(
      request(`${root(teams.id)}/rows/${team.id}/links/${link.id}`, {
        add: [alpha.id, beta.id],
      }),
    );

    // Row-query read: resolved values in link order.
    const page = await json(
      Promise.resolve(
        app.request(`${root(teams.id)}/row-query`, {
          method: "POST",
          body: JSON.stringify({}),
        }),
      ),
    );
    expect(page.rows[0].values[lookup.id]).toEqual([1200, 340.5]);

    // Single-row read (row sheet path) resolves too.
    const rowRead = await json(
      Promise.resolve(app.request(`${root(teams.id)}/rows/${team.id}`)),
    );
    expect(rowRead.row.values[lookup.id]).toEqual([1200, 340.5]);

    // Unlinking a project drops its value from the resolution.
    await json(
      request(`${root(teams.id)}/rows/${team.id}/links/${link.id}`, {
        remove: [alpha.id],
      }),
    );
    const after = await json(
      Promise.resolve(
        app.request(`${root(teams.id)}/row-query`, {
          method: "POST",
          body: JSON.stringify({}),
        }),
      ),
    );
    expect(after.rows[0].values[lookup.id]).toEqual([340.5]);

    // Direct cell write rejects — the physical column does not exist.
    const write = await request(
      `${root(teams.id)}/rows/${team.id}/cells/${lookup.id}`,
      { value: [1] },
      "PUT",
    );
    expect(write.status).toBe(400);
    expect(await write.text()).toMatch(/cannot be written/);

    // Row create with a lookup value rejects the whole insert.
    const insert = await request(`${root(teams.id)}/rows`, {
      values: { [lookup.id]: [1] },
    });
    expect(insert.status).toBe(400);

    // Filter/sort/summary use rejects instead of generating broken SQL.
    const filtered = await request(`${root(teams.id)}/row-query`, {
      filters: [{ fieldId: lookup.id, contains: "x" }],
    });
    expect(filtered.status).toBe(400);
    const sorted = await request(`${root(teams.id)}/row-query`, {
      sort: { fieldId: lookup.id, dir: "asc" },
    });
    expect(sorted.status).toBe(400);

    // Config validation: unknown link field / link-typed target field / required.
    const badLink = await request(`${root(teams.id)}/fields`, {
      name: "Bad lookup",
      type: "lookup",
      options: { linkFieldId: "nope", targetFieldId: budget.id },
    });
    expect(badLink.status).toBe(400);
    const badTarget = await request(`${root(teams.id)}/fields`, {
      name: "Bad lookup target",
      type: "lookup",
      options: { linkFieldId: link.id, targetFieldId: link.inverseField.id },
    });
    expect(badTarget.status).toBe(400);
    const required = await request(`${root(teams.id)}/fields`, {
      name: "Required lookup",
      type: "lookup",
      options: {
        linkFieldId: link.id,
        targetFieldId: budget.id,
        required: true,
      },
    });
    expect(required.status).toBe(400);
  });
});
