import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  memberRole: "admin" as string | null,
  projection: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../../apps/api/src/utils/is-instance-admin", () => ({
  isInstanceAdmin: vi.fn().mockResolvedValue(false),
}));

vi.mock("../../../apps/api/src/database", async () => {
  const schema = await import("../../../apps/api/src/database/schema");
  const rowsFor = (table: unknown) => {
    if (table === schema.organizationMemberTable) {
      return mocks.memberRole ? [{ role: mocks.memberRole }] : [];
    }
    if (table === schema.organizationRoleTable) return [];
    return [];
  };
  const thenable = (rows: unknown[]) => {
    const self: Record<string, unknown> = {
      limit: () => Promise.resolve(rows),
      // biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are awaitable
      then: (
        onFulfilled?: (value: unknown) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => Promise.resolve(rows).then(onFulfilled, onRejected),
    };
    self.where = () => self;
    return self;
  };
  const db = {
    select: () => ({ from: (table: unknown) => thenable(rowsFor(table)) }),
  };
  return { default: db, db, schema };
});

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
      if (c.req.header("x-test-scoped-key")) {
        c.set("apiKey", {
          metadata: { type: "service" },
          permissions: { project: [] },
        });
      }
      return next();
    };
  return {
    organizationAccess: {
      fromQuery: pass,
      fromBody: pass,
      fromBoard: pass,
      fromParam: pass,
      fromProject: pass,
    },
  };
});

vi.mock(
  "../../../apps/api/src/project/controllers/list-project-sidebar",
  () => ({ default: mocks.projection }),
);

import project from "../../../apps/api/src/project";

const requestSidebar = (scopedKey = false) =>
  project.request("/sidebar?organizationId=org-1", {
    headers: {
      "x-test-user": "user-1",
      ...(scopedKey ? { "x-test-scoped-key": "1" } : {}),
    },
  });

describe("GET /project/sidebar authorization", () => {
  beforeEach(() => {
    mocks.memberRole = "admin";
    mocks.projection.mockClear();
  });

  it("allows a principal with project:read and invokes the projection once", async () => {
    const response = await requestSidebar();
    expect(response.status).toBe(200);
    expect(mocks.projection).toHaveBeenCalledOnce();
    expect(mocks.projection).toHaveBeenCalledWith("org-1", "user-1");
  });

  it.each(["member", "viewer"])(
    "allows built-in %s because it holds project:read",
    async (role) => {
      mocks.memberRole = role;
      const response = await requestSidebar();
      expect(response.status).toBe(200);
      expect(mocks.projection).toHaveBeenCalledOnce();
    },
  );

  it("rejects a scope-limited service key before projection", async () => {
    const response = await requestSidebar(true);
    expect(response.status).toBe(403);
    expect(mocks.projection).not.toHaveBeenCalled();
  });

  it("rejects a non-member before projection", async () => {
    mocks.memberRole = null;
    const response = await requestSidebar();
    expect(response.status).toBe(403);
    expect(mocks.projection).not.toHaveBeenCalled();
  });
});
