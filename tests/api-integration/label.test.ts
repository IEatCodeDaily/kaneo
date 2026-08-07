import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createBoardFixture,
  createOrganizationMember,
} from "./helpers/fixtures";

describe("API integration: labels", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("rejects unauthenticated label creation", async () => {
    mockAnonymousSession();
    const { app } = createApp();

    const response = await app.request("/api/label", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Bug",
        color: "#ff0000",
        organizationId: "organization-missing",
      }),
    });

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("Unauthorized");
  });

  it("creates a label in an organization for a member", async () => {
    const member = await createOrganizationMember();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request("/api/label", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Bug",
        color: "#ef4444",
        organizationId: member.organization.id,
      }),
    });

    expect(response.status).toBe(200);
    const payload =
      (await response.json()) as typeof schema.labelTable.$inferSelect;

    expect(payload).toMatchObject({
      organizationId: member.organization.id,
      name: "Bug",
      color: "#ef4444",
    });

    const persisted = await db.query.labelTable.findFirst({
      where: eq(schema.labelTable.id, payload.id),
    });

    expect(persisted).toMatchObject({
      id: payload.id,
      organizationId: member.organization.id,
      name: "Bug",
      color: "#ef4444",
    });
  });

  it("rejects label creation for users outside the organization", async () => {
    const member = await createOrganizationMember();
    const outsiderId = "user-label-outsider";

    const [outsider] = await db
      .insert(schema.userTable)
      .values({
        id: outsiderId,
        email: `${outsiderId}@example.com`,
        emailVerified: true,
        name: "Label Outsider",
      })
      .returning();

    mockAuthenticatedSession(outsider);
    const { app } = createApp();

    const response = await app.request("/api/label", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Blocked",
        color: "#6b7280",
        organizationId: member.organization.id,
      }),
    });

    expect(response.status).toBe(403);
    await expect(response.text()).resolves.toBe(
      "You don't have access to this organization",
    );

    const persisted = await db.query.labelTable.findFirst({
      where: eq(schema.labelTable.name, "Blocked"),
    });

    expect(persisted).toBeUndefined();
  });

  describe("deletion cascade", () => {
    it("deletes task-level copies when an organization label is deleted", async () => {
      const member = await createOrganizationMember();
      const { board, columns } = await createBoardFixture({
        organizationId: member.organization.id,
      });

      // Create two tasks to assign labels to
      const [taskA] = await db
        .insert(schema.taskTable)
        .values({
          boardId: board.id,
          userId: member.user.id,
          title: "Task A",
          status: "to-do",
          columnId: columns.todo.id,
          priority: "medium",
          number: 1,
          position: 1,
        })
        .returning();

      const [taskB] = await db
        .insert(schema.taskTable)
        .values({
          boardId: board.id,
          userId: member.user.id,
          title: "Task B",
          status: "to-do",
          columnId: columns.todo.id,
          priority: "medium",
          number: 2,
          position: 2,
        })
        .returning();

      // Create an organization-level label
      const [organizationLabel] = await db
        .insert(schema.labelTable)
        .values({
          name: "Bug",
          color: "#ef4444",
          organizationId: member.organization.id,
          taskId: null,
        })
        .returning();

      // Create task-level copies (simulating assigning the label to tasks)
      const [_taskLabelA] = await db
        .insert(schema.labelTable)
        .values({
          name: "Bug",
          color: "#ef4444",
          organizationId: member.organization.id,
          taskId: taskA.id,
        })
        .returning();

      const [_taskLabelB] = await db
        .insert(schema.labelTable)
        .values({
          name: "Bug",
          color: "#ef4444",
          organizationId: member.organization.id,
          taskId: taskB.id,
        })
        .returning();

      // Verify all three labels exist
      const before = await db.query.labelTable.findMany({
        where: eq(schema.labelTable.organizationId, member.organization.id),
      });
      expect(before).toHaveLength(3);

      // Delete the organization-level label via the API
      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request(`/api/label/${organizationLabel.id}`, {
        method: "DELETE",
      });

      expect(response.status).toBe(200);

      // Verify the organization label and task-level copies are all gone
      const remaining = await db.query.labelTable.findMany({
        where: eq(schema.labelTable.organizationId, member.organization.id),
      });
      expect(remaining).toHaveLength(0);
    });

    it("does not affect unrelated labels when deleting an organization label", async () => {
      const member = await createOrganizationMember();
      const { board, columns } = await createBoardFixture({
        organizationId: member.organization.id,
      });

      const [task] = await db
        .insert(schema.taskTable)
        .values({
          boardId: board.id,
          userId: member.user.id,
          title: "Task",
          status: "to-do",
          columnId: columns.todo.id,
          priority: "medium",
          number: 1,
          position: 1,
        })
        .returning();

      // Create two different organization labels
      const [labelBug] = await db
        .insert(schema.labelTable)
        .values({
          name: "Bug",
          color: "#ef4444",
          organizationId: member.organization.id,
          taskId: null,
        })
        .returning();

      const [labelFeature] = await db
        .insert(schema.labelTable)
        .values({
          name: "Feature",
          color: "#3b82f6",
          organizationId: member.organization.id,
          taskId: null,
        })
        .returning();

      // Create task-level copies for both
      await db.insert(schema.labelTable).values({
        name: "Bug",
        color: "#ef4444",
        organizationId: member.organization.id,
        taskId: task.id,
      });

      const [featureCopy] = await db
        .insert(schema.labelTable)
        .values({
          name: "Feature",
          color: "#3b82f6",
          organizationId: member.organization.id,
          taskId: task.id,
        })
        .returning();

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      // Delete only the "Bug" organization label
      const response = await app.request(`/api/label/${labelBug.id}`, {
        method: "DELETE",
      });
      expect(response.status).toBe(200);

      // "Feature" organization label and its task-level copy should still exist
      const featureOrganization = await db.query.labelTable.findFirst({
        where: eq(schema.labelTable.id, labelFeature.id),
      });
      expect(featureOrganization).toBeDefined();

      const featureTaskCopy = await db.query.labelTable.findFirst({
        where: eq(schema.labelTable.id, featureCopy.id),
      });
      expect(featureTaskCopy).toBeDefined();
    });
  });
});
