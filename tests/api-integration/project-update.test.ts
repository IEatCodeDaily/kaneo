import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { subscribeToEvent } from "../../apps/api/src/events";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createBoardFixture,
  createOrganizationMember,
} from "./helpers/fixtures";

async function createProjectFixture(
  organizationId: string,
  leadUserId: string,
) {
  const [project] = await db
    .insert(schema.projectTable)
    .values({
      id: `project-${randomUUID()}`,
      organizationId,
      slug: `proj-${randomUUID().slice(0, 8)}`,
      name: "Updates Project",
      summary: "Health narratives",
      status: "started",
      leadUserId,
      createdBy: leadUserId,
    })
    .returning();
  if (!project) throw new Error("Failed to seed project");
  return project;
}

function updatesUrl(projectId: string) {
  return `/api/project/${projectId}/updates`;
}

function updateUrl(projectId: string, updateId: string) {
  return `/api/project/${projectId}/updates/${updateId}`;
}

async function postUpdate(
  app: ReturnType<typeof createApp>["app"],
  projectId: string,
  body: Record<string, unknown>,
) {
  return app.request(updatesUrl(projectId), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API integration: project updates (KFL-370)", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("creates an organization-scoped Project Update with health on-track", async () => {
    // project:update requires the admin built-in role (member only grants
    // project:create|read — mirrors KFL-366's own update-route fixtures).
    const member = await createOrganizationMember({ role: "admin" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const project = await createProjectFixture(
      member.organization.id,
      member.user.id,
    );

    const response = await postUpdate(app, project.id, {
      content: "Shipped the beta; on track for launch.",
      health: "on-track",
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      id: string;
      organizationId: string;
      projectId: string;
      authorId: string;
      content: string;
      health: string;
      editHistory: unknown[];
    };
    // CUID2 ids are 24 lowercase alphanumeric chars.
    expect(payload.id).toMatch(/^[a-z0-9]{24}$/);
    expect(payload).toMatchObject({
      organizationId: member.organization.id,
      projectId: project.id,
      authorId: member.user.id,
      content: "Shipped the beta; on track for launch.",
      health: "on-track",
    });
    expect(payload.editHistory).toEqual([]);

    const persisted = await db.query.projectUpdateTable.findFirst({
      where: eq(schema.projectUpdateTable.id, payload.id),
    });
    expect(persisted).toMatchObject({
      organizationId: member.organization.id,
      projectId: project.id,
      authorId: member.user.id,
      health: "on-track",
    });
  });

  it("rejects health values outside on-track|at-risk|off-track with no row written", async () => {
    const member = await createOrganizationMember();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const project = await createProjectFixture(
      member.organization.id,
      member.user.id,
    );

    for (const health of ["no-update", "done", "completed", "fine"]) {
      const response = await postUpdate(app, project.id, {
        content: "x",
        health,
      });
      expect(response.status).toBe(400);
    }

    const rows = await db
      .select()
      .from(schema.projectUpdateTable)
      .where(eq(schema.projectUpdateTable.projectId, project.id));
    expect(rows).toHaveLength(0);

    // The CHECK constraint rejects the sentinel at the SQL level too.
    await expect(
      db.insert(schema.projectUpdateTable).values({
        organizationId: member.organization.id,
        projectId: project.id,
        authorId: member.user.id,
        content: "x",
        health: "no-update",
      }),
    ).rejects.toThrow();
  });

  it("rejects empty or whitespace-only or oversized content", async () => {
    const member = await createOrganizationMember();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const project = await createProjectFixture(
      member.organization.id,
      member.user.id,
    );

    for (const content of ["", "   ", "a".repeat(65536)]) {
      const response = await postUpdate(app, project.id, {
        content,
        health: "at-risk",
      });
      expect(response.status).toBe(400);
    }

    const rows = await db
      .select()
      .from(schema.projectUpdateTable)
      .where(eq(schema.projectUpdateTable.projectId, project.id));
    expect(rows).toHaveLength(0);
  });

  it("lists updates newest first and returns [] for a Project with zero updates", async () => {
    const member = await createOrganizationMember({ role: "admin" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const project = await createProjectFixture(
      member.organization.id,
      member.user.id,
    );

    // Zero-updates case: empty array, NOT 404; the Project still resolves.
    const empty = await app.request(updatesUrl(project.id));
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual([]);
    const detail = await app.request(`/api/project/${project.id}`);
    expect(detail.status).toBe(200);

    const first = (await (
      await postUpdate(app, project.id, { content: "v1", health: "on-track" })
    ).json()) as { id: string };
    await new Promise((resolve) => setTimeout(resolve, 15));
    const second = (await (
      await postUpdate(app, project.id, { content: "v2", health: "off-track" })
    ).json()) as { id: string };

    const listResponse = await app.request(updatesUrl(project.id));
    const list = (await listResponse.json()) as Array<{ id: string }>;
    expect(list.map((u) => u.id)).toEqual([second.id, first.id]);
  });
  it("uses stable ID ordering when updates share an identical timestamp", async () => {
    const member = await createOrganizationMember({ role: "admin" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const project = await createProjectFixture(
      member.organization.id,
      member.user.id,
    );
    const first = (await (
      await postUpdate(app, project.id, {
        content: "first",
        health: "on-track",
      })
    ).json()) as { id: string };
    const second = (await (
      await postUpdate(app, project.id, {
        content: "second",
        health: "at-risk",
      })
    ).json()) as { id: string };
    const timestamp = new Date("2025-01-01T00:00:00.000Z");
    await db
      .update(schema.projectUpdateTable)
      .set({ createdAt: timestamp })
      .where(eq(schema.projectUpdateTable.projectId, project.id));
    const list = (await (
      await app.request(updatesUrl(project.id))
    ).json()) as Array<{ id: string }>;
    expect(list.map((item) => item.id)).toEqual(
      [second.id, first.id].sort().reverse(),
    );
  });

  it("edit appends a pre-edit snapshot to edit_history without compression", async () => {
    const member = await createOrganizationMember({ role: "admin" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const project = await createProjectFixture(
      member.organization.id,
      member.user.id,
    );

    const created = (await (
      await postUpdate(app, project.id, {
        content: "original",
        health: "on-track",
      })
    ).json()) as { id: string };

    await app.request(updateUrl(project.id, created.id), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "v1", health: "on-track" }),
    });
    await app.request(updateUrl(project.id, created.id), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "v2", health: "at-risk" }),
    });

    const row = await db.query.projectUpdateTable.findFirst({
      where: eq(schema.projectUpdateTable.id, created.id),
    });
    expect(row?.editHistory).toHaveLength(2);
    expect(row?.editHistory[0]).toMatchObject({ content: "original" });
    expect(row?.editHistory[1]).toMatchObject({ content: "v1" });
    expect(row?.content).toBe("v2");
    expect(row?.health).toBe("at-risk");
  });

  it("edit by a non-author returns the identical 404 used for missing rows", async () => {
    const author = await createOrganizationMember({ role: "admin" });
    const other = await createOrganizationMember({ role: "admin" });
    // Join the same org so org-level permission passes; resource edit is
    // author-gated.
    await db.insert(schema.organizationMemberTable).values({
      organizationId: author.organization.id,
      userId: other.user.id,
      // Admin role so `other` passes the org-level project:update gate; the
      // assertion below then proves the AUTHOR-only guard returns the
      // identical no-leak 404.
      role: "admin",
      joinedAt: new Date(),
    });
    mockAuthenticatedSession(author.user);
    const { app } = createApp();
    const project = await createProjectFixture(
      author.organization.id,
      author.user.id,
    );
    const created = (await (
      await postUpdate(app, project.id, { content: "mine", health: "on-track" })
    ).json()) as { id: string };

    mockAuthenticatedSession(other.user);
    const missing = await app.request(
      updateUrl(
        project.id,
        `missing${randomUUID().replaceAll("-", "").slice(0, 17)}`,
      ),
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "hijack", health: "on-track" }),
      },
    );
    const forbidden = await app.request(updateUrl(project.id, created.id), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "hijack", health: "on-track" }),
    });
    const deleteMissing = await app.request(
      updateUrl(
        project.id,
        `missing${randomUUID().replaceAll("-", "").slice(0, 17)}`,
      ),
      { method: "DELETE" },
    );
    const deleteForbidden = await app.request(
      updateUrl(project.id, created.id),
      {
        method: "DELETE",
      },
    );

    expect(missing.status).toBe(404);
    expect(forbidden.status).toBe(404);
    expect(deleteMissing.status).toBe(404);
    expect(deleteForbidden.status).toBe(404);
    expect(await missing.text()).toBe(await forbidden.text());
    expect(await deleteMissing.text()).toBe(await deleteForbidden.text());

    const row = await db.query.projectUpdateTable.findFirst({
      where: eq(schema.projectUpdateTable.id, created.id),
    });
    expect(row?.content).toBe("mine");
  });

  it("edit by a former organization member returns 404 even though author_id still resolves", async () => {
    const member = await createOrganizationMember({ role: "admin" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const project = await createProjectFixture(
      member.organization.id,
      member.user.id,
    );
    const created = (await (
      await postUpdate(app, project.id, {
        content: "before leaving",
        health: "on-track",
      })
    ).json()) as { id: string };

    // Departed: remove membership row. Author FK still resolves.
    await db
      .delete(schema.organizationMemberTable)
      .where(
        and(
          eq(
            schema.organizationMemberTable.organizationId,
            member.organization.id,
          ),
          eq(schema.organizationMemberTable.userId, member.user.id),
        ),
      );

    mockAuthenticatedSession(member.user);
    const edited = await app.request(updateUrl(project.id, created.id), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "after leaving", health: "off-track" }),
    });
    // A departed member is indistinguishable from an outsider: the project
    // access layer answers with the identical non-leaking 404 (KFL-370).
    expect(edited.status).toBe(404);

    const row = await db.query.projectUpdateTable.findFirst({
      where: eq(schema.projectUpdateTable.id, created.id),
    });
    expect(row?.content).toBe("before leaving");
    expect(row?.health).toBe("on-track");
  });

  it("delete is a hard delete and the next-newest Update becomes the latest health", async () => {
    const member = await createOrganizationMember({ role: "admin" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const project = await createProjectFixture(
      member.organization.id,
      member.user.id,
    );

    const older = (await (
      await postUpdate(app, project.id, {
        content: "older",
        health: "on-track",
      })
    ).json()) as { id: string };
    await new Promise((resolve) => setTimeout(resolve, 15));
    const newest = (await (
      await postUpdate(app, project.id, {
        content: "newest",
        health: "off-track",
      })
    ).json()) as { id: string };

    const deleted = await app.request(updateUrl(project.id, newest.id), {
      method: "DELETE",
    });
    expect(deleted.status).toBe(200);

    const remaining = await db
      .select()
      .from(schema.projectUpdateTable)
      .where(eq(schema.projectUpdateTable.projectId, project.id));
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe(older.id);

    const list = (await (
      await app.request(updatesUrl(project.id))
    ).json()) as Array<{ id: string; health: string }>;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: older.id, health: "on-track" });
  });

  it("cross-organization and cross-project access return identical 404s", async () => {
    const owner = await createOrganizationMember({ role: "admin" });
    const outsider = await createOrganizationMember({ role: "admin" });
    mockAuthenticatedSession(owner.user);
    const { app } = createApp();
    const project = await createProjectFixture(
      owner.organization.id,
      owner.user.id,
    );
    const created = (await (
      await postUpdate(app, project.id, {
        content: "secret",
        health: "on-track",
      })
    ).json()) as { id: string };

    const invalidCuid = `missing${randomUUID().replaceAll("-", "").slice(0, 17)}`;

    mockAuthenticatedSession(outsider.user);
    const listCrossOrg = await app.request(updatesUrl(project.id));
    const listMissing = await app.request(
      updatesUrl(`missing${randomUUID().replaceAll("-", "").slice(0, 17)}`),
    );

    const sameOrgNoGrant = await createOrganizationMember({
      organizationName: owner.organization.name,
    });
    await db.insert(schema.organizationMemberTable).values({
      organizationId: owner.organization.id,
      userId: sameOrgNoGrant.user.id,
      role: "member",
      joinedAt: new Date(),
    });
    const hidden = await createProjectFixture(
      owner.organization.id,
      owner.user.id,
    );
    await db
      .update(schema.projectTable)
      .set({ orgPrivilege: "none" })
      .where(eq(schema.projectTable.id, hidden.id));
    mockAuthenticatedSession(sameOrgNoGrant.user);
    const listDenied = await app.request(updatesUrl(hidden.id));
    const editCrossProject = await app.request(
      updateUrl(hidden.id, created.id),
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "steal", health: "on-track" }),
      },
    );

    expect(listCrossOrg.status).toBe(404);
    expect(listMissing.status).toBe(404);
    expect(listDenied.status).toBe(404);
    expect(editCrossProject.status).toBe(404);
    const missingBody = await listMissing.text();
    expect(await listCrossOrg.text()).toBe(missingBody);
    expect(await listDenied.text()).toBe(missingBody);
    expect(await editCrossProject.text()).toBe(missingBody);
  });

  it("progress changes never mutate authored health", async () => {
    const member = await createOrganizationMember({ role: "admin" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const project = await createProjectFixture(
      member.organization.id,
      member.user.id,
    );
    const created = (await (
      await postUpdate(app, project.id, {
        content: "blocked by vendor",
        health: "off-track",
      })
    ).json()) as { id: string };
    const before = await db.query.projectUpdateTable.findFirst({
      where: eq(schema.projectUpdateTable.id, created.id),
    });
    const board = await createBoardFixture({
      organizationId: member.organization.id,
      name: "Delivery",
    });
    const taskResponse = await app.request(`/api/task/${board.board.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Vendor follow-up",
        description: "",
        priority: "low",
        status: "to-do",
      }),
    });
    expect(taskResponse.status).toBe(200);
    const task = (await taskResponse.json()) as { id: string };
    const changed = await app.request(`/api/task/status/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    expect(changed.status).toBe(200);
    const after = await db.query.projectUpdateTable.findFirst({
      where: eq(schema.projectUpdateTable.id, created.id),
    });
    expect(after?.health).toBe("off-track");
    expect(after?.updatedAt.getTime()).toBe(before?.updatedAt.getTime());
  });

  it("push events fire with the contract { organizationId, projectId, updateId, health }", async () => {
    const member = await createOrganizationMember({ role: "admin" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const project = await createProjectFixture(
      member.organization.id,
      member.user.id,
    );

    const seen: Record<string, unknown>[] = [];
    const record = (data: unknown) => {
      seen.push(data as Record<string, unknown>);
    };
    await subscribeToEvent("project-update.created", record);
    await subscribeToEvent("project-update.updated", record);
    await subscribeToEvent("project-update.deleted", record);

    {
      const created = (await (
        await postUpdate(app, project.id, {
          content: "hello",
          health: "at-risk",
        })
      ).json()) as { id: string };

      await app.request(updateUrl(project.id, created.id), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "hello again", health: "on-track" }),
      });
      await app.request(updateUrl(project.id, created.id), {
        method: "DELETE",
      });

      await vi.waitFor(() => {
        expect(seen.length).toBe(3);
      });

      expect(seen[0]).toMatchObject({
        organizationId: member.organization.id,
        projectId: project.id,
        updateId: created.id,
        health: "at-risk",
      });
      expect(seen[1]).toMatchObject({
        organizationId: member.organization.id,
        projectId: project.id,
        updateId: created.id,
        health: "on-track",
      });
      expect(seen[2]).toMatchObject({
        organizationId: member.organization.id,
        projectId: project.id,
        updateId: created.id,
        health: "on-track",
      });
    }
  });

  it("view-privilege Project grants can list but not create", async () => {
    const owner = await createOrganizationMember({ role: "admin" });
    const viewer = await createOrganizationMember({
      organizationName: owner.organization.name,
    });
    await db.insert(schema.organizationMemberTable).values({
      organizationId: owner.organization.id,
      userId: viewer.user.id,
      role: "member",
      joinedAt: new Date(),
    });
    mockAuthenticatedSession(owner.user);
    const { app } = createApp();
    const project = await createProjectFixture(
      owner.organization.id,
      owner.user.id,
    );
    await (
      await postUpdate(app, project.id, {
        content: "owner note",
        health: "on-track",
      })
    ).json();

    // Grant the second member view-only privilege on the project resource.
    await db.insert(schema.resourceGrantTable).values({
      organizationId: owner.organization.id,
      resourceType: "project",
      resourceId: project.id,
      userId: viewer.user.id,
      privilege: "view",
    });

    mockAuthenticatedSession(viewer.user);
    const list = await app.request(updatesUrl(project.id));
    expect(list.status).toBe(200);
    const items = (await list.json()) as Array<{ content: string }>;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ content: "owner note" });

    const denied = await postUpdate(app, project.id, {
      content: "viewer cannot post",
      health: "on-track",
    });
    // Documented choice: no-leak 404 (consistent with all four controllers).
    expect(denied.status).toBe(404);
  });

  it("archive does not invalidate the Update history surface (rows survive archive)", async () => {
    const member = await createOrganizationMember({ role: "admin" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const project = await createProjectFixture(
      member.organization.id,
      member.user.id,
    );
    const created = (await (
      await postUpdate(app, project.id, {
        content: "history keeper",
        health: "at-risk",
      })
    ).json()) as { id: string };

    const archived = await app.request(`/api/project/${project.id}/archive`, {
      method: "PUT",
    });
    expect(archived.status).toBe(200);

    const row = await db.query.projectUpdateTable.findFirst({
      where: eq(schema.projectUpdateTable.id, created.id),
    });
    expect(row).toMatchObject({ content: "history keeper", health: "at-risk" });

    // Archived Projects keep serving their Updates sub-router.
    const list = await app.request(updatesUrl(project.id));
    expect(list.status).toBe(200);
    const items = (await list.json()) as Array<{ id: string }>;
    expect(items.map((i) => i.id)).toContain(created.id);
  });
});
