import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Task rows the fake db hands back for the task branch of the search query.
// The row's own values never satisfy the filters -- the assertions are about the
// WHERE clause the controller compiles, which is the part under test.
const TASK = {
  id: "task-1",
  title: "Ship the search fix",
  description: "Investigate the MCP handshake before shipping",
  boardId: "board-1",
  boardName: "Roadmap",
  boardSlug: "ROAD",
  organizationId: "org-1",
  organizationName: "Acme",
  userId: "user-1",
  userName: "Ada",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  taskNumber: 78,
  priority: "medium",
  status: "to-do",
  relevanceScore: 3,
};

const mocks = vi.hoisted(() => ({
  // Every `where(...)` condition the controller handed to the fake db, tagged
  // with the table it was selected `from`. Tagging matters: globalSearch also
  // runs membership/resource-access queries, so "the last where" is not the task
  // query.
  wheres: [] as Array<{ table: string; condition: unknown }>,
}));

vi.mock("../../../apps/api/src/database", async () => {
  const schema = await import("../../../apps/api/src/database/schema");

  const rowsFor = (table: unknown) => {
    if (table === schema.organizationMemberTable) {
      // globalSearch bails out early unless the caller belongs to an org.
      return [{ organizationId: "org-1" }];
    }
    if (table === schema.taskTable) {
      return [TASK];
    }
    return [];
  };

  // Drizzle's builder is chainable and awaitable at several points.
  const builder = (rows: unknown[], tableName: string) => {
    const self: Record<string, unknown> = {
      limit: () => Promise.resolve(rows),
      orderBy: () => self,
      leftJoin: () => self,
      // biome-ignore lint/suspicious/noThenProperty: deliberately thenable — this stubs Drizzle's awaitable query builder
      then: (
        onFulfilled?: (value: unknown) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => Promise.resolve(rows).then(onFulfilled, onRejected),
    };
    self.where = (condition: unknown) => {
      mocks.wheres.push({ table: tableName, condition });
      return self;
    };
    return self;
  };

  const nameOf = (table: unknown) =>
    table === schema.taskTable
      ? "task"
      : table === schema.organizationMemberTable
        ? "organizationMember"
        : "other";

  const db = {
    select: () => ({
      from: (table: unknown) => builder(rowsFor(table), nameOf(table)),
    }),
    // Sub-teams: resource-access resolves effective team ids via a recursive
    // CTE through db.execute. No teams in this fixture.
    execute: () => Promise.resolve({ rows: [] }),
  };

  return { default: db, db, schema };
});

// Org scoping has its own tests; stub it so the search controller is reached.
vi.mock("../../../apps/api/src/utils/organization-access-middleware", () => {
  const pass =
    () =>
    async (
      c: { set: (key: string, value: unknown) => void },
      next: () => Promise<void>,
    ) => {
      c.set("organizationId", "org-1");
      c.set("userId", "user-1");
      return next();
    };

  return {
    organizationAccess: {
      fromQuery: pass,
      fromBody: pass,
      fromBoard: pass,
      fromParam: pass,
    },
  };
});

import search from "../../../apps/api/src/search";

const dialect = new PgDialect();

const runSearch = (q: string) =>
  search.request(
    // `limit` is sent explicitly: the route's valibot pipe coerces a string,
    // so relying on the schema default makes the request fail validation.
    `/?q=${encodeURIComponent(q)}&type=tasks&organizationId=org-1&limit=20`,
    { method: "GET" },
  );

// Compiles the last captured WHERE clause with the real Postgres dialect, so the
// assertions read the SQL Drizzle would actually send rather than a stand-in.
function compiledTaskWhere() {
  // Select the TASK query specifically. globalSearch also runs a membership
  // lookup, and that one is issued last -- taking `wheres.at(-1)` compiles the
  // membership filter and every assertion here becomes meaningless.
  const entry = mocks.wheres.filter((w) => w.table === "task").at(-1);
  expect(entry, "no WHERE was captured for the task table").toBeDefined();
  const { sql, params } = dialect.sqlToQuery(entry?.condition as SQL);
  return { sql, params };
}

describe("task search matches title, description and task number", () => {
  beforeEach(() => {
    mocks.wheres.length = 0;
  });

  it("filters on the task title", async () => {
    const response = await runSearch("handshake");

    expect(response.status).toBe(200);

    const { sql, params } = compiledTaskWhere();
    expect(sql).toContain('"task"."title" ilike');
    expect(params).toContain("%handshake%");
  });

  it("filters on the task description", async () => {
    const response = await runSearch("handshake");

    expect(response.status).toBe(200);

    const { sql, params } = compiledTaskWhere();
    expect(sql).toContain('"task"."description" ilike');
    expect(params).toContain("%handshake%");
  });

  // The number cases are the new behaviour: "78" and "#78" must reach the task
  // `number` column, not only the two text columns.
  it("matches a bare task number like 78 against the number column", async () => {
    const response = await runSearch("78");

    expect(response.status).toBe(200);

    const { sql, params } = compiledTaskWhere();
    expect(sql).toContain('"task"."number" =');
    expect(params).toContain(78);
  });

  it("matches a hash-prefixed task number like #78 against the number column", async () => {
    const response = await runSearch("#78");

    expect(response.status).toBe(200);

    const { sql, params } = compiledTaskWhere();
    expect(sql).toContain('"task"."number" =');
    // The leading '#' must be stripped before the numeric comparison.
    expect(params).toContain(78);
    expect(params).not.toContain("#78");
  });

  it("returns the matched task in the flat results shape for a number query", async () => {
    const response = await runSearch("78");

    const body = (await response.json()) as {
      results: Array<{ id: string; type: string; taskNumber?: number }>;
    };

    const task = body.results.find((result) => result.type === "task");
    expect(task?.id).toBe("task-1");
    expect(task?.taskNumber).toBe(78);
  });

  // Negative control: a non-numeric query must not grow a numeric comparison,
  // otherwise Postgres would be asked to compare an integer column to text.
  it("does not add a number comparison for a non-numeric query", async () => {
    const response = await runSearch("abc");

    expect(response.status).toBe(200);

    const { sql, params } = compiledTaskWhere();
    expect(sql).not.toContain('"task"."number" =');
    expect(params).toEqual(["org-1", "%abc%", "%abc%"]);
  });
});
