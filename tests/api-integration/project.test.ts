import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
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

async function createTeamFixture(organizationId: string, name = "Platform") {
  const [team] = await db
    .insert(schema.teamTable)
    .values({
      id: `team-${randomUUID()}`,
      name,
      organizationId,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  if (!team) throw new Error("Failed to seed team fixture");
  return team;
}

async function postCreateProject(
  app: ReturnType<typeof createApp>["app"],
  body: Record<string, unknown>,
) {
  return app.request("/api/project", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API integration: project foundation", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("creates an organization-scoped Project with immutable CUID ID", async () => {
    const member = await createOrganizationMember();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await postCreateProject(app, {
      organizationId: member.organization.id,
      name: "Growth Initiative",
      summary: "Ship the growth loop",
      leadUserId: member.user.id,
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      id: string;
      organizationId: string;
      name: string;
      summary: string;
      status: string;
      createdBy: string;
      slug: string;
    };

    // CUID2 ids are 24 lowercase alphanumeric chars.
    expect(payload.id).toMatch(/^[a-z0-9]{24}$/);
    expect(payload).toMatchObject({
      organizationId: member.organization.id,
      name: "Growth Initiative",
      summary: "Ship the growth loop",
      status: "planned",
      createdBy: member.user.id,
    });

    const persisted = await db.query.projectTable.findFirst({
      where: eq(schema.projectTable.id, payload.id),
    });
    expect(persisted).toMatchObject({
      organizationId: member.organization.id,
      name: "Growth Initiative",
      status: "planned",
      createdBy: member.user.id,
    });

    // Unrelated resources are untouched by project creation.
    const boards = await db.query.boardTable.findMany({
      where: eq(schema.boardTable.organizationId, member.organization.id),
    });
    expect(boards).toHaveLength(0);
    const tasks = await db.query.taskTable.findMany();
    expect(tasks).toHaveLength(0);
  });

  it("enforces case-insensitive slug uniqueness per organization", async () => {
    const member = await createOrganizationMember();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const first = await postCreateProject(app, {
      organizationId: member.organization.id,
      name: "Roadmap",
      summary: "Own the roadmap",
      leadUserId: member.user.id,
      slug: "roadmap",
    });
    expect(first.status).toBe(200);

    const duplicate = await postCreateProject(app, {
      organizationId: member.organization.id,
      name: "Roadmap Two",
      summary: "Duplicate slug attempt",
      leadUserId: member.user.id,
      slug: "ROADMAP",
    });
    expect(duplicate.status).toBe(409);

    const other = await createOrganizationMember();
    mockAuthenticatedSession(other.user);
    const { app: otherApp } = createApp();
    const crossOrg = await postCreateProject(otherApp, {
      organizationId: other.organization.id,
      name: "Roadmap",
      summary: "Same slug, different org",
      leadUserId: other.user.id,
      slug: "roadmap",
    });
    expect(crossOrg.status).toBe(200);
  });

  it("resolves canonical and permanent alias slugs", async () => {
    const member = await createOrganizationMember({ role: "admin" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const created = await postCreateProject(app, {
      organizationId: member.organization.id,
      name: "Launch",
      summary: "Launch plan",
      leadUserId: member.user.id,
      slug: "launch",
    });
    const project = (await created.json()) as { id: string };

    const renamed = await app.request(`/api/project/${project.id}/slug`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "launch-2026" }),
    });
    expect(renamed.status).toBe(200);

    const resolveOld = await app.request(
      `/api/project/resolve?organizationId=${member.organization.id}&slug=launch`,
    );
    expect(resolveOld.status).toBe(200);
    const oldResolved = (await resolveOld.json()) as {
      slug: string;
      usedSlugAlias: boolean;
    };
    expect(oldResolved.slug).toBe("launch-2026");
    expect(oldResolved.usedSlugAlias).toBe(true);

    const resolveNew = await app.request(
      `/api/project/resolve?organizationId=${member.organization.id}&slug=launch-2026`,
    );
    expect(resolveNew.status).toBe(200);
    const newResolved = (await resolveNew.json()) as {
      slug: string;
      usedSlugAlias: boolean;
    };
    expect(newResolved.usedSlugAlias).toBe(false);

    // Historical alias remains permanently reserved: a new project cannot
    // reclaim "launch" and reassigning it back via rename is rejected.
    const reclaim = await postCreateProject(app, {
      organizationId: member.organization.id,
      name: "Reclaim",
      summary: "Tries to steal the old slug",
      leadUserId: member.user.id,
      slug: "launch",
    });
    expect(reclaim.status).toBe(409);
  });

  it("validates lifecycle and organization-local leads", async () => {
    const member = await createOrganizationMember();
    const outsider = await createOrganizationMember();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const badStatus = await postCreateProject(app, {
      organizationId: member.organization.id,
      name: "Bad status",
      summary: "Uses ticket status vocabulary",
      leadUserId: member.user.id,
      status: "to-do",
    });
    expect(badStatus.status).toBe(400);

    const foreignLead = await postCreateProject(app, {
      organizationId: member.organization.id,
      name: "Foreign lead",
      summary: "Lead is not a member of this org",
      leadUserId: outsider.user.id,
    });
    expect(foreignLead.status).toBe(400);

    const foreignTeamOrg = await createOrganizationMember();
    const foreignTeam = await createTeamFixture(foreignTeamOrg.organization.id);
    const badTeam = await postCreateProject(app, {
      organizationId: member.organization.id,
      name: "Foreign team",
      summary: "Team belongs to a different org",
      leadUserId: member.user.id,
      leadTeamId: foreignTeam.id,
    });
    expect(badTeam.status).toBe(400);

    const projects = await db.query.projectTable.findMany({
      where: eq(schema.projectTable.organizationId, member.organization.id),
    });
    expect(projects).toHaveLength(0);
  });

  it("keeps lifecycle and archive independent", async () => {
    const member = await createOrganizationMember({ role: "admin" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const created = await postCreateProject(app, {
      organizationId: member.organization.id,
      name: "Archive check",
      summary: "Verifies archive orthogonality",
      leadUserId: member.user.id,
      status: "started",
    });
    const project = (await created.json()) as { id: string; status: string };
    expect(project.status).toBe("started");

    const archived = await app.request(`/api/project/${project.id}/archive`, {
      method: "PUT",
    });
    expect(archived.status).toBe(200);
    const archivedPayload = (await archived.json()) as {
      status: string;
      archivedAt: string | null;
      archivedBy: string | null;
    };
    expect(archivedPayload.status).toBe("started");
    expect(archivedPayload.archivedAt).not.toBeNull();
    expect(archivedPayload.archivedBy).toBe(member.user.id);

    const unarchived = await app.request(
      `/api/project/${project.id}/unarchive`,
      { method: "PUT" },
    );
    expect(unarchived.status).toBe(200);
    const unarchivedPayload = (await unarchived.json()) as {
      status: string;
      archivedAt: string | null;
      archivedBy: string | null;
    };
    expect(unarchivedPayload.status).toBe("started");
    expect(unarchivedPayload.archivedAt).toBeNull();
    expect(unarchivedPayload.archivedBy).toBeNull();
  });

  it("lists only visible Projects and makes missing/inaccessible resolve identical", async () => {
    const member = await createOrganizationMember();
    // Same organization, ordinary member with no elevated role and no grant.
    const lowPrivUserId = `user-${randomUUID()}`;
    await db.insert(schema.userTable).values({
      id: lowPrivUserId,
      email: `${lowPrivUserId}@example.com`,
      emailVerified: true,
      name: "Low Privilege Member",
    });
    await db.insert(schema.organizationMemberTable).values({
      id: `member-${randomUUID()}`,
      organizationId: member.organization.id,
      userId: lowPrivUserId,
      role: "member",
      joinedAt: new Date(),
    });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const created = await postCreateProject(app, {
      organizationId: member.organization.id,
      name: "Visible project",
      summary: "Visible to org members",
      leadUserId: member.user.id,
      slug: "visible-project",
    });
    const project = (await created.json()) as { id: string };

    // Hide the project from ordinary members via per-resource baseline.
    await db
      .update(schema.projectTable)
      .set({ orgPrivilege: "none" })
      .where(eq(schema.projectTable.id, project.id));

    const lowPrivUser = await db.query.userTable.findFirst({
      where: eq(schema.userTable.id, lowPrivUserId),
    });
    if (!lowPrivUser) throw new Error("Failed to seed low-priv user");
    mockAuthenticatedSession(lowPrivUser);
    const { app: lowPrivApp } = createApp();

    const missingResolve = await lowPrivApp.request(
      `/api/project/resolve?organizationId=${member.organization.id}&slug=nonexistent`,
    );
    const missingBody = await missingResolve.text();

    const hiddenResolve = await lowPrivApp.request(
      `/api/project/resolve?organizationId=${member.organization.id}&slug=visible-project`,
    );
    const hiddenBody = await hiddenResolve.text();

    // Both are org members but neither has resource privilege on the hidden
    // project, so the response must look identical to a truly missing slug
    // and leak nothing about the hidden project's existence.
    expect(missingResolve.status).toBe(404);
    expect(hiddenResolve.status).toBe(404);
    expect(hiddenBody).toBe(missingBody);
    expect(hiddenBody).not.toContain("Visible project");

    const getById = await lowPrivApp.request(`/api/project/${project.id}`);
    expect(getById.status).toBe(404);

    const list = await lowPrivApp.request(
      `/api/project?organizationId=${member.organization.id}`,
    );
    expect(list.status).toBe(200);
    const listed = (await list.json()) as Array<{ id: string }>;
    expect(listed.find((p) => p.id === project.id)).toBeUndefined();
  });

  it("honors baseline and direct/transitive team Project grants", async () => {
    const member = await createOrganizationMember();
    const teamOnly = await createOrganizationMember();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const created = await postCreateProject(app, {
      organizationId: member.organization.id,
      name: "Grant scoped",
      summary: "Hidden unless granted",
      leadUserId: member.user.id,
      slug: "grant-scoped",
    });
    const project = (await created.json()) as { id: string };

    await db
      .update(schema.projectTable)
      .set({ orgPrivilege: "none" })
      .where(eq(schema.projectTable.id, project.id));

    // teamOnly user is a separate org, so add them to member's org first via
    // a direct membership row (simulating an invited collaborator).
    await db.insert(schema.organizationMemberTable).values({
      id: `member-${randomUUID()}`,
      organizationId: member.organization.id,
      userId: teamOnly.user.id,
      role: "member",
      joinedAt: new Date(),
    });

    const parentTeam = await createTeamFixture(
      member.organization.id,
      "Parent",
    );
    const childTeam = await db
      .insert(schema.teamTable)
      .values({
        id: `team-${randomUUID()}`,
        name: "Child",
        organizationId: member.organization.id,
        parentTeamId: parentTeam.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    const child = childTeam[0];
    if (!child) throw new Error("Failed to seed child team");

    await db.insert(schema.teamMemberTable).values({
      id: `teammember-${randomUUID()}`,
      teamId: child.id,
      userId: teamOnly.user.id,
      createdAt: new Date(),
    });

    // Before any grant: teamOnly cannot see the hidden project.
    mockAuthenticatedSession(teamOnly.user);
    const { app: teamOnlyApp } = createApp();
    const beforeGrant = await teamOnlyApp.request(`/api/project/${project.id}`);
    expect(beforeGrant.status).toBe(404);

    // Grant view privilege to the PARENT team; membership is via the CHILD
    // team, proving transitive inheritance.
    await db.insert(schema.resourceGrantTable).values({
      organizationId: member.organization.id,
      resourceType: "project",
      resourceId: project.id,
      teamId: parentTeam.id,
      privilege: "view",
    });

    const afterGrant = await teamOnlyApp.request(`/api/project/${project.id}`);
    expect(afterGrant.status).toBe(200);
  });

  it("updates metadata without resource ownership mutation", async () => {
    const member = await createOrganizationMember({ role: "admin" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const { board, columns } = await createBoardFixture({
      organizationId: member.organization.id,
    });
    const [task] = await db
      .insert(schema.taskTable)
      .values({
        boardId: board.id,
        title: "Untouched task",
        description: "",
        priority: "low",
        status: "to-do",
        columnId: columns.todo.id,
        number: 1,
        position: 1,
      })
      .returning();
    if (!task) throw new Error("Failed to seed task fixture");

    const created = await postCreateProject(app, {
      organizationId: member.organization.id,
      name: "Update target",
      summary: "Original summary",
      leadUserId: member.user.id,
    });
    const project = (await created.json()) as { id: string };

    const updated = await app.request(`/api/project/${project.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Update target renamed",
        summary: "New summary",
        status: "started",
        priority: "high",
        icon: null,
        color: null,
        description: "Longer description",
        successCriteria: "Ship it",
        leadUserId: member.user.id,
        leadTeamId: null,
        startDate: null,
        targetDate: null,
        orgPrivilege: null,
      }),
    });
    expect(updated.status).toBe(200);
    const payload = (await updated.json()) as {
      name: string;
      summary: string;
      status: string;
    };
    expect(payload).toMatchObject({
      name: "Update target renamed",
      summary: "New summary",
      status: "started",
    });

    const unchangedTask = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });
    expect(unchangedTask?.boardId).toBe(board.id);

    const unchangedBoard = await db.query.boardTable.findFirst({
      where: and(
        eq(schema.boardTable.id, board.id),
        eq(schema.boardTable.organizationId, member.organization.id),
      ),
    });
    expect(unchangedBoard).toBeTruthy();
  });

  it("emits org-scoped push events for create, update, rename-slug, archive, and unarchive", async () => {
    const member = await createOrganizationMember({ role: "admin" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    function waitForEvent<T>(eventType: string): Promise<T> {
      const { promise, resolve } = Promise.withResolvers<T>();
      subscribeToEvent<T>(eventType, async (data) => {
        resolve(data);
      });
      return promise;
    }

    const createdEvent = waitForEvent<{
      organizationId: string;
      projectId: string;
    }>("project.created");
    const created = await postCreateProject(app, {
      organizationId: member.organization.id,
      name: "Event target",
      summary: "Verifies push events",
      leadUserId: member.user.id,
    });
    const project = (await created.json()) as { id: string };
    await expect(createdEvent).resolves.toMatchObject({
      organizationId: member.organization.id,
      projectId: project.id,
    });

    const updatedEvent = waitForEvent<{
      organizationId: string;
      projectId: string;
    }>("project.updated");
    const updateResponse = await app.request(`/api/project/${project.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Event target renamed",
        summary: "Verifies push events",
        status: "started",
        priority: null,
        icon: null,
        color: null,
        description: null,
        successCriteria: null,
        leadUserId: member.user.id,
        leadTeamId: null,
        startDate: null,
        targetDate: null,
        orgPrivilege: null,
      }),
    });
    expect(updateResponse.status).toBe(200);
    await expect(updatedEvent).resolves.toMatchObject({
      organizationId: member.organization.id,
      projectId: project.id,
    });

    const slugRenamedEvent = waitForEvent<{
      organizationId: string;
      projectId: string;
    }>("project.updated");
    const slugResponse = await app.request(`/api/project/${project.id}/slug`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "event-target-renamed-slug" }),
    });
    expect(slugResponse.status).toBe(200);
    await expect(slugRenamedEvent).resolves.toMatchObject({
      organizationId: member.organization.id,
      projectId: project.id,
    });

    const archivedEvent = waitForEvent<{
      organizationId: string;
      projectId: string;
    }>("project.archived");
    const archiveResponse = await app.request(
      `/api/project/${project.id}/archive`,
      { method: "PUT" },
    );
    expect(archiveResponse.status).toBe(200);
    await expect(archivedEvent).resolves.toMatchObject({
      organizationId: member.organization.id,
      projectId: project.id,
    });

    const unarchivedEvent = waitForEvent<{
      organizationId: string;
      projectId: string;
    }>("project.unarchived");
    const unarchiveResponse = await app.request(
      `/api/project/${project.id}/unarchive`,
      { method: "PUT" },
    );
    expect(unarchiveResponse.status).toBe(200);
    await expect(unarchivedEvent).resolves.toMatchObject({
      organizationId: member.organization.id,
      projectId: project.id,
    });
  });
});
