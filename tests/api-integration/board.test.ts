import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createOrganizationMember } from "./helpers/fixtures";

describe("API integration: board creation", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("rejects unauthenticated board creation requests", async () => {
    mockAnonymousSession();
    const { app } = createApp();

    const response = await app.request("/api/board", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        organizationId: "organization-missing",
        name: "Unauthorized Board",
        icon: "Folder",
        slug: "unauthorized-board",
      }),
    });

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("Unauthorized");
  });

  it("creates a board for an organization member and seeds default columns", async () => {
    const member = await createOrganizationMember();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request("/api/board", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        organizationId: member.organization.id,
        name: "Roadmap",
        icon: "FolderKanban",
        slug: "roadmap",
      }),
    });

    expect(response.status).toBe(200);
    const payload =
      (await response.json()) as typeof schema.boardTable.$inferSelect;

    expect(payload).toMatchObject({
      organizationId: member.organization.id,
      name: "Roadmap",
      icon: "FolderKanban",
      slug: "roadmap",
    });

    const persistedBoard = await db.query.boardTable.findFirst({
      where: eq(schema.boardTable.id, payload.id),
    });

    expect(persistedBoard).toMatchObject({
      id: payload.id,
      organizationId: member.organization.id,
      name: "Roadmap",
      slug: "roadmap",
    });

    const columns = await db.query.columnTable.findMany({
      where: eq(schema.columnTable.boardId, payload.id),
      orderBy: (column, { asc }) => [asc(column.position)],
    });

    expect(columns).toHaveLength(4);
    expect(columns.map((column) => column.slug)).toEqual([
      "to-do",
      "in-progress",
      "in-review",
      "done",
    ]);
    expect(columns.map((column) => column.isFinal)).toEqual([
      false,
      false,
      false,
      true,
    ]);
  });

  it("rejects board creation for users outside the organization", async () => {
    const member = await createOrganizationMember();
    const outsiderId = "user-outsider";

    const [outsider] = await db
      .insert(schema.userTable)
      .values({
        id: outsiderId,
        email: `${outsiderId}@example.com`,
        emailVerified: true,
        name: "Outsider",
      })
      .returning();

    mockAuthenticatedSession(outsider);
    const { app } = createApp();

    const response = await app.request("/api/board", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        organizationId: member.organization.id,
        name: "Forbidden Board",
        icon: "Folder",
        slug: "forbidden-board",
      }),
    });

    expect(response.status).toBe(403);
    await expect(response.text()).resolves.toBe(
      "You don't have access to this organization",
    );
  });
});
