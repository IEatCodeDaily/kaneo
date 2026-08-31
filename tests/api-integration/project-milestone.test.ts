import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { milestoneTable } from "../../apps/api/src/database/schema";
import { subscribeToEvent } from "../../apps/api/src/events";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createBoardFixture,
  createOrganizationMember,
} from "./helpers/fixtures";

interface MountedApp {
  request(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

async function createProject(
  app: MountedApp,
  organizationId: string,
  leadUserId: string,
  name = "Roadmap",
) {
  const response = await app.request("/api/project", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      organizationId,
      name,
      summary: "Milestone integration",
      leadUserId,
    }),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as { id: string };
}
async function createMilestone(
  app: MountedApp,
  projectId: string,
  name: string,
  rank: number,
) {
  const response = await app.request(`/api/project/${projectId}/milestones`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, rank }),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as {
    id: string;
    rank: number;
    completedAt: string | null;
    completedBy: { id: string } | null;
  };
}

async function createTask(
  organizationId: string,
  number: number,
  status = "to-do",
) {
  const boardFixture = await createBoardFixture({ organizationId });
  const columnId =
    status === "done"
      ? boardFixture.columns.done.id
      : boardFixture.columns.todo.id;
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      boardId: boardFixture.board.id,
      title: `Scoped ${number}`,
      status,
      columnId,
      priority: "low",
      number,
      position: number,
    })
    .returning();
  if (!task) throw new Error("Task fixture failed");
  return task;
}

async function addTicket(app: MountedApp, projectId: string, taskId: string) {
  const response = await app.request(`/api/project/${projectId}/tickets`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ taskId }),
  });
  expect(response.status).toBe(200);
}

function waitForProjectUpdate() {
  const { promise, resolve } = Promise.withResolvers<{
    organizationId: string;
    projectId: string;
  }>();
  subscribeToEvent("project.updated", async (data) =>
    resolve(data as { organizationId: string; projectId: string }),
  );
  return promise;
}

/** These routes mount through createApp and execute against the integration Postgres. */
describe("API integration: project milestones", () => {
  beforeEach(async () => resetTestDatabase());

  it("creates and lists milestones by rank then creation order", async () => {
    const member = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const project = await createProject(
      app,
      member.organization.id,
      member.user.id,
    );
    await createMilestone(app, project.id, "Later", 20);
    await createMilestone(app, project.id, "First", 10);
    const response = await app.request(`/api/project/${project.id}/milestones`);
    expect(response.status).toBe(200);
    expect(
      ((await response.json()) as Array<{ name: string }>).map(
        ({ name }) => name,
      ),
    ).toEqual(["First", "Later"]);
  });

  it("updates metadata without allowing the immutable milestone id to change", async () => {
    const member = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const project = await createProject(
      app,
      member.organization.id,
      member.user.id,
    );
    const milestone = await createMilestone(app, project.id, "Draft", 0);
    const event = waitForProjectUpdate();
    const response = await app.request(
      `/api/project/${project.id}/milestones/${milestone.id}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: "replacement",
          name: "Released",
          description: " notes ",
          targetDate: "2026-09-01",
          rank: 4,
        }),
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: milestone.id,
      name: "Released",
      description: "notes",
      targetDate: "2026-09-01",
      rank: 4,
    });
    await expect(event).resolves.toMatchObject({
      organizationId: member.organization.id,
      projectId: project.id,
    });
  });

  it("enforces the completion-pair CHECK constraint", async () => {
    const member = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const project = await createProject(
      app,
      member.organization.id,
      member.user.id,
    );
    const milestone = await createMilestone(app, project.id, "Checked", 0);
    await expect(
      db.execute(
        sql`UPDATE project_milestone SET completed_at = NOW() WHERE id = ${milestone.id}`,
      ),
    ).rejects.toThrow();
  });

  it("assigns, reassigns, and clears membership without changing board milestones", async () => {
    const member = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const project = await createProject(
      app,
      member.organization.id,
      member.user.id,
    );
    const first = await createMilestone(app, project.id, "First", 0);
    const second = await createMilestone(app, project.id, "Second", 1);
    const task = await createTask(member.organization.id, 1);
    await addTicket(app, project.id, task.id);
    for (const projectMilestoneId of [first.id, second.id, null]) {
      const response = await app.request(
        `/api/project/${project.id}/tickets/${task.id}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ projectMilestoneId }),
        },
      );
      expect(response.status).toBe(200);
      expect(
        ((await response.json()) as { projectMilestoneId: string | null })
          .projectMilestoneId,
      ).toBe(projectMilestoneId);
    }
    expect(await db.select().from(milestoneTable)).toHaveLength(0);
  });

  it("reports null progress for milestones with no eligible visible tickets", async () => {
    const member = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const project = await createProject(
      app,
      member.organization.id,
      member.user.id,
    );
    const milestone = await createMilestone(app, project.id, "Empty", 0);
    const task = await createTask(member.organization.id, 1, "canceled");
    await addTicket(app, project.id, task.id);
    expect(
      (
        await app.request(`/api/project/${project.id}/tickets/${task.id}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ projectMilestoneId: milestone.id }),
        })
      ).status,
    ).toBe(200);
    const [listed] = (await (
      await app.request(`/api/project/${project.id}/milestones`)
    ).json()) as Array<{ progress: unknown }>;
    expect(listed?.progress).toEqual({
      completed: 0,
      eligible: 0,
      percent: null,
    });
  });
  it("allows edit-granted users to delete without changing authority rows and emits one update per mutation", async () => {
    const owner = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(owner.user);
    const { app: ownerApp } = createApp();
    const project = await createProject(
      ownerApp,
      owner.organization.id,
      owner.user.id,
    );
    const milestone = await createMilestone(ownerApp, project.id, "Guarded", 0);
    const editorId = `user-${randomUUID()}`;
    const [editor] = await db
      .insert(schema.userTable)
      .values({
        id: editorId,
        email: `${editorId}@example.com`,
        emailVerified: true,
        name: "Editor",
      })
      .returning();
    if (!editor) throw new Error("Editor fixture failed");
    await db.insert(schema.organizationMemberTable).values({
      id: `member-${randomUUID()}`,
      organizationId: owner.organization.id,
      userId: editor.id,
      role: "admin",
      joinedAt: new Date(),
    });
    await db
      .update(schema.projectTable)
      .set({ orgPrivilege: "none" })
      .where(eq(schema.projectTable.id, project.id));
    await db.insert(schema.resourceGrantTable).values({
      organizationId: owner.organization.id,
      resourceType: "project",
      resourceId: project.id,
      userId: editor.id,
      privilege: "edit",
    });
    const grantsBefore = await db.select().from(schema.resourceGrantTable);
    mockAuthenticatedSession(editor);
    const { app } = createApp();
    let updateCount = 0;
    await subscribeToEvent<{ projectId: string }>(
      "project.updated",
      async ({ projectId }) => {
        if (projectId === project.id) updateCount++;
      },
    );
    expect(
      (
        await app.request(
          `/api/project/${project.id}/milestones/${milestone.id}`,
          { method: "DELETE" },
        )
      ).status,
    ).toBe(200);
    expect(updateCount).toBe(1);
    expect(await db.select().from(schema.resourceGrantTable)).toEqual(
      grantsBefore,
    );
  });

  it("completes and reopens idempotently without replacing completion attribution", async () => {
    const member = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const project = await createProject(
      app,
      member.organization.id,
      member.user.id,
    );
    const milestone = await createMilestone(app, project.id, "Release", 0);
    const complete = () =>
      app.request(
        `/api/project/${project.id}/milestones/${milestone.id}/complete`,
        { method: "PUT" },
      );
    const first = await complete();
    const firstBody = (await first.json()) as {
      completedAt: string;
      completedBy: { id: string };
    };
    const second = await complete();
    const secondBody = (await second.json()) as {
      completedAt: string;
      completedBy: { id: string };
    };
    expect(secondBody).toEqual(firstBody);
    expect(firstBody.completedBy.id).toBe(member.user.id);
    const reopen = () =>
      app.request(
        `/api/project/${project.id}/milestones/${milestone.id}/reopen`,
        { method: "PUT" },
      );
    expect(await reopen()).toHaveProperty("status", 200);
    expect(await reopen()).toHaveProperty("status", 200);
    const [persisted] = await db
      .select()
      .from(schema.projectMilestoneTable)
      .where(eq(schema.projectMilestoneTable.id, milestone.id));
    expect(persisted).toMatchObject({ completedAt: null, completedBy: null });
  });

  it("rejects a milestone from another Project during ticket assignment", async () => {
    const member = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const first = await createProject(
      app,
      member.organization.id,
      member.user.id,
      "First",
    );
    const second = await createProject(
      app,
      member.organization.id,
      member.user.id,
      "Second",
    );
    const foreign = await createMilestone(app, second.id, "Foreign", 0);
    const boardFixture = await createBoardFixture({
      organizationId: member.organization.id,
    });
    const [task] = await db
      .insert(schema.taskTable)
      .values({
        boardId: boardFixture.board.id,
        title: "Scoped",
        status: "to-do",
        columnId: boardFixture.columns.todo.id,
        priority: "low",
        number: 1,
        position: 1,
      })
      .returning();
    if (!task) throw new Error("Task fixture failed");
    await app.request(`/api/project/${first.id}/tickets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskId: task.id }),
    });
    const response = await app.request(
      `/api/project/${first.id}/tickets/${task.id}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectMilestoneId: foreign.id }),
      },
    );
    expect(response.status).toBe(404);
    const [membership] = await db
      .select()
      .from(schema.projectTicketTable)
      .where(eq(schema.projectTicketTable.taskId, task.id));
    expect(membership?.projectMilestoneId).toBeNull();
  });

  it("deletes a milestone with SET NULL while preserving scoped ticket membership", async () => {
    const member = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const project = await createProject(
      app,
      member.organization.id,
      member.user.id,
    );
    const milestone = await createMilestone(app, project.id, "Delete me", 0);
    const boardFixture = await createBoardFixture({
      organizationId: member.organization.id,
    });
    const [task] = await db
      .insert(schema.taskTable)
      .values({
        boardId: boardFixture.board.id,
        title: "Scoped",
        status: "to-do",
        columnId: boardFixture.columns.todo.id,
        priority: "low",
        number: 1,
        position: 1,
      })
      .returning();
    if (!task) throw new Error("Task fixture failed");
    await db.insert(schema.projectTicketTable).values({
      projectId: project.id,
      taskId: task.id,
      addedBy: member.user.id,
      projectMilestoneId: milestone.id,
    });
    expect(
      (
        await app.request(
          `/api/project/${project.id}/milestones/${milestone.id}`,
          { method: "DELETE" },
        )
      ).status,
    ).toBe(200);
    const [membership] = await db
      .select()
      .from(schema.projectTicketTable)
      .where(eq(schema.projectTicketTable.taskId, task.id));
    expect(membership).toMatchObject({
      projectId: project.id,
      projectMilestoneId: null,
    });
  });

  it("returns identical 404s for hidden and cross-organization milestone reads", async () => {
    const owner = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(owner.user);
    const { app } = createApp();
    const project = await createProject(
      app,
      owner.organization.id,
      owner.user.id,
    );
    await createMilestone(app, project.id, "Hidden", 0);
    await db
      .update(schema.projectTable)
      .set({ orgPrivilege: "none" })
      .where(eq(schema.projectTable.id, project.id));
    const outsiderId = `user-${randomUUID()}`;
    await db.insert(schema.userTable).values({
      id: outsiderId,
      email: `${outsiderId}@example.com`,
      emailVerified: true,
      name: "Member",
    });
    await db.insert(schema.organizationMemberTable).values({
      id: `member-${randomUUID()}`,
      organizationId: owner.organization.id,
      userId: outsiderId,
      role: "member",
      joinedAt: new Date(),
    });
    const outsider = await db.query.userTable.findFirst({
      where: eq(schema.userTable.id, outsiderId),
    });
    if (!outsider) throw new Error("User fixture failed");
    mockAuthenticatedSession(outsider);
    const { app: hiddenApp } = createApp();
    const hidden = await hiddenApp.request(
      `/api/project/${project.id}/milestones`,
    );
    expect(hidden.status).toBe(404);
    const other = await createOrganizationMember();
    mockAuthenticatedSession(other.user);
    const { app: otherApp } = createApp();
    expect(
      (await otherApp.request(`/api/project/${project.id}/milestones`)).status,
    ).toBe(404);
  });
  it("creates a membership with an optional milestone atomically", async () => {
    const member = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const project = await createProject(
      app,
      member.organization.id,
      member.user.id,
    );
    const milestone = await createMilestone(app, project.id, "Assigned", 0);
    const task = await createTask(member.organization.id, 1);

    const created = await app.request(`/api/project/${project.id}/tickets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        taskId: task.id,
        projectMilestoneId: milestone.id,
      }),
    });
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({
      id: task.id,
      projectMilestoneId: milestone.id,
    });

    const unscoped = await createTask(member.organization.id, 2);
    const rejected = await app.request(`/api/project/${project.id}/tickets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        taskId: unscoped.id,
        projectMilestoneId: "missing-milestone",
      }),
    });
    expect(rejected.status).toBe(404);
    expect(
      await db
        .select()
        .from(schema.projectTicketTable)
        .where(eq(schema.projectTicketTable.taskId, unscoped.id)),
    ).toEqual([]);
  });

  it("removes membership while preserving its task and Board Milestone", async () => {
    const member = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const project = await createProject(
      app,
      member.organization.id,
      member.user.id,
    );
    const task = await createTask(member.organization.id, 1);
    const [boardMilestone] = await db
      .insert(milestoneTable)
      .values({ boardId: task.boardId, name: "Board release" })
      .returning();
    if (!boardMilestone) throw new Error("Board milestone fixture failed");
    await db
      .update(schema.taskTable)
      .set({ milestoneId: boardMilestone.id })
      .where(eq(schema.taskTable.id, task.id));
    await addTicket(app, project.id, task.id);

    expect(
      (
        await app.request(`/api/project/${project.id}/tickets/${task.id}`, {
          method: "DELETE",
        })
      ).status,
    ).toBe(200);
    expect(
      await db
        .select()
        .from(schema.projectTicketTable)
        .where(eq(schema.projectTicketTable.taskId, task.id)),
    ).toEqual([]);
    const [persisted] = await db
      .select()
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, task.id));
    expect(persisted).toMatchObject({ milestoneId: boardMilestone.id });
  });

  it("excludes canceled, duplicate, archived, and deleted tickets from milestone progress", async () => {
    const member = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const project = await createProject(
      app,
      member.organization.id,
      member.user.id,
    );
    const milestone = await createMilestone(app, project.id, "Eligibility", 0);
    const done = await createTask(member.organization.id, 1, "done");
    const canceled = await createTask(member.organization.id, 2, "canceled");
    const duplicate = await createTask(member.organization.id, 3, "duplicate");
    const archived = await createTask(member.organization.id, 4);
    const deleted = await createTask(member.organization.id, 5);
    await db
      .update(schema.taskTable)
      .set({ archivedAt: new Date() })
      .where(eq(schema.taskTable.id, archived.id));
    await db
      .update(schema.taskTable)
      .set({ deletedAt: new Date() })
      .where(eq(schema.taskTable.id, deleted.id));
    for (const task of [done, canceled, duplicate, archived, deleted]) {
      const response = await app.request(`/api/project/${project.id}/tickets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          taskId: task.id,
          projectMilestoneId: milestone.id,
        }),
      });
      expect(response.status).toBe(200);
    }
    const [listed] = (await (
      await app.request(`/api/project/${project.id}/milestones`)
    ).json()) as Array<{ progress: unknown }>;
    expect(listed?.progress).toEqual({
      completed: 1,
      eligible: 1,
      percent: 100,
    });
  });

  it("keeps Project progress independent from milestone assignment", async () => {
    const member = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const project = await createProject(
      app,
      member.organization.id,
      member.user.id,
    );
    const milestone = await createMilestone(app, project.id, "Partial", 0);
    const assigned = await createTask(member.organization.id, 1, "done");
    const unassigned = await createTask(member.organization.id, 2);
    await addTicket(app, project.id, assigned.id);
    await addTicket(app, project.id, unassigned.id);
    expect(
      (
        await app.request(`/api/project/${project.id}/tickets/${assigned.id}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ projectMilestoneId: milestone.id }),
        })
      ).status,
    ).toBe(200);
    const projectBody = (await (
      await app.request(`/api/project/${project.id}`)
    ).json()) as { progress: unknown };
    expect(projectBody.progress).toEqual({
      completed: 1,
      eligible: 2,
      percent: 50,
    });
  });

  it("does not publish an update when membership creation rolls back", async () => {
    const member = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const project = await createProject(
      app,
      member.organization.id,
      member.user.id,
    );
    const task = await createTask(member.organization.id, 1);
    let updates = 0;
    await subscribeToEvent<{ projectId: string }>(
      "project.updated",
      async ({ projectId }) => {
        if (projectId === project.id) updates++;
      },
    );
    const response = await app.request(`/api/project/${project.id}/tickets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskId: task.id, projectMilestoneId: "missing" }),
    });
    expect(response.status).toBe(404);
    expect(updates).toBe(0);
  });
  it("does not leak invisible assigned tickets into milestone progress", async () => {
    const owner = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(owner.user);
    const { app: ownerApp } = createApp();
    const project = await createProject(
      ownerApp,
      owner.organization.id,
      owner.user.id,
    );
    const milestone = await createMilestone(ownerApp, project.id, "Private", 0);
    const task = await createTask(owner.organization.id, 1, "done");
    await addTicket(ownerApp, project.id, task.id);
    expect(
      (
        await ownerApp.request(
          `/api/project/${project.id}/tickets/${task.id}`,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ projectMilestoneId: milestone.id }),
          },
        )
      ).status,
    ).toBe(200);
    await db
      .update(schema.projectTable)
      .set({ orgPrivilege: "none" })
      .where(eq(schema.projectTable.id, project.id));
    await db
      .update(schema.boardTable)
      .set({ orgPrivilege: "none" })
      .where(eq(schema.boardTable.id, task.boardId));
    const viewerId = `user-${randomUUID()}`;
    await db.insert(schema.userTable).values({
      id: viewerId,
      email: `${viewerId}@example.com`,
      emailVerified: true,
      name: "Project-only viewer",
    });
    await db.insert(schema.organizationMemberTable).values({
      id: `member-${randomUUID()}`,
      organizationId: owner.organization.id,
      userId: viewerId,
      role: "member",
      joinedAt: new Date(),
    });
    await db.insert(schema.resourceGrantTable).values({
      organizationId: owner.organization.id,
      resourceType: "project",
      resourceId: project.id,
      userId: viewerId,
      privilege: "view",
    });
    const viewer = await db.query.userTable.findFirst({
      where: eq(schema.userTable.id, viewerId),
    });
    if (!viewer) throw new Error("Viewer fixture failed");
    mockAuthenticatedSession(viewer);
    const { app } = createApp();
    const tickets = (await (
      await app.request(`/api/project/${project.id}/tickets`)
    ).json()) as { tickets: unknown[]; progress: unknown };
    expect(tickets).toEqual({
      tickets: [],
      progress: { completed: 0, eligible: 0, percent: null },
    });
    const [listed] = (await (
      await app.request(`/api/project/${project.id}/milestones`)
    ).json()) as Array<{ progress: unknown }>;
    expect(listed?.progress).toEqual({
      completed: 0,
      eligible: 0,
      percent: null,
    });
  });

  it("enforces the two-resource authority matrix on milestone assignment", async () => {
    const owner = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(owner.user);
    const { app: ownerApp } = createApp();
    const project = await createProject(
      ownerApp,
      owner.organization.id,
      owner.user.id,
    );
    const milestone = await createMilestone(ownerApp, project.id, "Sprint", 0);
    const task = await createTask(owner.organization.id, 1);
    await addTicket(ownerApp, project.id, task.id);

    // Acting user with Project edit but WITHOUT ticket update authority.
    const projectEditorId = `user-${randomUUID()}`;
    await db.insert(schema.userTable).values({
      id: projectEditorId,
      email: `${projectEditorId}@example.com`,
      emailVerified: true,
      name: "Project editor",
    });
    await db.insert(schema.organizationMemberTable).values({
      id: `member-${randomUUID()}`,
      organizationId: owner.organization.id,
      userId: projectEditorId,
      role: "project_editor",
      joinedAt: new Date(),
    });
    await db.insert(schema.organizationRoleTable).values({
      organizationId: owner.organization.id,
      role: "project_editor",
      permission: JSON.stringify({ project: ["update"] }),
    });
    const projectEditor = await db.query.userTable.findFirst({
      where: eq(schema.userTable.id, projectEditorId),
    });
    if (!projectEditor) throw new Error("Project editor fixture failed");

    // Acting user with Ticket edit but WITHOUT project update authority.
    const ticketEditorId = `user-${randomUUID()}`;
    await db.insert(schema.userTable).values({
      id: ticketEditorId,
      email: `${ticketEditorId}@example.com`,
      emailVerified: true,
      name: "Ticket editor",
    });
    await db.insert(schema.organizationMemberTable).values({
      id: `member-${randomUUID()}`,
      organizationId: owner.organization.id,
      userId: ticketEditorId,
      role: "ticket_editor",
      joinedAt: new Date(),
    });
    await db.insert(schema.organizationRoleTable).values({
      organizationId: owner.organization.id,
      role: "ticket_editor",
      permission: JSON.stringify({ task: ["update"] }),
    });
    const ticketEditor = await db.query.userTable.findFirst({
      where: eq(schema.userTable.id, ticketEditorId),
    });
    if (!ticketEditor) throw new Error("Ticket editor fixture failed");

    const assignUrl = `/api/project/${project.id}/tickets/${task.id}`;
    const assignBody = JSON.stringify({
      projectMilestoneId: milestone.id,
    });

    // Project edit without Ticket edit → rejected.
    mockAuthenticatedSession(projectEditor);
    const { app: projectEditorApp } = createApp();
    expect(
      (
        await projectEditorApp.request(assignUrl, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: assignBody,
        })
      ).status,
    ).toBe(403);

    // Ticket edit without Project edit → rejected.
    mockAuthenticatedSession(ticketEditor);
    const { app: ticketEditorApp } = createApp();
    expect(
      (
        await ticketEditorApp.request(assignUrl, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: assignBody,
        })
      ).status,
    ).toBe(403);

    // Every rejection left the existing membership row untouched.
    const [before] = await db
      .select()
      .from(schema.projectTicketTable)
      .where(eq(schema.projectTicketTable.taskId, task.id));
    expect(before?.projectMilestoneId ?? null).toBeNull();

    // Both authorities → accepted.
    mockAuthenticatedSession(owner.user);
    const accepted = await ownerApp.request(assignUrl, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: assignBody,
    });
    expect(accepted.status).toBe(200);
    const [after] = await db
      .select()
      .from(schema.projectTicketTable)
      .where(eq(schema.projectTicketTable.taskId, task.id));
    expect(after?.projectMilestoneId ?? null).toBe(milestone.id);
  });
});
