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

async function createProject(
  app: ReturnType<typeof createApp>["app"],
  body: {
    organizationId: string;
    name: string;
    leadUserId: string;
  },
) {
  const response = await app.request("/api/project", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, summary: "summary" }),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as { id: string; slug: string };
}

async function createRepoFixture(
  organizationId: string,
  owner = "kaneo-test",
  name = `repo-${randomUUID()}`,
) {
  const [repo] = await db
    .insert(schema.repoTable)
    .values({
      organizationId,
      provider: "github",
      owner,
      name,
      url: `https://github.com/${owner}/${name}`,
    })
    .returning();
  if (!repo) throw new Error("Failed to seed repo fixture");
  return repo;
}

async function createTableFixture(organizationId: string) {
  await db
    .update(schema.organizationTable)
    .set({ tablesEnabled: true })
    .where(eq(schema.organizationTable.id, organizationId));
  const [table] = await db
    .insert(schema.dataTableTable)
    .values({ organizationId, name: `table-${randomUUID()}` })
    .returning();
  if (!table) throw new Error("Failed to seed table fixture");
  return table;
}

async function addMemberToOrg(organizationId: string, userId: string) {
  await db.insert(schema.organizationMemberTable).values({
    id: `member-${randomUUID()}`,
    organizationId,
    userId,
    role: "member",
    joinedAt: new Date(),
  });
}

describe("API integration: project resource links", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("links one same-organization Board with Project relationship metadata", async () => {
    const member = await createOrganizationMember({ role: "admin" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const project = await createProject(app, {
      organizationId: member.organization.id,
      name: "Board linked",
      leadUserId: member.user.id,
    });
    const { board } = await createBoardFixture({
      organizationId: member.organization.id,
      name: "Linked Board",
    });

    const response = await app.request(`/api/project/${project.id}/resources`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resourceType: "board",
        resourceId: board.id,
        relationship: "dependency",
        label: "Primary",
        note: "Drives the roadmap",
        rank: 3,
      }),
    });

    expect(response.status).toBe(200);
    const link = (await response.json()) as Record<string, unknown>;
    expect(link).toMatchObject({
      projectId: project.id,
      resourceType: "board",
      resourceId: board.id,
      relationship: "dependency",
      label: "Primary",
      note: "Drives the roadmap",
      rank: 3,
      createdBy: member.user.id,
    });
    expect(link.resource).toMatchObject({
      id: board.id,
      slug: board.slug,
      name: "Linked Board",
    });

    // Board itself is untouched.
    const persistedBoard = await db.query.boardTable.findFirst({
      where: eq(schema.boardTable.id, board.id),
    });
    expect(persistedBoard?.name).toBe("Linked Board");
  });

  it("links one same-organization Repo with a safe projection", async () => {
    const member = await createOrganizationMember({ role: "admin" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const project = await createProject(app, {
      organizationId: member.organization.id,
      name: "Repo linked",
      leadUserId: member.user.id,
    });
    const repo = await createRepoFixture(member.organization.id);

    const response = await app.request(`/api/project/${project.id}/resources`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resourceType: "repo",
        resourceId: repo.id,
        relationship: "context",
      }),
    });

    expect(response.status).toBe(200);
    const link = (await response.json()) as Record<string, unknown>;
    expect(link.resource).toMatchObject({
      id: repo.id,
      owner: repo.owner,
      name: repo.name,
      provider: "github",
      url: repo.url,
    });
    expect(link.resource).not.toHaveProperty("config");
    expect(link.resource).not.toHaveProperty("installationId");
  });

  it("links one same-organization Table without exposing rows or cells", async () => {
    const member = await createOrganizationMember({ role: "admin" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const project = await createProject(app, {
      organizationId: member.organization.id,
      name: "Table linked",
      leadUserId: member.user.id,
    });
    const table = await createTableFixture(member.organization.id);

    const response = await app.request(`/api/project/${project.id}/resources`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resourceType: "table",
        resourceId: table.id,
        relationship: "deliverable",
      }),
    });

    expect(response.status).toBe(200);
    const link = (await response.json()) as Record<string, unknown>;
    expect(link.resource).toEqual({
      id: table.id,
      name: table.name,
      icon: table.icon,
    });
  });

  it("rejects cross-organization Project Resource links for every Resource type", async () => {
    const member = await createOrganizationMember({ role: "admin" });
    const other = await createOrganizationMember();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const project = await createProject(app, {
      organizationId: member.organization.id,
      name: "Cross org",
      leadUserId: member.user.id,
    });
    const { board } = await createBoardFixture({
      organizationId: other.organization.id,
    });
    const repo = await createRepoFixture(other.organization.id);
    const table = await createTableFixture(other.organization.id);

    for (const [resourceType, resourceId] of [
      ["board", board.id],
      ["repo", repo.id],
      ["table", table.id],
    ] as const) {
      const response = await app.request(
        `/api/project/${project.id}/resources`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            resourceType,
            resourceId,
            relationship: "context",
          }),
        },
      );
      expect(response.status).toBe(404);
      expect(await response.text()).toContain("Resource not found");
    }

    expect(await db.select().from(schema.projectBoardTable)).toHaveLength(0);
    expect(await db.select().from(schema.projectRepoTable)).toHaveLength(0);
    expect(await db.select().from(schema.projectTableLinkTable)).toHaveLength(
      0,
    );
  });

  it("requires caller discoverability of the target Resource", async () => {
    const member = await createOrganizationMember();
    // Grant project:update to the member WITHOUT making them an org admin, so
    // `hasOrganizationWideResourceAccess` stays false and target `view` is
    // actually enforced rather than bypassed by the admin/manage lattice.
    await db.insert(schema.organizationRoleTable).values({
      organizationId: member.organization.id,
      role: "member",
      permission: JSON.stringify({
        project: ["create", "read", "update"],
        board: ["create", "read"],
        task: ["create", "read", "update"],
        label: ["create", "read", "update", "delete"],
        organization: ["read"],
      }),
    });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const project = await createProject(app, {
      organizationId: member.organization.id,
      name: "Hidden target",
      leadUserId: member.user.id,
    });
    const { board } = await createBoardFixture({
      organizationId: member.organization.id,
      name: "Hidden Board",
    });
    await db
      .update(schema.boardTable)
      .set({ orgPrivilege: "none" })
      .where(eq(schema.boardTable.id, board.id));

    const response = await app.request(`/api/project/${project.id}/resources`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resourceType: "board",
        resourceId: board.id,
        relationship: "context",
      }),
    });

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Resource not found");
    expect(await db.select().from(schema.projectBoardTable)).toHaveLength(0);
  });

  it("does not grant access through a Project Resource link", async () => {
    const admin = await createOrganizationMember({ role: "admin" });
    const viewer = await createOrganizationMember();
    await addMemberToOrg(admin.organization.id, viewer.user.id);

    mockAuthenticatedSession(admin.user);
    const { app } = createApp();

    const project = await createProject(app, {
      organizationId: admin.organization.id,
      name: "No grant leak",
      leadUserId: admin.user.id,
    });
    const { board } = await createBoardFixture({
      organizationId: admin.organization.id,
    });
    await db
      .update(schema.boardTable)
      .set({ orgPrivilege: "none" })
      .where(eq(schema.boardTable.id, board.id));

    // Admin can still view (manage) and links it.
    const linkResponse = await app.request(
      `/api/project/${project.id}/resources`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resourceType: "board",
          resourceId: board.id,
          relationship: "context",
        }),
      },
    );
    expect(linkResponse.status).toBe(200);

    // Viewer (no resource grant on the hidden board) gets no link and no
    // canonical board access.
    mockAuthenticatedSession(viewer.user);
    const { app: viewerApp } = createApp();
    const links = await viewerApp.request(
      `/api/project/${project.id}/resources`,
    );
    expect(links.status).toBe(200);
    expect(await links.json()).toHaveLength(0);
  });

  it("omits inaccessible linked Resources without metadata or count leakage", async () => {
    const admin = await createOrganizationMember({ role: "admin" });
    const viewer = await createOrganizationMember();
    await addMemberToOrg(admin.organization.id, viewer.user.id);

    mockAuthenticatedSession(admin.user);
    const { app } = createApp();

    const project = await createProject(app, {
      organizationId: admin.organization.id,
      name: "Filtered links",
      leadUserId: admin.user.id,
    });
    const visible = await createBoardFixture({
      organizationId: admin.organization.id,
      name: "Visible",
    });
    const hidden = await createBoardFixture({
      organizationId: admin.organization.id,
      name: "Hidden",
    });
    await db
      .update(schema.boardTable)
      .set({ orgPrivilege: "none" })
      .where(eq(schema.boardTable.id, hidden.board.id));

    for (const resourceId of [visible.board.id, hidden.board.id]) {
      await app.request(`/api/project/${project.id}/resources`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resourceType: "board",
          resourceId,
          relationship: "context",
        }),
      });
    }

    mockAuthenticatedSession(viewer.user);
    const { app: viewerApp } = createApp();
    const linksResponse = await viewerApp.request(
      `/api/project/${project.id}/resources`,
    );
    expect(linksResponse.status).toBe(200);
    const links = (await linksResponse.json()) as Array<{ resourceId: string }>;
    expect(links).toHaveLength(1);
    expect(links[0]?.resourceId).toBe(visible.board.id);
  });

  it("enforces one link per Project and Resource while allowing the Resource in another Project", async () => {
    const member = await createOrganizationMember({ role: "admin" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const first = await createProject(app, {
      organizationId: member.organization.id,
      name: "First",
      leadUserId: member.user.id,
    });
    const second = await createProject(app, {
      organizationId: member.organization.id,
      name: "Second",
      leadUserId: member.user.id,
    });
    const { board } = await createBoardFixture({
      organizationId: member.organization.id,
    });

    const firstLink = await app.request(`/api/project/${first.id}/resources`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resourceType: "board",
        resourceId: board.id,
        relationship: "context",
      }),
    });
    expect(firstLink.status).toBe(200);

    const duplicate = await app.request(`/api/project/${first.id}/resources`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resourceType: "board",
        resourceId: board.id,
        relationship: "dependency",
      }),
    });
    expect(duplicate.status).toBe(409);

    const secondLink = await app.request(
      `/api/project/${second.id}/resources`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resourceType: "board",
          resourceId: board.id,
          relationship: "deliverable",
        }),
      },
    );
    expect(secondLink.status).toBe(200);
  });

  it("updates relationship metadata without retargeting the link", async () => {
    const member = await createOrganizationMember({ role: "admin" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const project = await createProject(app, {
      organizationId: member.organization.id,
      name: "Update metadata",
      leadUserId: member.user.id,
    });
    const { board } = await createBoardFixture({
      organizationId: member.organization.id,
    });
    const created = await app.request(`/api/project/${project.id}/resources`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resourceType: "board",
        resourceId: board.id,
        relationship: "context",
      }),
    });
    const link = (await created.json()) as { id: string };

    const update = await app.request(
      `/api/project/${project.id}/resources/${link.id}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          relationship: "deliverable",
          label: "Renamed",
          note: null,
          rank: 9,
        }),
      },
    );
    expect(update.status).toBe(200);
    const updated = (await update.json()) as Record<string, unknown>;
    expect(updated).toMatchObject({
      id: link.id,
      resourceType: "board",
      resourceId: board.id,
      relationship: "deliverable",
      label: "Renamed",
      rank: 9,
    });

    // Negative/invalid rank is rejected at validation.
    const badRank = await app.request(
      `/api/project/${project.id}/resources/${link.id}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ relationship: "context", rank: -1 }),
      },
    );
    expect(badRank.status).toBe(400);
  });

  it("unlinks without deleting archiving or mutating the Resource", async () => {
    const member = await createOrganizationMember({ role: "admin" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const project = await createProject(app, {
      organizationId: member.organization.id,
      name: "Unlink",
      leadUserId: member.user.id,
    });
    const { board } = await createBoardFixture({
      organizationId: member.organization.id,
    });
    const created = await app.request(`/api/project/${project.id}/resources`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resourceType: "board",
        resourceId: board.id,
        relationship: "context",
      }),
    });
    const link = (await created.json()) as { id: string };

    const del = await app.request(
      `/api/project/${project.id}/resources/${link.id}`,
      { method: "DELETE" },
    );
    expect(del.status).toBe(204);
    const repeated = await app.request(
      `/api/project/${project.id}/resources/${link.id}`,
      { method: "DELETE" },
    );
    expect(repeated.status).toBe(204);
  });

  it.each(["repo", "table"] as const)(
    "repeatedly unlinks %s without mutating the target",
    async (resourceType) => {
      const member = await createOrganizationMember({ role: "admin" });
      mockAuthenticatedSession(member.user);
      const { app } = createApp();
      const project = await createProject(app, {
        organizationId: member.organization.id,
        name: `Repeat ${resourceType}`,
        leadUserId: member.user.id,
      });
      const resource =
        resourceType === "repo"
          ? await createRepoFixture(member.organization.id)
          : await createTableFixture(member.organization.id);
      const created = await app.request(
        `/api/project/${project.id}/resources`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            resourceType,
            resourceId: resource.id,
            relationship: "context",
          }),
        },
      );
      expect(created.status).toBe(200);
      const link = (await created.json()) as { id: string };
      const path = `/api/project/${project.id}/resources/${link.id}`;
      expect((await app.request(path, { method: "DELETE" })).status).toBe(204);
      expect((await app.request(path, { method: "DELETE" })).status).toBe(204);
      expect(
        await db
          .select()
          .from(
            resourceType === "repo"
              ? schema.projectRepoTable
              : schema.projectTableLinkTable,
          ),
      ).toHaveLength(0);
    },
  );

  it("deleting a Project or Resource cascades only its association rows", async () => {
    const member = await createOrganizationMember({ role: "admin" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const project = await createProject(app, {
      organizationId: member.organization.id,
      name: "Cascade",
      leadUserId: member.user.id,
    });
    const { board } = await createBoardFixture({
      organizationId: member.organization.id,
    });
    await app.request(`/api/project/${project.id}/resources`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resourceType: "board",
        resourceId: board.id,
        relationship: "context",
      }),
    });
    expect(await db.select().from(schema.projectBoardTable)).toHaveLength(1);

    await db
      .delete(schema.boardTable)
      .where(eq(schema.boardTable.id, board.id));
    expect(await db.select().from(schema.projectBoardTable)).toHaveLength(0);

    const projectStillExists = await db.query.projectTable.findFirst({
      where: eq(schema.projectTable.id, project.id),
    });
    expect(projectStillExists).not.toBeNull();
  });

  it("keeps contextual Resource links out of Project progress", async () => {
    const member = await createOrganizationMember({ role: "admin" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const project = await createProject(app, {
      organizationId: member.organization.id,
      name: "Progress isolation",
      leadUserId: member.user.id,
    });
    const { board } = await createBoardFixture({
      organizationId: member.organization.id,
    });
    await app.request(`/api/project/${project.id}/resources`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resourceType: "board",
        resourceId: board.id,
        relationship: "context",
      }),
    });

    const detail = await app.request(`/api/project/${project.id}`);
    expect(detail.status).toBe(200);
    const body = (await detail.json()) as { progress: unknown };
    expect(body.progress).toBeNull();
  });

  it("publishes project.updated after link create update and delete", async () => {
    const member = await createOrganizationMember({ role: "admin" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const project = await createProject(app, {
      organizationId: member.organization.id,
      name: "Events",
      leadUserId: member.user.id,
    });
    const { board } = await createBoardFixture({
      organizationId: member.organization.id,
    });

    function waitForEvent<T>(eventType: string): Promise<T> {
      const { promise, resolve } = Promise.withResolvers<T>();
      subscribeToEvent<T>(eventType, async (data) => resolve(data));
      return promise;
    }

    const createEvent = waitForEvent<{ projectId: string }>("project.updated");
    const created = await app.request(`/api/project/${project.id}/resources`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resourceType: "board",
        resourceId: board.id,
        relationship: "context",
      }),
    });
    expect(created.status).toBe(200);
    const link = (await created.json()) as { id: string };
    await expect(createEvent).resolves.toMatchObject({ projectId: project.id });

    const updateEvent = waitForEvent<{ projectId: string }>("project.updated");
    await app.request(`/api/project/${project.id}/resources/${link.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ relationship: "dependency" }),
    });
    await expect(updateEvent).resolves.toMatchObject({ projectId: project.id });

    const deleteEvent = waitForEvent<{ projectId: string }>("project.updated");
    await app.request(`/api/project/${project.id}/resources/${link.id}`, {
      method: "DELETE",
    });
    await expect(deleteEvent).resolves.toMatchObject({ projectId: project.id });
  });

  it("database constraints reject invalid relationship and negative rank", async () => {
    const member = await createOrganizationMember({ role: "admin" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const project = await createProject(app, {
      organizationId: member.organization.id,
      name: "Constraints",
      leadUserId: member.user.id,
    });
    const { board } = await createBoardFixture({
      organizationId: member.organization.id,
    });

    await expect(
      db.insert(schema.projectBoardTable).values({
        organizationId: member.organization.id,
        projectId: project.id,
        boardId: board.id,
        relationship: "not-a-relationship",
        createdBy: member.user.id,
      }),
    ).rejects.toThrow();

    await expect(
      db.insert(schema.projectBoardTable).values({
        organizationId: member.organization.id,
        projectId: project.id,
        boardId: board.id,
        relationship: "context",
        rank: -1,
        createdBy: member.user.id,
      }),
    ).rejects.toThrow();
  });

  it("lists resources in stable rank then createdAt order", async () => {
    const member = await createOrganizationMember({ role: "admin" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const project = await createProject(app, {
      organizationId: member.organization.id,
      name: "Ordering",
      leadUserId: member.user.id,
    });
    const { board } = await createBoardFixture({
      organizationId: member.organization.id,
    });
    const repo = await createRepoFixture(member.organization.id);

    await app.request(`/api/project/${project.id}/resources`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resourceType: "board",
        resourceId: board.id,
        relationship: "context",
        rank: 5,
      }),
    });
    await app.request(`/api/project/${project.id}/resources`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resourceType: "repo",
        resourceId: repo.id,
        relationship: "context",
        rank: 1,
      }),
    });

    const list = await app.request(`/api/project/${project.id}/resources`);
    expect(list.status).toBe(200);
    const links = (await list.json()) as Array<{
      resourceType: string;
      rank: number;
    }>;
    expect(links.map((l) => l.resourceType)).toEqual(["repo", "board"]);
  });
});
