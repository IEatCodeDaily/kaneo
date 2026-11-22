import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createOrganizationMember } from "./helpers/fixtures";

/**
 * Regression (teams.36 live): picking a record in a link cell flashed the
 * optimistic chip, then reverted. The web swap path reads the version from
 * either the picker's link-page GET or the cached row value; either source
 * must match the server's write guard, or every pick 409s and the client
 * rolls back. This replays the exact web request sequence.
 */
describe("link pick web contract", () => {
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

  const makeTable = async (name: string) => {
    const t = await json(request(root(), { name }));
    const field = await json(
      request(`${root(t.id)}/fields`, { name: "Name", type: "text" }),
    );
    return { ...t, primary: field.id };
  };

  for (const cardinality of ["many-to-many", "many-to-one"] as const) {
    it(`${cardinality}: web pick sequence — versions agree and swaps stick`, async () => {
      const source = await makeTable("Task");
      const target = await makeTable("Team");
      const field = await json(
        request(`${root(source.id)}/fields`, {
          name: "Teams",
          type: "link",
          options: { targetTableId: target.id, cardinality },
        }),
      );
      const rowA = await json(
        request(`${root(source.id)}/rows`, {
          values: { [source.primary]: "T-1" },
        }),
      );
      const first = await json(
        request(`${root(target.id)}/rows`, {
          values: { [target.primary]: "Alpha" },
        }),
      );
      const second = await json(
        request(`${root(target.id)}/rows`, {
          values: { [target.primary]: "Beta" },
        }),
      );
      const linksPath = `${root(source.id)}/rows/${rowA.id}/links/${field.id}`;

      // 1. The picker opens: link-page GET + the row read the grid rendered.
      const page = await json(
        Promise.resolve(app.request(`${linksPath}?cursor=0`, { method: "GET" })),
      );
      const rowRead = await json(
        Promise.resolve(
          app.request(
            `${root(source.id)}/row-query`,
            {
              method: "POST",
              body: JSON.stringify({}),
            },
          ),
        ),
      );
      const cellValue = rowRead.rows[0].values[field.id];
      expect(cellValue.version).toBe(page.version);

      // 2. First pick — add without version (many) or with (single stays add too).
      const pickBody =
        cardinality === "many-to-one"
          ? { add: [first.id], ifVersion: page.version }
          : { add: [first.id] };
      const pick = await request(linksPath, pickBody);
      const pickText = await pick.text();
      expect(pick.status, pickText).toBe(200);
      const afterPick = JSON.parse(pickText) as {
        values: Record<string, { version: string }>;
      };

      // 3. The response row's version must match what a fresh link-page GET
      //    and a fresh row read report — otherwise the next swap 409s.
      const page2 = await json(
        Promise.resolve(app.request(`${linksPath}?cursor=0`, { method: "GET" })),
      );
      const rowRead2 = await json(
        Promise.resolve(
          app.request(
            `${root(source.id)}/row-query`,
            { method: "POST", body: JSON.stringify({}) },
          ),
        ),
      );
      expect(afterPick.values[field.id].version).toBe(page2.version);
      expect(rowRead2.rows[0].values[field.id].version).toBe(page2.version);

      // 4. Swap (single) or second add (many): the exact bodies the picker sends.
      const swapBody =
        cardinality === "many-to-one"
          ? {
              add: [second.id],
              remove: [first.id],
              ifVersion: page2.version,
            }
          : { add: [second.id] };
      const swap = await request(linksPath, swapBody);
      const swapText = await swap.text();
      expect(swap.status, swapText).toBe(200);
      const afterSwap = JSON.parse(swapText) as {
        values: Record<
          string,
          { records: { id: string }[]; total: number; version: string }
        >;
      };
      expect(
        afterSwap.values[field.id].records.map((r) => r.id),
        "swap must stick in the response row",
      ).toEqual(
        cardinality === "many-to-one" ? [second.id] : [first.id, second.id],
      );

      // 5. And from the row read the grid re-renders from.
      const rowRead3 = await json(
        Promise.resolve(
          app.request(
            `${root(source.id)}/row-query`,
            { method: "POST", body: JSON.stringify({}) },
          ),
        ),
      );
      expect(rowRead3.rows[0].values[field.id].records.map((r) => r.id)).toEqual(
        cardinality === "many-to-one" ? [second.id] : [first.id, second.id],
      );
    });
  }
});
