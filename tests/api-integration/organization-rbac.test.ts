import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createBoardFixture,
  createOrganizationMember,
} from "./helpers/fixtures";

type CreateTaskBody = {
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  status: string;
};

async function seedTask(boardId: string, columnId: string | null) {
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      boardId,
      title: "Seeded task",
      description: "Existing",
      priority: "medium",
      status: "to-do",
      columnId,
      number: 1,
      position: 1,
    })
    .returning();
  return task;
}

async function createOrganizationRoleRow(
  organizationId: string,
  role: string,
  permission: Record<string, string[]> | string,
) {
  await db.insert(schema.organizationRoleTable).values({
    organizationId,
    role,
    permission:
      typeof permission === "string" ? permission : JSON.stringify(permission),
  });
}

async function postCreateTask(
  app: ReturnType<typeof createApp>["app"],
  boardId: string,
  body: Partial<CreateTaskBody> = {},
) {
  return app.request(`/api/task/${boardId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "RBAC probe",
      description: "",
      priority: "low",
      status: "to-do",
      ...body,
    }),
  });
}

describe("API integration: organization RBAC enforcement", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  describe("built-in roles", () => {
    it("allows a member to create a task (member role grants task:create)", async () => {
      const member = await createOrganizationMember({ role: "member" });
      const { board } = await createBoardFixture({
        organizationId: member.organization.id,
      });

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await postCreateTask(app, board.id);
      expect(response.status).toBe(200);
    });

    it("blocks a viewer from creating a task (viewer role lacks task:create)", async () => {
      const member = await createOrganizationMember({ role: "viewer" });
      const { board } = await createBoardFixture({
        organizationId: member.organization.id,
      });

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await postCreateTask(app, board.id);
      expect(response.status).toBe(403);
      await expect(response.text()).resolves.toBe("Insufficient permissions");

      const persisted = await db.query.taskTable.findFirst({
        where: and(
          eq(schema.taskTable.boardId, board.id),
          eq(schema.taskTable.title, "RBAC probe"),
        ),
      });
      expect(persisted).toBeUndefined();
    });

    it("blocks a member from deleting a task (member role lacks task:delete)", async () => {
      const member = await createOrganizationMember({ role: "member" });
      const { board, columns } = await createBoardFixture({
        organizationId: member.organization.id,
      });
      const task = await seedTask(board.id, columns.todo.id);

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request(`/api/task/${task.id}`, {
        method: "DELETE",
      });
      expect(response.status).toBe(403);

      const stillThere = await db.query.taskTable.findFirst({
        where: eq(schema.taskTable.id, task.id),
      });
      expect(stillThere).toBeDefined();
    });

    it("allows an admin to delete a task (admin role grants task:delete)", async () => {
      const member = await createOrganizationMember({ role: "admin" });
      const { board, columns } = await createBoardFixture({
        organizationId: member.organization.id,
      });
      const task = await seedTask(board.id, columns.todo.id);

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request(`/api/task/${task.id}`, {
        method: "DELETE",
      });
      expect(response.status).toBe(200);

      const gone = await db.query.taskTable.findFirst({
        where: eq(schema.taskTable.id, task.id),
      });
      expect(gone).toBeUndefined();
    });

    it("allows an owner to delete a task (owner role grants task:delete)", async () => {
      const member = await createOrganizationMember({ role: "owner" });
      const { board, columns } = await createBoardFixture({
        organizationId: member.organization.id,
      });
      const task = await seedTask(board.id, columns.todo.id);

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request(`/api/task/${task.id}`, {
        method: "DELETE",
      });
      expect(response.status).toBe(200);
    });

    it("returns 403 when the user has no row in organization_member for the organization", async () => {
      const member = await createOrganizationMember({ role: "admin" });
      const { board } = await createBoardFixture({
        organizationId: member.organization.id,
      });

      const outsiderId = `user-${randomUUID()}`;
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

      const response = await postCreateTask(app, board.id);
      // organizationAccess.fromBoard runs first and rejects with its own message
      expect(response.status).toBe(403);
    });

    it("does not authorize a board through a conflicting organizationId query", async () => {
      const attacker = await createOrganizationMember({ role: "admin" });
      const victim = await createOrganizationMember({ role: "admin" });
      const { board } = await createBoardFixture({
        organizationId: victim.organization.id,
      });

      mockAuthenticatedSession(attacker.user);
      const { app } = createApp();

      const response = await app.request(
        `/api/task/${board.id}?organizationId=${attacker.organization.id}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: "Cross-organization probe",
            description: "",
            priority: "low",
            status: "to-do",
          }),
        },
      );

      expect(response.status).toBe(403);
    });
  });

  describe("custom organization roles", () => {
    it("blocks a custom role that only grants task:read from creating a task", async () => {
      const member = await createOrganizationMember({ role: "readonly" });
      const { board } = await createBoardFixture({
        organizationId: member.organization.id,
      });
      await createOrganizationRoleRow(member.organization.id, "readonly", {
        task: ["read"],
        board: ["read"],
      });

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await postCreateTask(app, board.id);
      expect(response.status).toBe(403);
    });

    it("allows a custom role that grants task:create to create a task", async () => {
      const member = await createOrganizationMember({ role: "creator" });
      const { board } = await createBoardFixture({
        organizationId: member.organization.id,
      });
      await createOrganizationRoleRow(member.organization.id, "creator", {
        task: ["create", "read"],
        board: ["read"],
      });

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await postCreateTask(app, board.id);
      expect(response.status).toBe(200);
    });

    it("lets an organization_role row override the built-in viewer permissions", async () => {
      // viewer's compiled-in statements have no task:create. An organization_role
      // row for "viewer" with task:create should override and grant access.
      const member = await createOrganizationMember({ role: "viewer" });
      const { board } = await createBoardFixture({
        organizationId: member.organization.id,
      });
      await createOrganizationRoleRow(member.organization.id, "viewer", {
        task: ["create", "read", "update"],
        board: ["read"],
        organization: ["read"],
      });

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await postCreateTask(app, board.id);
      expect(response.status).toBe(200);
    });

    it("returns 403 when the organization_role permission JSON is malformed", async () => {
      const member = await createOrganizationMember({ role: "broken" });
      const { board } = await createBoardFixture({
        organizationId: member.organization.id,
      });
      // Malformed permission payload. The middleware should refuse rather than
      // crash; with no built-in fallback for "broken", access is denied.
      await createOrganizationRoleRow(member.organization.id, "broken", "not-json");

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await postCreateTask(app, board.id);
      expect(response.status).toBe(403);
    });

    it("drops malformed permission entries instead of throwing", async () => {
      const member = await createOrganizationMember({ role: "partial" });
      const { board } = await createBoardFixture({
        organizationId: member.organization.id,
      });
      // Some entries are valid string arrays, others are objects/strings/etc.
      // Middleware keeps the valid ones and ignores the rest.
      await createOrganizationRoleRow(
        member.organization.id,
        "partial",
        JSON.stringify({
          task: ["create"],
          board: "not-an-array",
          weird: { nested: true },
        }),
      );

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await postCreateTask(app, board.id);
      expect(response.status).toBe(200);
    });

    it("falls back to built-in role when no organization_role row exists for the name", async () => {
      // No organization_role row, role is the compiled-in "admin" — should work.
      const member = await createOrganizationMember({ role: "admin" });
      const { board } = await createBoardFixture({
        organizationId: member.organization.id,
      });

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await postCreateTask(app, board.id);
      expect(response.status).toBe(200);
    });
  });

  describe("resource coverage: task:update", () => {
    it("allows a member to update a task", async () => {
      const member = await createOrganizationMember({ role: "member" });
      const { board, columns } = await createBoardFixture({
        organizationId: member.organization.id,
      });
      const task = await seedTask(board.id, columns.todo.id);

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request(`/api/task/${task.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Updated by member",
          description: "edit",
          priority: "high",
          status: "to-do",
          boardId: board.id,
          position: 1,
        }),
      });
      expect(response.status).toBe(200);
    });

    it("blocks a viewer from updating a task", async () => {
      const member = await createOrganizationMember({ role: "viewer" });
      const { board, columns } = await createBoardFixture({
        organizationId: member.organization.id,
      });
      const task = await seedTask(board.id, columns.todo.id);

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request(`/api/task/${task.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Viewer attempt",
          description: "nope",
          priority: "low",
          status: "to-do",
          boardId: board.id,
          position: 1,
        }),
      });
      expect(response.status).toBe(403);
    });
  });

  describe("resource coverage: task:assign", () => {
    it("blocks a member from assigning a task (assign is admin-tier)", async () => {
      const member = await createOrganizationMember({ role: "member" });
      const { board, columns } = await createBoardFixture({
        organizationId: member.organization.id,
      });
      const task = await seedTask(board.id, columns.todo.id);

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request(`/api/task/assignee/${task.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: member.user.id }),
      });
      expect(response.status).toBe(403);
    });

    it("allows an admin to assign a task", async () => {
      const member = await createOrganizationMember({ role: "admin" });
      const { board, columns } = await createBoardFixture({
        organizationId: member.organization.id,
      });
      const task = await seedTask(board.id, columns.todo.id);

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request(`/api/task/assignee/${task.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: member.user.id }),
      });
      expect(response.status).toBe(200);
    });
  });

  describe("resource coverage: board:create / update / delete", () => {
    it("allows a member to create a board", async () => {
      const member = await createOrganizationMember({ role: "member" });
      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request("/api/board", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Member-made",
          organizationId: member.organization.id,
          slug: "MEM",
          icon: "Folder",
        }),
      });
      expect(response.status).toBe(200);
    });

    it("blocks a viewer from creating a board", async () => {
      const member = await createOrganizationMember({ role: "viewer" });
      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request("/api/board", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Viewer attempt",
          organizationId: member.organization.id,
          slug: "VWR",
          icon: "Folder",
        }),
      });
      expect(response.status).toBe(403);
    });

    it("blocks a member from updating a board (board:update is admin-tier)", async () => {
      const member = await createOrganizationMember({ role: "member" });
      const { board } = await createBoardFixture({
        organizationId: member.organization.id,
      });
      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request(`/api/board/${board.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Member-rename",
          icon: "Folder",
          slug: board.slug,
          description: "",
          isPublic: false,
        }),
      });
      expect(response.status).toBe(403);
    });

    it("allows an admin to update a board", async () => {
      const member = await createOrganizationMember({ role: "admin" });
      const { board } = await createBoardFixture({
        organizationId: member.organization.id,
      });
      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request(`/api/board/${board.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Admin-rename",
          icon: "Folder",
          slug: board.slug,
          description: "",
          isPublic: false,
        }),
      });
      expect(response.status).toBe(200);
    });

    it("blocks a member from deleting a board (board:delete is admin-tier)", async () => {
      const member = await createOrganizationMember({ role: "member" });
      const { board } = await createBoardFixture({
        organizationId: member.organization.id,
      });
      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request(`/api/board/${board.id}`, {
        method: "DELETE",
      });
      expect(response.status).toBe(403);
    });

    it("allows an admin to delete a board", async () => {
      const member = await createOrganizationMember({ role: "admin" });
      const { board } = await createBoardFixture({
        organizationId: member.organization.id,
      });
      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request(`/api/board/${board.id}`, {
        method: "DELETE",
      });
      expect(response.status).toBe(200);
    });
  });

  describe("resource coverage: label:create / delete", () => {
    it("allows a member to create a label", async () => {
      const member = await createOrganizationMember({ role: "member" });
      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request("/api/label", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "bug",
          color: "#ff0000",
          organizationId: member.organization.id,
        }),
      });
      expect(response.status).toBe(200);
    });

    it("blocks a viewer from creating a label", async () => {
      const member = await createOrganizationMember({ role: "viewer" });
      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request("/api/label", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "nope",
          color: "#000000",
          organizationId: member.organization.id,
        }),
      });
      expect(response.status).toBe(403);
    });

    it("allows a member to delete a label", async () => {
      const member = await createOrganizationMember({ role: "member" });
      const { board, columns } = await createBoardFixture({
        organizationId: member.organization.id,
      });
      const task = await seedTask(board.id, columns.todo.id);
      // deleteLabel requires the label to be attached to a task; without a
      // taskId the controller rejects with 400 before checking permissions.
      const [label] = await db
        .insert(schema.labelTable)
        .values({
          name: "scratch",
          color: "#abcdef",
          organizationId: member.organization.id,
          taskId: task.id,
        })
        .returning();

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request(`/api/label/${label.id}`, {
        method: "DELETE",
      });
      expect(response.status).toBe(200);
    });

    it("blocks a viewer from deleting a label", async () => {
      const member = await createOrganizationMember({ role: "viewer" });
      const { board, columns } = await createBoardFixture({
        organizationId: member.organization.id,
      });
      const task = await seedTask(board.id, columns.todo.id);
      const [label] = await db
        .insert(schema.labelTable)
        .values({
          name: "scratch",
          color: "#abcdef",
          organizationId: member.organization.id,
          taskId: task.id,
        })
        .returning();

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request(`/api/label/${label.id}`, {
        method: "DELETE",
      });
      expect(response.status).toBe(403);
    });
  });

  describe("resource coverage: organization:manage_settings", () => {
    // The integration endpoints (slack/discord/etc.) all gate on
    // organization:manage_settings. Use Slack as the canonical surface — the
    // 403 fires in middleware before the handler ever tries to call out.
    it("blocks a member from creating a Slack integration", async () => {
      const member = await createOrganizationMember({ role: "member" });
      const { board } = await createBoardFixture({
        organizationId: member.organization.id,
      });
      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request(
        `/api/slack-integration/board/${board.id}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            webhookUrl: "https://hooks.slack.com/services/x/y/z",
          }),
        },
      );
      expect(response.status).toBe(403);
    });

    it("blocks a viewer from creating a Slack integration", async () => {
      const member = await createOrganizationMember({ role: "viewer" });
      const { board } = await createBoardFixture({
        organizationId: member.organization.id,
      });
      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request(
        `/api/slack-integration/board/${board.id}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            webhookUrl: "https://hooks.slack.com/services/x/y/z",
          }),
        },
      );
      expect(response.status).toBe(403);
    });

    it("blocks a member from deleting an integration", async () => {
      const member = await createOrganizationMember({ role: "member" });
      const { board } = await createBoardFixture({
        organizationId: member.organization.id,
      });
      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request(
        `/api/slack-integration/board/${board.id}`,
        { method: "DELETE" },
      );
      expect(response.status).toBe(403);
    });
  });

  describe("instance admin bypass", () => {
    it("bypasses the organization permission check when user.role === 'admin'", async () => {
      const member = await createOrganizationMember({ role: "viewer" });
      // Promote the user to instance admin
      await db
        .update(schema.userTable)
        .set({ role: "admin" })
        .where(eq(schema.userTable.id, member.user.id));

      const { board } = await createBoardFixture({
        organizationId: member.organization.id,
      });

      // Reload the user so the mocked session reflects the admin role.
      const refreshedUser = await db.query.userTable.findFirst({
        where: eq(schema.userTable.id, member.user.id),
      });
      if (!refreshedUser) throw new Error("user vanished after update");

      mockAuthenticatedSession(refreshedUser);
      const { app } = createApp();

      const response = await postCreateTask(app, board.id);
      expect(response.status).toBe(200);
    });

    it("does not bypass for users with no role set", async () => {
      const member = await createOrganizationMember({ role: "viewer" });
      // Explicitly null role on the user table — should NOT bypass.
      await db
        .update(schema.userTable)
        .set({ role: null })
        .where(eq(schema.userTable.id, member.user.id));

      const { board } = await createBoardFixture({
        organizationId: member.organization.id,
      });

      mockAuthenticatedSession({ ...member.user, role: null });
      const { app } = createApp();

      const response = await postCreateTask(app, board.id);
      expect(response.status).toBe(403);
    });
  });
});
