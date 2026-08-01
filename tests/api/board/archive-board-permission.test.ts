import { beforeEach, describe, expect, it, vi } from "vitest";

// Board rows the fake db hands back. `archivedAt` starts null so the archive
// assertion proves the route actually wrote a timestamp rather than echoing a
// value that was already there.
const BOARD = {
  id: "board-1",
  organizationId: "org-1",
  name: "Roadmap",
  icon: "layout",
  slug: "roadmap",
  description: "",
  isPublic: false,
  archivedAt: null as Date | null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const mocks = vi.hoisted(() => ({
  // Role the fake `organization_member` row reports for the calling user.
  // `null` means "not a member of this organization at all".
  memberRole: "admin" as string | null,
  // Captures every `db.update(...).set(...)` payload so a test can assert what
  // the controller wrote without needing a real database.
  updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
}));

// The real permission guard is deliberately NOT mocked -- it is the thing under
// test. Only its data dependencies (db + instance-admin escape hatch) are faked.
vi.mock("../../../apps/api/src/utils/is-instance-admin", () => ({
  isInstanceAdmin: vi.fn().mockResolvedValue(false),
}));

vi.mock("../../../apps/api/src/database", async () => {
  const schema = await import("../../../apps/api/src/database/schema");

  const rowsFor = (table: unknown) => {
    if (table === schema.organizationMemberTable) {
      return mocks.memberRole ? [{ role: mocks.memberRole }] : [];
    }
    if (table === schema.organizationRoleTable) {
      // No custom role rows -> the guard falls back to the compiled-in
      // built-in role statements from @kaneo/permissions.
      return [];
    }
    if (table === schema.boardTable) {
      return [BOARD];
    }
    return [];
  };

  // Drizzle's builder is chainable and awaitable at several points, so the stub
  // exposes `.limit()`/`.returning()` and is itself a thenable.
  const thenable = (rows: unknown[]) => {
    const self: Record<string, unknown> = {
      limit: () => Promise.resolve(rows),
      returning: () => Promise.resolve(rows),
      then: (
        onFulfilled?: (value: unknown) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => Promise.resolve(rows).then(onFulfilled, onRejected),
    };
    self.where = () => self;
    return self;
  };

  const tableName = (table: unknown) =>
    table === schema.boardTable ? "board" : "other";

  const db = {
    select: () => ({ from: (table: unknown) => thenable(rowsFor(table)) }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => {
        mocks.updates.push({ table: tableName(table), values });
        return thenable([{ ...BOARD, ...values }]);
      },
    }),
  };

  return { default: db, db, schema };
});

// Organization scoping is a separate concern with its own tests; stub it so the
// permission guard is the only gate left standing on these routes.
vi.mock("../../../apps/api/src/utils/organization-access-middleware", () => {
  const pass =
    () =>
    async (
      c: {
        set: (key: string, value: unknown) => void;
        req: { header: (name: string) => string | undefined };
      },
      next: () => Promise<void>,
    ) => {
      c.set("organizationId", "org-1");
      c.set("userId", c.req.header("x-test-user") ?? "user-1");
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

import board from "../../../apps/api/src/board";

const archive = (path: string) =>
  board.request(path, {
    method: "PUT",
    headers: { "x-test-user": "user-1" },
  });

describe("board archive/unarchive routes require the manage-board permission", () => {
  beforeEach(() => {
    mocks.memberRole = "admin";
    mocks.updates.length = 0;
    BOARD.archivedAt = null;
  });

  it("archives a board and stamps archivedAt for a role holding board:update", async () => {
    const response = await archive("/board-1/archive");

    expect(response.status).toBe(200);

    const written = mocks.updates.find((entry) => entry.table === "board");
    expect(written).toBeDefined();
    expect(written?.values.archivedAt).toBeInstanceOf(Date);

    const body = (await response.json()) as { archivedAt: string | null };
    expect(body.archivedAt).not.toBeNull();
  });

  it("unarchives a board by clearing archivedAt for a role holding board:update", async () => {
    const response = await archive("/board-1/unarchive");

    expect(response.status).toBe(200);

    const written = mocks.updates.find((entry) => entry.table === "board");
    expect(written).toBeDefined();
    expect(written?.values.archivedAt).toBeNull();
  });

  // The important assertions: without board:update the request must be refused
  // BEFORE any write happens. `member` and `viewer` are real built-in roles that
  // legitimately lack board:update, so this pins the guard to real permission
  // data rather than a hand-rolled fixture.
  it.each([
    ["member", "/board-1/archive"],
    ["member", "/board-1/unarchive"],
    ["viewer", "/board-1/archive"],
    ["viewer", "/board-1/unarchive"],
  ])(
    "rejects %s (no board:update) on %s without writing",
    async (role, path) => {
      mocks.memberRole = role;

      const response = await archive(path);

      expect(response.status).toBe(403);
      // A 200 here would mean the board was mutated by an unauthorized user.
      expect(mocks.updates).toHaveLength(0);
    },
  );

  it("rejects a non-member without writing", async () => {
    mocks.memberRole = null;

    const response = await archive("/board-1/archive");

    expect(response.status).toBe(403);
    expect(mocks.updates).toHaveLength(0);
  });
});
