import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { getResourcePrivilege } from "../../apps/api/src/resource-access";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createBoardFixture,
  createOrganizationMember,
} from "./helpers/fixtures";

async function setOrgDefault(organizationId: string, privilege: string) {
  await db
    .update(schema.organizationTable)
    .set({ defaultResourcePrivilege: privilege })
    .where(eq(schema.organizationTable.id, organizationId));
}

async function setResourceBaseline(
  resourceType: "board" | "repo" | "table",
  resourceId: string,
  privilege: string | null,
  organizationId: string,
) {
  const table =
    resourceType === "board"
      ? schema.boardTable
      : resourceType === "repo"
        ? schema.repoTable
        : schema.dataTableTable;
  await db
    .update(table)
    .set({ orgPrivilege: privilege })
    .where(
      and(eq(table.id, resourceId), eq(table.organizationId, organizationId)),
    );
}

async function createTableFixture(organizationId: string) {
  await db
    .update(schema.organizationTable)
    .set({ tablesEnabled: true })
    .where(eq(schema.organizationTable.id, organizationId));
  const [table] = await db
    .insert(schema.dataTableTable)
    .values({ organizationId, name: "Fixture table" })
    .returning();
  return table;
}

describe("per-resource organization visibility", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("defaults to manage (legacy) when neither resource nor org sets a baseline", async () => {
    const member = await createOrganizationMember({ role: "member" });
    const { board } = await createBoardFixture({
      organizationId: member.organization.id,
    });
    expect(
      await getResourcePrivilege({
        organizationId: member.organization.id,
        resourceType: "board",
        resourceId: board.id,
        userId: member.user.id,
      }),
    ).toBe("manage");
  });

  it("org-wide default applies to resources with no per-resource baseline", async () => {
    const member = await createOrganizationMember({ role: "member" });
    const { board } = await createBoardFixture({
      organizationId: member.organization.id,
    });
    await setOrgDefault(member.organization.id, "view");
    expect(
      await getResourcePrivilege({
        organizationId: member.organization.id,
        resourceType: "board",
        resourceId: board.id,
        userId: member.user.id,
      }),
    ).toBe("view");
  });

  it("per-resource baseline overrides the org-wide default", async () => {
    const member = await createOrganizationMember({ role: "member" });
    const { board } = await createBoardFixture({
      organizationId: member.organization.id,
    });
    await setOrgDefault(member.organization.id, "view");
    await setResourceBaseline(
      "board",
      board.id,
      "edit",
      member.organization.id,
    );
    expect(
      await getResourcePrivilege({
        organizationId: member.organization.id,
        resourceType: "board",
        resourceId: board.id,
        userId: member.user.id,
      }),
    ).toBe("edit");
  });

  it("different resources can have different baselines from the same org default", async () => {
    const member = await createOrganizationMember({ role: "member" });
    const { board: boardA } = await createBoardFixture({
      organizationId: member.organization.id,
      name: "Board A",
      slug: `a-${Date.now()}`,
    });
    const { board: boardB } = await createBoardFixture({
      organizationId: member.organization.id,
      name: "Board B",
      slug: `b-${Date.now()}`,
    });
    const { board: boardC } = await createBoardFixture({
      organizationId: member.organization.id,
      name: "Board C",
      slug: `c-${Date.now()}`,
    });
    await setOrgDefault(member.organization.id, "view");
    // boardA follows org (view), boardB edit, boardC hidden
    await setResourceBaseline(
      "board",
      boardB.id,
      "edit",
      member.organization.id,
    );
    await setResourceBaseline(
      "board",
      boardC.id,
      "none",
      member.organization.id,
    );

    const ctx = {
      organizationId: member.organization.id,
      resourceType: "board" as const,
      userId: member.user.id,
    };
    expect(await getResourcePrivilege({ ...ctx, resourceId: boardA.id })).toBe(
      "view",
    );
    expect(await getResourcePrivilege({ ...ctx, resourceId: boardB.id })).toBe(
      "edit",
    );
    expect(await getResourcePrivilege({ ...ctx, resourceId: boardC.id })).toBe(
      "none",
    );
  });

  it("hidden resource grants access to members with an explicit grant", async () => {
    const member = await createOrganizationMember({ role: "member" });
    const { board } = await createBoardFixture({
      organizationId: member.organization.id,
    });
    await setResourceBaseline(
      "board",
      board.id,
      "none",
      member.organization.id,
    );
    expect(
      await getResourcePrivilege({
        organizationId: member.organization.id,
        resourceType: "board",
        resourceId: board.id,
        userId: member.user.id,
      }),
    ).toBe("none");

    await db.insert(schema.resourceGrantTable).values({
      organizationId: member.organization.id,
      resourceType: "board",
      resourceId: board.id,
      userId: member.user.id,
      privilege: "edit",
    });
    expect(
      await getResourcePrivilege({
        organizationId: member.organization.id,
        resourceType: "board",
        resourceId: board.id,
        userId: member.user.id,
      }),
    ).toBe("edit");
  });

  it("clearing the per-resource baseline back to null inherits the org default", async () => {
    const member = await createOrganizationMember({ role: "member" });
    const { board } = await createBoardFixture({
      organizationId: member.organization.id,
    });
    await setOrgDefault(member.organization.id, "view");
    await setResourceBaseline(
      "board",
      board.id,
      "edit",
      member.organization.id,
    );
    await setResourceBaseline("board", board.id, null, member.organization.id);
    expect(
      await getResourcePrivilege({
        organizationId: member.organization.id,
        resourceType: "board",
        resourceId: board.id,
        userId: member.user.id,
      }),
    ).toBe("view");
  });

  it("owners and admins keep manage regardless of resource or org baseline", async () => {
    const admin = await createOrganizationMember({ role: "admin" });
    const { board } = await createBoardFixture({
      organizationId: admin.organization.id,
    });
    await setOrgDefault(admin.organization.id, "none");
    await setResourceBaseline("board", board.id, "none", admin.organization.id);
    expect(
      await getResourcePrivilege({
        organizationId: admin.organization.id,
        resourceType: "board",
        resourceId: board.id,
        userId: admin.user.id,
      }),
    ).toBe("manage");
  });

  describe("visibility defaults API (org-wide default only)", () => {
    it("owner reads and updates the org-wide default", async () => {
      const owner = await createOrganizationMember({ role: "owner" });
      mockAuthenticatedSession(owner.user);
      const { app } = createApp();
      const base = `/api/organization/${owner.organization.id}/visibility-defaults`;

      const initial = await app.request(base);
      expect(initial.status).toBe(200);
      expect(await initial.json()).toMatchObject({
        defaultResourcePrivilege: "manage",
      });

      const update = await app.request(base, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultResourcePrivilege: "view" }),
      });
      expect(update.status).toBe(200);
      expect(await update.json()).toMatchObject({
        defaultResourcePrivilege: "view",
      });
    });

    it("rejects members without manage_settings", async () => {
      const member = await createOrganizationMember({ role: "member" });
      mockAuthenticatedSession(member.user);
      const { app } = createApp();
      const response = await app.request(
        `/api/organization/${member.organization.id}/visibility-defaults`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ defaultResourcePrivilege: "none" }),
        },
      );
      expect(response.status).toBe(403);
    });

    it("rejects invalid privilege values", async () => {
      const owner = await createOrganizationMember({ role: "owner" });
      mockAuthenticatedSession(owner.user);
      const { app } = createApp();
      const response = await app.request(
        `/api/organization/${owner.organization.id}/visibility-defaults`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ defaultResourcePrivilege: "superuser" }),
        },
      );
      expect(response.status).toBe(400);
    });
  });

  describe("per-resource org baseline API", () => {
    it("owner reads and sets the per-resource org baseline", async () => {
      const owner = await createOrganizationMember({ role: "owner" });
      const { board } = await createBoardFixture({
        organizationId: owner.organization.id,
      });
      mockAuthenticatedSession(owner.user);
      const { app } = createApp();
      const base = `/api/resource-grant/${owner.organization.id}/board/${board.id}/org-privilege`;

      const initial = await app.request(base);
      expect(initial.status).toBe(200);
      expect(await initial.json()).toEqual({ orgPrivilege: null });

      const set = await app.request(base, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgPrivilege: "none" }),
      });
      expect(set.status).toBe(200);
      expect(await set.json()).toEqual({ orgPrivilege: "none" });

      const clear = await app.request(base, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgPrivilege: null }),
      });
      expect(clear.status).toBe(200);
      expect(await clear.json()).toEqual({ orgPrivilege: null });
    });
  });

  describe("data table enforcement", () => {
    it("hidden table baseline removes access, grant overrides it", async () => {
      const member = await createOrganizationMember({ role: "member" });
      const table = await createTableFixture(member.organization.id);
      await setResourceBaseline(
        "table",
        table.id,
        "none",
        member.organization.id,
      );
      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const list = await app.request(
        `/api/data-table/organization/${member.organization.id}`,
      );
      expect(list.status).toBe(200);
      expect(await list.json()).toEqual([]);

      const detail = await app.request(
        `/api/data-table/organization/${member.organization.id}/${table.id}`,
      );
      expect(detail.status).toBe(404);
    });

    it("view baseline allows reading but blocks edits", async () => {
      const member = await createOrganizationMember({ role: "member" });
      const table = await createTableFixture(member.organization.id);
      await setResourceBaseline(
        "table",
        table.id,
        "view",
        member.organization.id,
      );
      mockAuthenticatedSession(member.user);
      const { app } = createApp();
      const base = `/api/data-table/organization/${member.organization.id}/${table.id}`;

      expect((await app.request(base)).status).toBe(200);
      expect(
        (
          await app.request(`${base}/rows`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await app.request(base, {
            method: "DELETE",
          })
        ).status,
      ).toBe(404);
    });

    it("edit baseline allows row work but not table lifecycle", async () => {
      const member = await createOrganizationMember({ role: "member" });
      const table = await createTableFixture(member.organization.id);
      await setResourceBaseline(
        "table",
        table.id,
        "edit",
        member.organization.id,
      );
      mockAuthenticatedSession(member.user);
      const { app } = createApp();
      const base = `/api/data-table/organization/${member.organization.id}/${table.id}`;

      expect(
        (
          await app.request(`${base}/rows`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await app.request(base, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Renamed" }),
          })
        ).status,
      ).toBe(404);
    });
  });
});
