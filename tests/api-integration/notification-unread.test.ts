import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createOrganizationMember } from "./helpers/fixtures";

describe("notification unread persistence and ownership", () => {
  beforeEach(resetTestDatabase);
  it("persists unread for its owner and rejects another recipient", async () => {
    const owner = await createOrganizationMember();
    const other = await createOrganizationMember();
    const id = randomUUID();
    await db.insert(schema.notificationTable).values({
      id,
      userId: owner.user.id,
      type: "task_mention",
      isRead: true,
    });
    mockAuthenticatedSession(owner.user);
    let response = await createApp().app.request(
      `/api/notification/${id}/unread`,
      { method: "PATCH" },
    );
    expect(response.status).toBe(200);
    expect(
      (
        await db
          .select()
          .from(schema.notificationTable)
          .where(eq(schema.notificationTable.id, id))
      )[0].isRead,
    ).toBe(false);
    await db
      .update(schema.notificationTable)
      .set({ isRead: true })
      .where(eq(schema.notificationTable.id, id));
    mockAuthenticatedSession(other.user);
    response = await createApp().app.request(`/api/notification/${id}/unread`, {
      method: "PATCH",
    });
    expect(response.status).toBe(404);
    expect(
      (
        await db
          .select()
          .from(schema.notificationTable)
          .where(eq(schema.notificationTable.id, id))
      )[0].isRead,
    ).toBe(true);
  });
  it("requires authentication", async () => {
    mockAnonymousSession();
    expect(
      (
        await createApp().app.request("/api/notification/foreign/unread", {
          method: "PATCH",
        })
      ).status,
    ).toBe(401);
  });
});
