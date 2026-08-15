import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * KFL-190: archived boards must rank LAST in board listings.
 *
 * The ordering is the database's job (the controller pages nothing in JS), so
 * the assertion targets the actual query the controller issues: the `orderBy`
 * handed to `db.query.boardTable.findMany`. The expression is rendered through
 * drizzle's real Postgres dialect, so a hand-waved or misspelled column would
 * fail here rather than silently sorting by nothing.
 */

const mocks = vi.hoisted(() => ({
  // Every config object passed to boardTable.findMany, so the test asserts on
  // what actually reaches the database rather than on a re-implementation.
  findManyCalls: [] as Array<Record<string, unknown>>,
}));

const ACTIVE_BOARD = {
  id: "board-active",
  organizationId: "org-1",
  name: "Roadmap",
  slug: "roadmap",
  icon: "layout",
  description: "",
  isPublic: false,
  archivedAt: null as Date | null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  tasks: [],
};

const ARCHIVED_BOARD = {
  ...ACTIVE_BOARD,
  id: "board-archived",
  name: "Old Roadmap",
  slug: "old-roadmap",
  archivedAt: new Date("2026-02-01T00:00:00.000Z"),
  tasks: [],
};

vi.mock("../../../apps/api/src/database", () => ({
  default: {
    query: {
      boardTable: {
        findMany: (config: Record<string, unknown>) => {
          mocks.findManyCalls.push(config);
          return Promise.resolve([ACTIVE_BOARD, ARCHIVED_BOARD]);
        },
      },
    },
  },
}));

// Access filtering is a separate concern with its own tests; let every board
// through so ordering is the only thing under test.
vi.mock("../../../apps/api/src/resource-access", () => ({
  listAccessibleResourceIds: vi.fn(
    async ({ resourceIds }: { resourceIds: string[] }) => resourceIds,
  ),
}));

import { PgDialect } from "drizzle-orm/pg-core";
import getBoards from "../../../apps/api/src/board/controllers/get-boards";

const dialect = new PgDialect();

function renderOrderBy(orderBy: unknown): string[] {
  const clauses = Array.isArray(orderBy) ? orderBy : [orderBy];
  return clauses.map((clause) => {
    // biome-ignore lint/suspicious/noExplicitAny: drizzle's SQL type is structural here
    const { sql } = dialect.sqlToQuery(clause as any);
    return sql.toLowerCase();
  });
}

describe("getBoards ranks archived boards last (KFL-190)", () => {
  beforeEach(() => {
    mocks.findManyCalls.length = 0;
  });

  it("orders by the archived flag before anything else", async () => {
    await getBoards("org-1", "user-1", true);

    const [config] = mocks.findManyCalls;
    expect(config).toBeDefined();
    // Without an explicit ordering the database is free to return archived
    // boards anywhere in the list, which is exactly the KFL-190 bug.
    expect(config?.orderBy).toBeDefined();

    const clauses = renderOrderBy(config?.orderBy);
    expect(clauses.length).toBeGreaterThan(0);

    const primary = clauses[0] ?? "";
    expect(primary).toContain("archived_at");
    expect(primary).toContain("is not null");
    // Ascending on `(archived_at is not null)` puts false (active) before true
    // (archived). A `desc` here would invert the ticket's requirement.
    expect(primary).not.toContain("desc");
  });

  it("keeps a deterministic secondary ordering for boards on the same side", async () => {
    await getBoards("org-1", "user-1", true);

    const clauses = renderOrderBy(mocks.findManyCalls[0]?.orderBy);
    expect(clauses.length).toBeGreaterThan(1);
    expect(clauses[1]).toContain("created_at");
  });

  it("still applies the ordering when archived boards are excluded", async () => {
    await getBoards("org-1", "user-1", false);

    const clauses = renderOrderBy(mocks.findManyCalls[0]?.orderBy);
    expect(clauses[0]).toContain("archived_at");
  });
});
