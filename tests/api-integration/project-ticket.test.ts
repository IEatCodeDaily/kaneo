import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { subscribeToEvent } from "../../apps/api/src/events";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createBoardFixture,
  createOrganizationMember,
} from "./helpers/fixtures";

type BoardFixture = Awaited<ReturnType<typeof createBoardFixture>>;
type Columns = BoardFixture["columns"];

function columnIdFor(columns: Columns, status: string): string | null {
  switch (status) {
    case "to-do":
      return columns.todo.id;
    case "in-progress":
      return columns.inProgress.id;
    case "in-review":
      return columns.inReview.id;
    case "done":
      return columns.done.id;
    default:
      // triage / planned / canceled / duplicate have no column row.
      return null;
  }
}

async function createTask(
  board: BoardFixture["board"],
  columns: Columns,
  overrides: {
    title: string;
    number: number;
    status?: string;
    priority?: string;
    archivedAt?: Date | null;
    deletedAt?: Date | null;
    startDate?: Date | null;
    dueDate?: Date | null;
  },
) {
  const status = overrides.status ?? "to-do";
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      boardId: board.id,
      title: overrides.title,
      status,
      columnId: columnIdFor(columns, status),
      priority: overrides.priority ?? "low",
      number: overrides.number,
      position: overrides.number,
      archivedAt: overrides.archivedAt ?? null,
      deletedAt: overrides.deletedAt ?? null,
      startDate: overrides.startDate ?? null,
      dueDate: overrides.dueDate ?? null,
    })
    .returning();
  if (!task) throw new Error("Failed to seed task");
  return task;
}

async function createProject(
  app: ReturnType<typeof createApp>["app"],
  organizationId: string,
  leadUserId: string,
  options: { name?: string; slug?: string } = {},
) {
  const response = await app.request("/api/project", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      organizationId,
      name: options.name ?? "Scoped project",
      summary: "Integration project",
      leadUserId,
      slug: options.slug,
    }),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as { id: string; slug: string };
}

async function addTicket(
  app: ReturnType<typeof createApp>["app"],
  projectId: string,
  taskId: string,
  rank?: number,
) {
  return app.request(`/api/project/${projectId}/tickets`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ taskId, ...(rank === undefined ? {} : { rank }) }),
  });
}

async function removeTicket(
  app: ReturnType<typeof createApp>["app"],
  projectId: string,
  taskId: string,
) {
  return app.request(`/api/project/${projectId}/tickets/${taskId}`, {
    method: "DELETE",
  });
}

async function getTickets(
  app: ReturnType<typeof createApp>["app"],
  projectId: string,
) {
  return app.request(`/api/project/${projectId}/tickets`, { method: "GET" });
}

function waitForEvent<T>(eventType: string): Promise<T> {
  const { promise, resolve } = Promise.withResolvers<T>();
  subscribeToEvent<T>(eventType, async (data) => resolve(data));
  return promise;
}

describe("API integration: project ticket membership and progress", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("adds an editable cross-board ticket to a Project without mutating ticket execution fields", async () => {
    const member = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const { board: boardA, columns: columnsA } = await createBoardFixture({
      organizationId: member.organization.id,
      name: "Board A",
      slug: "board-a",
    });
    const { board: boardB, columns: columnsB } = await createBoardFixture({
      organizationId: member.organization.id,
      name: "Board B",
      slug: "board-b",
    });
    const project = await createProject(
      app,
      member.organization.id,
      member.user.id,
      { name: "Cross board", slug: "cross-board" },
    );

    const task = await createTask(boardA, columnsA, {
      title: "Scoped work",
      number: 1,
      status: "in-progress",
    });

    const response = await addTicket(app, project.id, task.id, 3);
    expect(response.status).toBe(200);
    const membership = (await response.json()) as {
      id: string;
      boardId: string;
      number: number;
      status: string;
      archivedAt: string | null;
      rank: number;
      addedBy: string;
      key: string;
    };
    expect(membership.id).toBe(task.id);
    expect(membership.boardId).toBe(boardA.id);
    expect(membership.number).toBe(task.number);
    expect(membership.status).toBe("in-progress");
    expect(membership.archivedAt).toBeNull();
    expect(membership.rank).toBe(3);
    expect(membership.addedBy).toBe(member.user.id);
    expect(membership.key).toBe("board-a-1");

    // Task execution fields are untouched by membership creation.
    const persisted = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });
    expect(persisted).toMatchObject({
      boardId: boardA.id,
      number: task.number,
      status: "in-progress",
      columnId: columnsA.inProgress.id,
      archivedAt: null,
    });

    // The second board (empty) proves membership is board-agnostic.
    const other = await createTask(boardB, columnsB, {
      title: "Other board work",
      number: 1,
      status: "to-do",
    });
    const otherResponse = await addTicket(app, project.id, other.id);
    expect(otherResponse.status).toBe(200);
  });

  it("rejects cross-organization membership without creating a partial association", async () => {
    const member = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const project = await createProject(
      app,
      member.organization.id,
      member.user.id,
      { slug: "same-org" },
    );

    const otherOrg = await createOrganizationMember();
    const { board: foreignBoard, columns: foreignColumns } =
      await createBoardFixture({ organizationId: otherOrg.organization.id });
    const foreignTask = await createTask(foreignBoard, foreignColumns, {
      title: "Foreign task",
      number: 1,
    });

    const response = await addTicket(app, project.id, foreignTask.id);
    expect(response.status).toBe(404);

    const memberships = await db.query.projectTicketTable.findMany();
    expect(memberships).toHaveLength(0);
    const projectStill = await db.query.projectTable.findFirst({
      where: eq(schema.projectTable.id, project.id),
    });
    expect(projectStill).toBeDefined();
    const taskStill = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, foreignTask.id),
    });
    expect(taskStill).toMatchObject({ boardId: foreignBoard.id });
  });

  it("allows a ticket in zero or one Project and rejects a second Project atomically", async () => {
    const member = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const { board, columns } = await createBoardFixture({
      organizationId: member.organization.id,
    });
    const task = await createTask(board, columns, {
      title: "Single membership",
      number: 1,
    });

    const firstProject = await createProject(
      app,
      member.organization.id,
      member.user.id,
      { slug: "first" },
    );
    const secondProject = await createProject(
      app,
      member.organization.id,
      member.user.id,
      { slug: "second" },
    );

    const first = await addTicket(app, firstProject.id, task.id);
    expect(first.status).toBe(200);
    const firstMembership = (await first.json()) as {
      id: string;
      rank: number;
    };

    const second = await addTicket(app, secondProject.id, task.id);
    expect(second.status).toBe(409);

    // First membership row unchanged, no second row created.
    const rows = await db.query.projectTicketTable.findMany({
      where: eq(schema.projectTicketTable.taskId, task.id),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      projectId: firstProject.id,
      taskId: task.id,
      rank: firstMembership.rank,
    });
  });

  it("removes only Project membership and leaves ticket identity workflow and archive intact", async () => {
    const member = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const { board, columns } = await createBoardFixture({
      organizationId: member.organization.id,
    });
    const task = await createTask(board, columns, {
      title: "Membership removal",
      number: 1,
      status: "done",
    });
    const project = await createProject(
      app,
      member.organization.id,
      member.user.id,
      { slug: "remove" },
    );

    await addTicket(app, project.id, task.id);

    const removed = await removeTicket(app, project.id, task.id);
    expect(removed.status).toBe(200);

    const memberships = await db.query.projectTicketTable.findMany();
    expect(memberships).toHaveLength(0);
    const persisted = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });
    expect(persisted).toMatchObject({
      boardId: board.id,
      number: 1,
      status: "done",
      archivedAt: null,
    });

    // Idempotent: removing an absent association returns 404 and writes nothing.
    const again = await removeTicket(app, project.id, task.id);
    expect(again.status).toBe(404);
    expect(await db.query.projectTicketTable.findMany()).toHaveLength(0);
  });

  it("derives progress from visible eligible tickets", async () => {
    const member = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const { board, columns } = await createBoardFixture({
      organizationId: member.organization.id,
    });
    const project = await createProject(
      app,
      member.organization.id,
      member.user.id,
      { slug: "progress" },
    );

    const done = await createTask(board, columns, {
      title: "Done work",
      number: 1,
      status: "done",
    });
    const todo = await createTask(board, columns, {
      title: "To do work",
      number: 2,
      status: "to-do",
    });
    const inProgress = await createTask(board, columns, {
      title: "In progress work",
      number: 3,
      status: "in-progress",
    });
    const triage = await createTask(board, columns, {
      title: "Backlog work",
      number: 4,
      status: "triage",
    });
    const canceled = await createTask(board, columns, {
      title: "Canceled work",
      number: 5,
      status: "canceled",
    });
    const duplicate = await createTask(board, columns, {
      title: "Duplicate work",
      number: 6,
      status: "duplicate",
    });
    const archived = await createTask(board, columns, {
      title: "Archived work",
      number: 7,
      status: "to-do",
      archivedAt: new Date(),
    });
    const deleted = await createTask(board, columns, {
      title: "Deleted work",
      number: 8,
      status: "to-do",
      deletedAt: new Date(),
    });

    for (const t of [
      done,
      todo,
      inProgress,
      triage,
      canceled,
      duplicate,
      archived,
      deleted,
    ]) {
      const res = await addTicket(app, project.id, t.id);
      expect(res.status).toBe(200);
    }

    const response = await getTickets(app, project.id);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      progress: { completed: number; eligible: number; percent: number | null };
    };
    expect(payload.progress).toEqual({
      completed: 1,
      eligible: 4,
      percent: 25,
    });

    // Zero eligible work yields an exact null percent, never 0.
    const emptyProject = await createProject(
      app,
      member.organization.id,
      member.user.id,
      { slug: "empty" },
    );
    const emptyResponse = await getTickets(app, emptyProject.id);
    const emptyPayload = (await emptyResponse.json()) as {
      progress: { completed: number; eligible: number; percent: number | null };
    };
    expect(emptyPayload.progress).toEqual({
      completed: 0,
      eligible: 0,
      percent: null,
    });
  });

  it("does not leak inaccessible scoped tickets or their aggregate contribution", async () => {
    const owner = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(owner.user);
    const { app } = createApp();

    const { board: visibleBoard, columns: visibleColumns } =
      await createBoardFixture({
        organizationId: owner.organization.id,
        name: "Visible board",
        slug: "visible-board",
      });
    const { board: hiddenBoard, columns: hiddenColumns } =
      await createBoardFixture({
        organizationId: owner.organization.id,
        name: "Hidden board",
        slug: "hidden-board",
      });
    // Hide the second board from ordinary members.
    await db
      .update(schema.boardTable)
      .set({ orgPrivilege: "none" })
      .where(eq(schema.boardTable.id, hiddenBoard.id));

    const project = await createProject(
      app,
      owner.organization.id,
      owner.user.id,
      { slug: "no-leak" },
    );

    const visibleTask = await createTask(visibleBoard, visibleColumns, {
      title: "Visible work",
      number: 1,
      status: "done",
    });
    const hiddenTask = await createTask(hiddenBoard, hiddenColumns, {
      title: "Hidden work",
      number: 1,
      status: "done",
    });

    expect((await addTicket(app, project.id, visibleTask.id)).status).toBe(200);
    expect((await addTicket(app, project.id, hiddenTask.id)).status).toBe(200);

    // A second ordinary member: project visible, board A visible, board B not.
    const lowPrivId = `user-${randomUUID()}`;
    await db.insert(schema.userTable).values({
      id: lowPrivId,
      email: `${lowPrivId}@example.com`,
      emailVerified: true,
      name: "Low privilege member",
    });
    await db.insert(schema.organizationMemberTable).values({
      id: `member-${randomUUID()}`,
      organizationId: owner.organization.id,
      userId: lowPrivId,
      role: "member",
      joinedAt: new Date(),
    });
    const lowPrivUser = await db.query.userTable.findFirst({
      where: eq(schema.userTable.id, lowPrivId),
    });
    if (!lowPrivUser) throw new Error("Failed to seed low-priv user");
    mockAuthenticatedSession(lowPrivUser);
    const { app: lowPrivApp } = createApp();

    const response = await getTickets(lowPrivApp, project.id);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      tickets: Array<{ id: string; key: string }>;
      progress: { completed: number; eligible: number; percent: number | null };
    };
    expect(payload.tickets).toHaveLength(1);
    expect(payload.tickets[0]).toMatchObject({
      id: visibleTask.id,
      key: "visible-board-1",
    });
    expect(payload.tickets.find((t) => t.id === hiddenTask.id)).toBeUndefined();
    expect(payload.progress).toEqual({
      completed: 1,
      eligible: 1,
      percent: 100,
    });
  });

  it("requires Project and Ticket edit authority for membership mutations", async () => {
    const owner = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(owner.user);
    const { app } = createApp();

    const { board, columns } = await createBoardFixture({
      organizationId: owner.organization.id,
    });
    const task = await createTask(board, columns, {
      title: "Guarded work",
      number: 1,
    });
    const project = await createProject(
      app,
      owner.organization.id,
      owner.user.id,
      { slug: "guarded" },
    );

    // Ordinary member with no project update permission and no board edit.
    const lowPrivId = `user-${randomUUID()}`;
    await db.insert(schema.userTable).values({
      id: lowPrivId,
      email: `${lowPrivId}@example.com`,
      emailVerified: true,
      name: "Low privilege member",
    });
    await db.insert(schema.organizationMemberTable).values({
      id: `member-${randomUUID()}`,
      organizationId: owner.organization.id,
      userId: lowPrivId,
      role: "member",
      joinedAt: new Date(),
    });
    // Hide project and board from ordinary members: no view/edit for either.
    await db
      .update(schema.projectTable)
      .set({ orgPrivilege: "none" })
      .where(eq(schema.projectTable.id, project.id));
    await db
      .update(schema.boardTable)
      .set({ orgPrivilege: "none" })
      .where(eq(schema.boardTable.id, board.id));

    const lowPrivUser = await db.query.userTable.findFirst({
      where: eq(schema.userTable.id, lowPrivId),
    });
    if (!lowPrivUser) throw new Error("Failed to seed low-priv user");
    mockAuthenticatedSession(lowPrivUser);
    const { app: lowPrivApp } = createApp();

    const add = await addTicket(lowPrivApp, project.id, task.id);
    expect(add.status).toBe(404);
    expect(await db.query.projectTicketTable.findMany()).toHaveLength(0);

    // Owner seeds the membership, then the low-priv user cannot remove it.
    mockAuthenticatedSession(owner.user);
    const { app: ownerApp } = createApp();
    expect((await addTicket(ownerApp, project.id, task.id)).status).toBe(200);

    mockAuthenticatedSession(lowPrivUser);
    const remove = await removeTicket(lowPrivApp, project.id, task.id);
    expect(remove.status).toBe(404);
    expect(await db.query.projectTicketTable.findMany()).toHaveLength(1);
  });

  it("filters list get and slug-resolve Project progress identically", async () => {
    const member = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const { board, columns } = await createBoardFixture({
      organizationId: member.organization.id,
    });
    const project = await createProject(
      app,
      member.organization.id,
      member.user.id,
      { slug: "identical-progress" },
    );
    const done = await createTask(board, columns, {
      title: "Done",
      number: 1,
      status: "done",
    });
    const todo = await createTask(board, columns, {
      title: "To do",
      number: 2,
      status: "to-do",
    });
    await addTicket(app, project.id, done.id);
    await addTicket(app, project.id, todo.id);

    const expected = { completed: 1, eligible: 2, percent: 50 };

    const tickets = (await (await getTickets(app, project.id)).json()) as {
      progress: { completed: number; eligible: number; percent: number | null };
    };
    expect(tickets.progress).toEqual(expected);

    const get = (await (
      await app.request(`/api/project/${project.id}`, { method: "GET" })
    ).json()) as {
      progress: { completed: number; eligible: number; percent: number | null };
    };
    expect(get.progress).toEqual(expected);

    const resolve = (await (
      await app.request(
        `/api/project/resolve?organizationId=${member.organization.id}&slug=identical-progress`,
      )
    ).json()) as {
      progress: { completed: number; eligible: number; percent: number | null };
    };
    expect(resolve.progress).toEqual(expected);

    const list = (await (
      await app.request(`/api/project?organizationId=${member.organization.id}`)
    ).json()) as Array<{
      id: string;
      progress: { completed: number; eligible: number; percent: number | null };
    }>;
    const listed = list.find((p) => p.id === project.id);
    expect(listed?.progress).toEqual(expected);
  });

  it("publishes Project refresh for add remove and scoped ticket status/archive/delete/move changes", async () => {
    const member = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const { board, columns } = await createBoardFixture({
      organizationId: member.organization.id,
    });
    const otherBoard = await createBoardFixture({
      organizationId: member.organization.id,
      name: "Other board",
      slug: "other-board",
    });
    const task = await createTask(board, columns, {
      title: "Event target",
      number: 1,
    });
    const project = await createProject(
      app,
      member.organization.id,
      member.user.id,
      { slug: "events" },
    );

    const addEvent = waitForEvent<{
      organizationId: string;
      projectId: string;
    }>("project.updated");
    expect((await addTicket(app, project.id, task.id)).status).toBe(200);
    await expect(addEvent).resolves.toMatchObject({
      organizationId: member.organization.id,
      projectId: project.id,
    });

    const statusEvent = waitForEvent<{
      organizationId: string;
      projectId: string;
    }>("project.updated");
    const statusResponse = await app.request(`/api/task/status/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    expect(statusResponse.status).toBe(200);
    await expect(statusEvent).resolves.toMatchObject({
      organizationId: member.organization.id,
      projectId: project.id,
    });

    const archiveEvent = waitForEvent<{
      organizationId: string;
      projectId: string;
    }>("project.updated");
    const archiveResponse = await app.request(`/api/task/archived/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });
    expect(archiveResponse.status).toBe(200);
    await expect(archiveEvent).resolves.toMatchObject({
      organizationId: member.organization.id,
      projectId: project.id,
    });

    const deleteEvent = waitForEvent<{
      organizationId: string;
      projectId: string;
    }>("project.updated");
    const deleteResponse = await app.request(`/api/task/${task.id}`, {
      method: "DELETE",
    });
    expect(deleteResponse.status).toBe(200);
    await expect(deleteEvent).resolves.toMatchObject({
      organizationId: member.organization.id,
      projectId: project.id,
    });

    const removeEvent = waitForEvent<{
      organizationId: string;
      projectId: string;
    }>("project.updated");
    expect((await removeTicket(app, project.id, task.id)).status).toBe(200);
    await expect(removeEvent).resolves.toMatchObject({
      organizationId: member.organization.id,
      projectId: project.id,
    });

    // Move within the same org still refreshes the project (board changed).
    const secondTask = await createTask(board, columns, {
      title: "Move target",
      number: 2,
    });
    await addTicket(app, project.id, secondTask.id);
    const moveEvent = waitForEvent<{
      organizationId: string;
      projectId: string;
    }>("project.updated");
    const moveResponse = await app.request(`/api/task/move/${secondTask.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ destinationBoardId: otherBoard.board.id }),
    });
    expect(moveResponse.status).toBe(200);
    await expect(moveEvent).resolves.toMatchObject({
      organizationId: member.organization.id,
      projectId: project.id,
    });
  });

  it("removes membership when moving a scoped ticket across organizations", async () => {
    const owner = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(owner.user);
    const { app } = createApp();

    const { board: sourceBoard, columns: sourceColumns } =
      await createBoardFixture({ organizationId: owner.organization.id });
    const otherOrg = await createOrganizationMember();
    const { board: destinationBoard } = await createBoardFixture({
      organizationId: otherOrg.organization.id,
    });

    const task = await createTask(sourceBoard, sourceColumns, {
      title: "Cross-org move",
      number: 1,
    });
    const project = await createProject(
      app,
      owner.organization.id,
      owner.user.id,
      { slug: "cross-org" },
    );
    expect((await addTicket(app, project.id, task.id)).status).toBe(200);

    const moveEvent = waitForEvent<{
      organizationId: string;
      projectId: string;
    }>("project.updated");
    const moveResponse = await app.request(`/api/task/move/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ destinationBoardId: destinationBoard.id }),
    });
    expect(moveResponse.status).toBe(200);
    await expect(moveEvent).resolves.toMatchObject({
      organizationId: owner.organization.id,
      projectId: project.id,
    });

    // The invalid cross-org relation is gone, no residue.
    const memberships = await db.query.projectTicketTable.findMany({
      where: eq(schema.projectTicketTable.taskId, task.id),
    });
    expect(memberships).toHaveLength(0);

    const moved = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });
    expect(moved?.boardId).toBe(destinationBoard.id);
  });

  it("returns one authorized cross-board Project Ticket projection with canonical Board identity and schedule fields", async () => {
    const member = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const { board: boardA, columns: columnsA } = await createBoardFixture({
      organizationId: member.organization.id,
      name: "Board A",
      slug: "board-a",
    });
    const { board: boardB, columns: columnsB } = await createBoardFixture({
      organizationId: member.organization.id,
      name: "Board B",
      slug: "board-b",
    });
    const project = await createProject(
      app,
      member.organization.id,
      member.user.id,
      { slug: "cross-board-projection" },
    );

    const taskA = await createTask(boardA, columnsA, {
      title: "Scheduled A",
      number: 1,
      status: "in-progress",
      startDate: new Date("2026-08-10T00:00:00.000Z"),
      dueDate: new Date("2026-08-20T00:00:00.000Z"),
    });
    const taskB = await createTask(boardB, columnsB, {
      title: "Unscheduled B",
      number: 1,
      status: "done",
    });

    expect((await addTicket(app, project.id, taskA.id, 2)).status).toBe(200);
    expect((await addTicket(app, project.id, taskB.id, 1)).status).toBe(200);

    const response = await getTickets(app, project.id);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      tickets: Array<{
        id: string;
        boardId: string;
        boardSlug: string;
        boardName: string;
        key: string;
        status: string;
        startDate: string | null;
        dueDate: string | null;
        projectMilestoneId: string | null;
        rank: number;
      }>;
    };
    expect(payload.tickets).toHaveLength(2);

    const a = payload.tickets.find((t) => t.id === taskA.id);
    const b = payload.tickets.find((t) => t.id === taskB.id);
    expect(a).toMatchObject({
      id: taskA.id,
      boardId: boardA.id,
      boardSlug: "board-a",
      boardName: "Board A",
      key: "board-a-1",
      status: "in-progress",
      startDate: "2026-08-10T00:00:00.000Z",
      dueDate: "2026-08-20T00:00:00.000Z",
      projectMilestoneId: null,
      rank: 2,
    });
    expect(b).toMatchObject({
      id: taskB.id,
      boardSlug: "board-b",
      boardName: "Board B",
      key: "board-b-1",
      status: "done",
      startDate: null,
      dueDate: null,
      projectMilestoneId: null,
      rank: 1,
    });

    // No Task/Board mutation: identity and workflow fields are untouched.
    const persistedA = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, taskA.id),
    });
    expect(persistedA).toMatchObject({
      boardId: boardA.id,
      status: "in-progress",
      startDate: new Date("2026-08-10T00:00:00.000Z"),
      dueDate: new Date("2026-08-20T00:00:00.000Z"),
    });
  });

  it("omits an inaccessible Board from every Project Ticket projection field", async () => {
    const owner = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(owner.user);
    const { app } = createApp();

    const { board: visibleBoard, columns: visibleColumns } =
      await createBoardFixture({
        organizationId: owner.organization.id,
        name: "Visible board",
        slug: "visible-board",
      });
    const hiddenBoardSentinel = `hidden-board-${randomUUID()}`;
    const { board: hiddenBoard, columns: hiddenColumns } =
      await createBoardFixture({
        organizationId: owner.organization.id,
        name: hiddenBoardSentinel,
        slug: hiddenBoardSentinel,
      });
    await db
      .update(schema.boardTable)
      .set({ orgPrivilege: "none" })
      .where(eq(schema.boardTable.id, hiddenBoard.id));

    const project = await createProject(
      app,
      owner.organization.id,
      owner.user.id,
      { slug: "no-leak-projection" },
    );

    const visibleTask = await createTask(visibleBoard, visibleColumns, {
      title: "Visible work",
      number: 1,
      status: "done",
      startDate: new Date("2026-08-10T00:00:00.000Z"),
    });
    const hiddenTitleSentinel = `hidden-title-${randomUUID()}`;
    const hiddenStatusSentinel = "triage";
    const hiddenPrioritySentinel = "critical";
    const hiddenTask = await createTask(hiddenBoard, hiddenColumns, {
      title: hiddenTitleSentinel,
      number: 987654,
      status: hiddenStatusSentinel,
      priority: hiddenPrioritySentinel,
      startDate: new Date("2026-08-11T00:00:00.000Z"),
      dueDate: new Date("2026-08-21T00:00:00.000Z"),
    });

    expect((await addTicket(app, project.id, visibleTask.id)).status).toBe(200);
    expect((await addTicket(app, project.id, hiddenTask.id)).status).toBe(200);
    const hiddenAddedBySentinel = `hidden-user-${randomUUID()}`;
    await db.insert(schema.userTable).values({
      id: hiddenAddedBySentinel,
      email: `${hiddenAddedBySentinel}@example.com`,
      emailVerified: true,
      name: hiddenAddedBySentinel,
    });
    const hiddenAddedAtSentinel = new Date("2020-01-02T03:04:05.000Z");
    await db
      .update(schema.projectTicketTable)
      .set({
        rank: 987654,
        addedAt: hiddenAddedAtSentinel,
        addedBy: hiddenAddedBySentinel,
      })
      .where(eq(schema.projectTicketTable.taskId, hiddenTask.id));

    const lowPrivId = `user-${randomUUID()}`;
    await db.insert(schema.userTable).values({
      id: lowPrivId,
      email: `${lowPrivId}@example.com`,
      emailVerified: true,
      name: "Low privilege member",
    });
    await db.insert(schema.organizationMemberTable).values({
      id: `member-${randomUUID()}`,
      organizationId: owner.organization.id,
      userId: lowPrivId,
      role: "member",
      joinedAt: new Date(),
    });
    const lowPrivUser = await db.query.userTable.findFirst({
      where: eq(schema.userTable.id, lowPrivId),
    });
    if (!lowPrivUser) throw new Error("Failed to seed low-priv user");
    mockAuthenticatedSession(lowPrivUser);
    const { app: lowPrivApp } = createApp();

    const response = await getTickets(lowPrivApp, project.id);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      tickets: Array<{
        id: string;
        boardSlug: string;
        boardName: string;
        key: string;
        status: string;
        startDate: string | null;
        dueDate: string | null;
        projectMilestoneId: string | null;
      }>;
      progress: { completed: number; eligible: number; percent: number | null };
    };
    expect(payload.tickets).toHaveLength(1);
    expect(payload.tickets[0]).toMatchObject({
      id: visibleTask.id,
      boardSlug: "visible-board",
      boardName: "Visible board",
      key: "visible-board-1",
      status: "done",
      startDate: "2026-08-10T00:00:00.000Z",
      projectMilestoneId: null,
    });
    expect(payload.tickets.find((t) => t.id === hiddenTask.id)).toBeUndefined();
    expect(payload.tickets.some((t) => t.boardSlug === "hidden-board")).toBe(
      false,
    );
    const serialized = JSON.stringify(payload);
    for (const sentinel of [
      hiddenBoardSentinel,
      hiddenTitleSentinel,
      hiddenStatusSentinel,
      hiddenPrioritySentinel,
      hiddenAddedBySentinel,
      hiddenAddedAtSentinel.toISOString(),
      "987654",
      "2026-08-11T00:00:00.000Z",
      "2026-08-21T00:00:00.000Z",
    ])
      expect(serialized).not.toContain(sentinel);
    expect(payload.progress).toEqual({
      completed: 1,
      eligible: 1,
      percent: 100,
    });
  });

  it("keeps Project Ticket schedule sourced from Task and leaves the milestone assignment extension null", async () => {
    const member = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const { board, columns } = await createBoardFixture({
      organizationId: member.organization.id,
      slug: "schedule-board",
    });
    const project = await createProject(
      app,
      member.organization.id,
      member.user.id,
      { slug: "schedule" },
    );

    const task = await createTask(board, columns, {
      title: "Date moves",
      number: 1,
      status: "to-do",
      startDate: new Date("2026-08-10T00:00:00.000Z"),
      dueDate: new Date("2026-08-20T00:00:00.000Z"),
    });
    expect((await addTicket(app, project.id, task.id)).status).toBe(200);

    // Change the Ticket date through the Task surface.
    await db
      .update(schema.taskTable)
      .set({ dueDate: new Date("2026-08-25T00:00:00.000Z") })
      .where(eq(schema.taskTable.id, task.id));

    const response = await getTickets(app, project.id);
    const payload = (await response.json()) as {
      tickets: Array<{
        id: string;
        startDate: string | null;
        dueDate: string | null;
        projectMilestoneId: string | null;
        boardSlug: string;
      }>;
    };
    expect(payload.tickets).toHaveLength(1);
    expect(payload.tickets[0]).toMatchObject({
      id: task.id,
      startDate: "2026-08-10T00:00:00.000Z",
      dueDate: "2026-08-25T00:00:00.000Z",
      projectMilestoneId: null,
    });
    // Board milestone identity/name is never a Project Ticket field.
    expect(payload.tickets[0]).not.toHaveProperty("milestoneId");
    expect(payload.tickets[0]).not.toHaveProperty("milestoneName");
  });

  it("orders equal ranks by addedAt then task ID", async () => {
    const member = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const { board, columns } = await createBoardFixture({
      organizationId: member.organization.id,
      slug: "order-board",
    });
    const project = await createProject(
      app,
      member.organization.id,
      member.user.id,
      { slug: "order" },
    );
    const tasks = await Promise.all(
      [1, 2, 3, 4].map((number) =>
        createTask(board, columns, { title: `Task ${number}`, number }),
      ),
    );
    const [first, second, third, fourth] = tasks;
    if (!(first && second && third && fourth)) throw new Error("Missing tasks");
    for (const task of tasks)
      expect((await addTicket(app, project.id, task.id, 1)).status).toBe(200);
    const older = new Date("2026-01-01T00:00:00.000Z");
    const newer = new Date("2026-01-02T00:00:00.000Z");
    await db
      .update(schema.projectTicketTable)
      .set({ addedAt: newer })
      .where(eq(schema.projectTicketTable.taskId, first.id));
    await db
      .update(schema.projectTicketTable)
      .set({ addedAt: older })
      .where(
        inArray(schema.projectTicketTable.taskId, [
          second.id,
          third.id,
          fourth.id,
        ]),
      );
    const response = await getTickets(app, project.id);
    const payload = (await response.json()) as {
      tickets: Array<{ id: string }>;
    };
    expect(payload.tickets.map((ticket) => ticket.id)).toEqual(
      [second.id, third.id, fourth.id].sort().concat(first.id),
    );
  });
});
