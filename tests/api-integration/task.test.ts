import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createBoardFixture,
  createOrganizationMember,
} from "./helpers/fixtures";

describe("API integration: task creation", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("rejects unauthenticated task creation requests", async () => {
    const member = await createOrganizationMember();
    const { board } = await createBoardFixture({
      organizationId: member.organization.id,
    });

    mockAnonymousSession();
    const { app } = createApp();

    const response = await app.request(`/api/task/${board.id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Unauthorized task",
        description: "Should not be created",
        priority: "low",
        status: "to-do",
      }),
    });

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("Unauthorized");
  });

  it("creates a task with the matching column, assignee, and next number", async () => {
    const member = await createOrganizationMember();
    const { board, columns } = await createBoardFixture({
      organizationId: member.organization.id,
      name: "Delivery",
      slug: "delivery",
    });

    await db.insert(schema.taskTable).values({
      boardId: board.id,
      userId: member.user.id,
      title: "Existing task",
      description: "Already there",
      status: "to-do",
      columnId: columns.todo.id,
      priority: "medium",
      number: 1,
      position: 1,
    });
    // Do not manually advance board.lastTaskNumber here. claimTaskNumber is
    // deliberately self-healing: it must observe MAX(task.number) and repair a
    // stale counter while reserving the next number atomically. This fixture
    // therefore exercises the production invariant instead of relying on the
    // removed pre-organization project table.

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/${board.id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Ship integration flow",
        description: "Cover the first create-task path",
        priority: "high",
        status: "to-do",
        userId: member.user.id,
      }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      id: string;
      boardId: string;
      title: string;
      description: string;
      priority: string;
      status: string;
      userId: string | null;
      number: number | null;
      position: number | null;
      assigneeName?: string;
    };

    expect(payload).toMatchObject({
      boardId: board.id,
      title: "Ship integration flow",
      description: "Cover the first create-task path",
      priority: "high",
      status: "to-do",
      userId: member.user.id,
      number: 2,
      position: 2,
      assigneeName: member.user.name,
    });

    const persistedTask = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, payload.id),
    });

    expect(persistedTask).toMatchObject({
      id: payload.id,
      boardId: board.id,
      columnId: columns.todo.id,
      userId: member.user.id,
      title: "Ship integration flow",
      priority: "high",
      status: "to-do",
      number: 2,
      position: 2,
    });
  });

  it("rejects task creation for users outside the board organization", async () => {
    const member = await createOrganizationMember();
    const outsiderId = `user-${randomUUID()}`;
    const { board } = await createBoardFixture({
      organizationId: member.organization.id,
    });

    const [outsider] = await db
      .insert(schema.userTable)
      .values({
        id: outsiderId,
        email: `${outsiderId}@example.com`,
        emailVerified: true,
        name: "Task Outsider",
      })
      .returning();

    mockAuthenticatedSession(outsider);
    const { app } = createApp();

    const response = await app.request(`/api/task/${board.id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Forbidden task",
        description: "Should not be created",
        priority: "low",
        status: "to-do",
      }),
    });

    expect(response.status).toBe(403);
    await expect(response.text()).resolves.toBe(
      "You don't have access to this organization",
    );

    const persistedTask = await db.query.taskTable.findFirst({
      where: and(
        eq(schema.taskTable.boardId, board.id),
        eq(schema.taskTable.title, "Forbidden task"),
      ),
    });

    expect(persistedTask).toBeUndefined();
  });

  it("creates an unassigned task with parsed dates when optional fields are provided", async () => {
    const member = await createOrganizationMember();
    const { board, columns } = await createBoardFixture({
      organizationId: member.organization.id,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/${board.id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Plan release cut",
        description: "Track optional fields too",
        priority: "medium",
        status: "in-progress",
        startDate: "2026-04-01T09:00:00.000Z",
        dueDate: "2026-04-05T17:00:00.000Z",
      }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      id: string;
      userId: string | null;
      columnId: string | null;
      startDate: string | null;
      dueDate: string | null;
      assigneeName?: string;
    };

    expect(payload).toMatchObject({
      userId: null,
      columnId: columns.inProgress.id,
      startDate: "2026-04-01T09:00:00.000Z",
      dueDate: "2026-04-05T17:00:00.000Z",
    });
    expect(payload.assigneeName).toBeUndefined();

    const persistedTask = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, payload.id),
    });

    expect(persistedTask).toMatchObject({
      id: payload.id,
      userId: null,
      columnId: columns.inProgress.id,
      status: "in-progress",
    });
    expect(persistedTask?.startDate?.toISOString()).toBe(
      "2026-04-01T09:00:00.000Z",
    );
    expect(persistedTask?.dueDate?.toISOString()).toBe(
      "2026-04-05T17:00:00.000Z",
    );
  });

  it("creates tasks without a column when the status has no matching board column", async () => {
    const member = await createOrganizationMember();
    const { board } = await createBoardFixture({
      organizationId: member.organization.id,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/${board.id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Future status task",
        description: "Status does not map to a seeded column",
        priority: "low",
        status: "planned",
      }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      id: string;
      status: string;
      columnId: string | null;
      position: number | null;
    };

    expect(payload).toMatchObject({
      status: "planned",
      columnId: null,
      position: 1,
    });

    const persistedTask = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, payload.id),
    });

    expect(persistedTask).toMatchObject({
      id: payload.id,
      status: "planned",
      columnId: null,
      position: 1,
    });
  });
});
