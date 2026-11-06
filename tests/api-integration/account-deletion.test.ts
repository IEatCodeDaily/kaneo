import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import deleteAccountData from "../../apps/api/src/user/controllers/delete-account-data";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createBoardFixture,
  createOrganizationMember,
} from "./helpers/fixtures";

async function addMember(organizationId: string, role: string) {
  const userId = `user-${randomUUID()}`;

  const [user] = await db
    .insert(schema.userTable)
    .values({
      id: userId,
      email: `${userId}@example.com`,
      emailVerified: true,
      name: "Other Member",
    })
    .returning();

  await db.insert(schema.organizationMemberTable).values({
    organizationId,
    userId: user.id,
    role,
    joinedAt: new Date(),
  });

  return user;
}

const findOrganization = (id: string) =>
  db
    .select()
    .from(schema.organizationTable)
    .where(eq(schema.organizationTable.id, id));

describe("API integration: account deletion", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("deletes an organization the account is the only member of", async () => {
    const owner = await createOrganizationMember({ role: "owner" });

    await deleteAccountData(owner.user.id);

    expect(await findOrganization(owner.organization.id)).toHaveLength(0);
  });

  it("refuses to delete while the account is the only owner of a shared organization", async () => {
    const owner = await createOrganizationMember({
      role: "owner",
      organizationName: "Acme",
    });
    await addMember(owner.organization.id, "member");

    await expect(deleteAccountData(owner.user.id)).rejects.toThrow(
      /only owner of "Acme"/,
    );

    expect(await findOrganization(owner.organization.id)).toHaveLength(1);
  });

  it("leaves a shared organization that keeps another owner", async () => {
    const owner = await createOrganizationMember({ role: "owner" });
    await addMember(owner.organization.id, "owner");

    await deleteAccountData(owner.user.id);

    const members = await db
      .select()
      .from(schema.organizationMemberTable)
      .where(eq(schema.organizationMemberTable.userId, owner.user.id));

    expect(await findOrganization(owner.organization.id)).toHaveLength(1);
    expect(members).toHaveLength(0);
  });

  it("refuses, and rolls back the membership change, while the account still leads a project", async () => {
    const host = await createOrganizationMember({ role: "owner" });
    const guest = await addMember(host.organization.id, "member");
    await db.insert(schema.projectTable).values({
      id: `project-${randomUUID()}`,
      organizationId: host.organization.id,
      slug: `proj-${randomUUID().slice(0, 8)}`,
      name: "Launch",
      summary: "Shared project",
      leadUserId: guest.id,
      createdBy: host.user.id,
    });

    await expect(deleteAccountData(guest.id)).rejects.toThrow(
      /lead or authored records in "Launch"/,
    );

    const members = await db
      .select()
      .from(schema.organizationMemberTable)
      .where(eq(schema.organizationMemberTable.userId, guest.id));
    expect(members).toHaveLength(1);
  });

  it("keeps tasks, time entries, and activity of another organization after the user row is deleted", async () => {
    const host = await createOrganizationMember({ role: "owner" });
    const guest = await addMember(host.organization.id, "member");
    const { board, columns } = await createBoardFixture({
      organizationId: host.organization.id,
    });

    const [task] = await db
      .insert(schema.taskTable)
      .values({
        boardId: board.id,
        columnId: columns.todo.id,
        userId: guest.id,
        title: "Assigned to the leaving user",
        status: "to-do",
        priority: "medium",
        number: 1,
        position: 1,
      })
      .returning();

    const [timeEntry] = await db
      .insert(schema.timeEntryTable)
      .values({
        taskId: task.id,
        userId: guest.id,
        startTime: new Date(),
        duration: 60,
      })
      .returning();

    const [activity] = await db
      .insert(schema.activityTable)
      .values({
        taskId: task.id,
        userId: guest.id,
        type: "comment",
        content: "Worth keeping",
      })
      .returning();

    await deleteAccountData(guest.id);
    await db.delete(schema.userTable).where(eq(schema.userTable.id, guest.id));

    const [remainingTask] = await db
      .select()
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, task.id));
    const [remainingTimeEntry] = await db
      .select()
      .from(schema.timeEntryTable)
      .where(eq(schema.timeEntryTable.id, timeEntry.id));
    const [remainingActivity] = await db
      .select()
      .from(schema.activityTable)
      .where(eq(schema.activityTable.id, activity.id));

    expect(remainingTask?.title).toBe("Assigned to the leaving user");
    expect(remainingTask?.userId).toBeNull();
    expect(remainingTimeEntry?.duration).toBe(60);
    expect(remainingTimeEntry?.userId).toBeNull();
    expect(remainingActivity?.content).toBe("Worth keeping");
    expect(remainingActivity?.userId).toBeNull();
  });

  it("removes the stored avatar with the account", async () => {
    const member = await createOrganizationMember({ role: "owner" });

    const [avatar] = await db
      .insert(schema.userAvatarTable)
      .values({
        userId: member.user.id,
        mimeType: "image/png",
        size: 8,
        data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      })
      .returning();

    await db
      .delete(schema.userTable)
      .where(eq(schema.userTable.id, member.user.id));

    const avatars = await db
      .select()
      .from(schema.userAvatarTable)
      .where(eq(schema.userAvatarTable.id, avatar.id));

    expect(avatars).toHaveLength(0);
  });
});

describe("API integration: avatar routes", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("stores an uploaded avatar and serves it back without authentication", async () => {
    const member = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02,
    ]);

    const uploadResponse = await app.request("/api/user/avatar", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contentType: "image/png",
        data: png.toString("base64"),
      }),
    });

    expect(uploadResponse.status).toBe(200);
    const avatar = (await uploadResponse.json()) as {
      id: string;
      url: string;
      size: number;
    };
    expect(avatar.url).toBe(`/api/user/avatar/${avatar.id}`);
    expect(avatar.size).toBe(png.length);

    const downloadResponse = await app.request(avatar.url);

    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.headers.get("content-type")).toBe("image/png");
    expect(downloadResponse.headers.get("x-content-type-options")).toBe(
      "nosniff",
    );
    expect(Buffer.from(await downloadResponse.arrayBuffer())).toEqual(png);
  });

  it("rejects bytes that do not match the declared image type", async () => {
    const member = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request("/api/user/avatar", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contentType: "image/png",
        data: Buffer.from("<html></html>").toString("base64"),
      }),
    });

    expect(response.status).toBe(400);
  });

  it("replaces the previous avatar and retires its URL", async () => {
    const member = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const upload = (contentType: string, data: Buffer) =>
      app.request("/api/user/avatar", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contentType,
          data: data.toString("base64"),
        }),
      });

    const first = (await (
      await upload(
        "image/png",
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      )
    ).json()) as { id: string; url: string };

    const second = (await (
      await upload("image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0x01]))
    ).json()) as { id: string; url: string };

    expect(second.id).not.toBe(first.id);
    expect((await app.request(first.url)).status).toBe(404);
    expect((await app.request(second.url)).status).toBe(200);

    const rows = await db
      .select()
      .from(schema.userAvatarTable)
      .where(eq(schema.userAvatarTable.userId, member.user.id));
    expect(rows).toHaveLength(1);
  });

  it("deletes the avatar of the current user", async () => {
    const member = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    await app.request("/api/user/avatar", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contentType: "image/png",
        data: Buffer.from([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ]).toString("base64"),
      }),
    });

    const response = await app.request("/api/user/avatar", {
      method: "DELETE",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: true });

    const rows = await db
      .select()
      .from(schema.userAvatarTable)
      .where(eq(schema.userAvatarTable.userId, member.user.id));
    expect(rows).toHaveLength(0);
  });

  it("requires authentication to upload an avatar", async () => {
    const { app } = createApp();

    const response = await app.request("/api/user/avatar", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contentType: "image/png", data: "" }),
    });

    expect(response.status).toBe(401);
  });
});
