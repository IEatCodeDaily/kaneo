import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createOrganizationMember } from "./helpers/fixtures";

describe("standing notification flags across every mutation path", () => {
  beforeEach(resetTestDatabase);
  async function fixture() {
    const owner = await createOrganizationMember();
    const other = await createOrganizationMember();
    const flag = randomUUID();
    const normal = randomUUID();
    const foreign = randomUUID();

    await db.insert(schema.notificationTable).values([
      {
        id: flag,
        userId: owner.user.id,
        type: "task_flag_raised",
        isRead: false,
      },
      {
        id: normal,
        userId: owner.user.id,
        type: "task_mention",
        isRead: false,
      },
      {
        id: foreign,
        userId: other.user.id,
        type: "task_mention",
        isRead: false,
      },
    ]);
    mockAuthenticatedSession(owner.user);
    return { flag, normal, foreign, app: createApp().app };
  }
  it("counts unread updates but not standing flags", async () => {
    const { app } = await fixture();
    const response = await app.request("/api/notification/unread-count");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ count: 1 });
  });
  it("bulk read and clear preserve flags and other recipients", async () => {
    const { app, flag, normal, foreign } = await fixture();
    expect(
      (await app.request("/api/notification/read-all", { method: "PATCH" }))
        .status,
    ).toBe(200);
    let rows = await db.select().from(schema.notificationTable);
    expect(rows.find((row) => row.id === flag)?.isRead).toBe(false);
    expect(rows.find((row) => row.id === normal)?.isRead).toBe(true);
    expect(rows.find((row) => row.id === foreign)?.isRead).toBe(false);
    expect(
      (await app.request("/api/notification/clear-all", { method: "DELETE" }))
        .status,
    ).toBe(200);
    rows = await db.select().from(schema.notificationTable);
    expect(rows.map((row) => row.id).sort()).toEqual([flag, foreign].sort());
  });
  it("individual read and dismiss cannot resolve standing flags", async () => {
    const { app, flag } = await fixture();
    const readResponse = await app.request(`/api/notification/${flag}/read`, {
      method: "PATCH",
    });
    expect(readResponse.status).toBe(404);
    const [unchanged] = await db
      .select()
      .from(schema.notificationTable)
      .where(eq(schema.notificationTable.id, flag));
    expect(unchanged.isRead).toBe(false);
    expect(
      (
        await app.request(`/api/notification/${flag}/unread`, {
          method: "PATCH",
        })
      ).status,
    ).toBe(404);
    await app.request(`/api/notification/${flag}`, { method: "DELETE" });
    const [row] = await db
      .select()
      .from(schema.notificationTable)
      .where(eq(schema.notificationTable.id, flag));
    expect(row).toBeDefined();
    expect(row.isRead).toBe(false);
  });
});
