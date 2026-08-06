import { eq } from "drizzle-orm";
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

async function setVisibilityDefaults(
  organizationId: string,
  values: {
    defaultResourcePrivilege?: "none" | "view" | "edit" | "manage";
    resourceDefaultOverrides?: Partial<
      Record<"board" | "repo" | "table", "none" | "view" | "edit" | "manage">
    >;
  },
) {
  await db
    .update(schema.organizationTable)
    .set(values)
    .where(eq(schema.organizationTable.id, organizationId));
}

describe("organization default resource visibility", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("defaults ungranted resources to manage (legacy behaviour preserved)", async () => {
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

  it("applies the org-wide default to ungranted resources", async () => {
    const member = await createOrganizationMember({ role: "member" });
    const { board } = await createBoardFixture({
      organizationId: member.organization.id,
    });
    await setVisibilityDefaults(member.organization.id, {
      defaultResourcePrivilege: "view",
    });
    expect(
      await getResourcePrivilege({
        organizationId: member.organization.id,
        resourceType: "board",
        resourceId: board.id,
        userId: member.user.id,
      }),
    ).toBe("view");
  });

  it("prefers the per-type override over the org-wide default", async () => {
    const member = await createOrganizationMember({ role: "member" });
    const { board } = await createBoardFixture({
      organizationId: member.organization.id,
    });
    await setVisibilityDefaults(member.organization.id, {
      defaultResourcePrivilege: "view",
      resourceDefaultOverrides: { board: "edit" },
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

  it("hidden default (none) removes access, but an explicit grant overrides it", async () => {
    const member = await createOrganizationMember({ role: "member" });
    const { board } = await createBoardFixture({
      organizationId: member.organization.id,
    });
    await setVisibilityDefaults(member.organization.id, {
      defaultResourcePrivilege: "none",
    });
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

  it("owners and admins keep manage even when the default is hidden", async () => {
    const admin = await createOrganizationMember({ role: "admin" });
    const { board } = await createBoardFixture({
      organizationId: admin.organization.id,
    });
    await setVisibilityDefaults(admin.organization.id, {
      defaultResourcePrivilege: "none",
      resourceDefaultOverrides: { board: "none" },
    });
    expect(
      await getResourcePrivilege({
        organizationId: admin.organization.id,
        resourceType: "board",
        resourceId: board.id,
        userId: admin.user.id,
      }),
    ).toBe("manage");
  });

  describe("visibility defaults API", () => {
    it("lets a settings manager read and update defaults, replacing overrides wholesale", async () => {
      const owner = await createOrganizationMember({ role: "owner" });
      mockAuthenticatedSession(owner.user);
      const { app } = createApp();
      const base = `/api/organization/${owner.organization.id}/visibility-defaults`;

      const initial = await app.request(base);
      expect(initial.status).toBe(200);
      expect(await initial.json()).toMatchObject({
        defaultResourcePrivilege: "manage",
        resourceDefaultOverrides: {},
      });

      const update = await app.request(base, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultResourcePrivilege: "view",
          resourceDefaultOverrides: { table: "none", board: "edit" },
        }),
      });
      expect(update.status).toBe(200);
      expect(await update.json()).toMatchObject({
        defaultResourcePrivilege: "view",
        resourceDefaultOverrides: { table: "none", board: "edit" },
      });

      // Clearing an override = sending the map without that key.
      const clear = await app.request(base, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceDefaultOverrides: { board: "edit" } }),
      });
      expect(clear.status).toBe(200);
      expect(await clear.json()).toMatchObject({
        defaultResourcePrivilege: "view",
        resourceDefaultOverrides: { board: "edit" },
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

  describe("data table enforcement", () => {
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

    it("hides tables from lists and detail when the table default is hidden", async () => {
      const member = await createOrganizationMember({ role: "member" });
      const table = await createTableFixture(member.organization.id);
      await setVisibilityDefaults(member.organization.id, {
        resourceDefaultOverrides: { table: "none" },
      });
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

    it("view default allows reading but blocks row edits and lifecycle", async () => {
      const member = await createOrganizationMember({ role: "member" });
      const table = await createTableFixture(member.organization.id);
      await setVisibilityDefaults(member.organization.id, {
        resourceDefaultOverrides: { table: "view" },
      });
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
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Renamed" }),
          })
        ).status,
      ).toBe(404);
    });

    it("edit default allows row work but not table lifecycle", async () => {
      const member = await createOrganizationMember({ role: "member" });
      const table = await createTableFixture(member.organization.id);
      await setVisibilityDefaults(member.organization.id, {
        resourceDefaultOverrides: { table: "edit" },
      });
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
