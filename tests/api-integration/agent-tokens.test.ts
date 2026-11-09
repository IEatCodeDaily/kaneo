import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { verifyApiKey } from "../../apps/api/src/utils/verify-api-key";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createOrganizationMember } from "./helpers/fixtures";

const json = { "content-type": "application/json" };

describe("API integration: agent tokens", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("issues a non-expiring token, reissues it without touching the agent, and removes the agent", async () => {
    const owner = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(owner.user);
    const { app } = createApp();

    const created = await app.request("/api/agent", {
      method: "POST",
      headers: json,
      body: JSON.stringify({
        organizationId: owner.organization.id,
        name: "Release bot",
        permissions: { board: ["read"] },
      }),
    });
    expect(created.status).toBe(201);
    const { id: agentId, key: firstKey } = (await created.json()) as {
      id: string;
      key: string;
    };

    const first = await verifyApiKey(firstKey);
    expect(first?.key.userId).toBe(agentId);
    expect(first?.key.expiresAt).toBeNull();

    const reissued = await app.request(`/api/agent/${agentId}/token`, {
      method: "POST",
    });
    expect(reissued.status).toBe(201);
    const { key: secondKey } = (await reissued.json()) as { key: string };

    // Rotation: the old token is dead, the new one works, same agent.
    expect(await verifyApiKey(firstKey)).toBeNull();
    expect((await verifyApiKey(secondKey))?.key.userId).toBe(agentId);
    const memberships = await db
      .select()
      .from(schema.organizationMemberTable)
      .where(eq(schema.organizationMemberTable.userId, agentId));
    expect(memberships).toHaveLength(1);

    const listed = await app.request(
      `/api/agent?organizationId=${owner.organization.id}`,
    );
    const agents = (await listed.json()) as Array<{
      id: string;
      token: { start: string } | null;
    }>;
    expect(agents).toHaveLength(1);
    expect(agents[0].id).toBe(agentId);
    expect(secondKey.startsWith(agents[0].token?.start ?? "-")).toBe(true);

    const removed = await app.request(`/api/agent/${agentId}`, {
      method: "DELETE",
    });
    expect(removed.status).toBe(200);
    expect(await verifyApiKey(secondKey)).toBeNull();
  });

  it("refuses token reissue to a non-admin member", async () => {
    const owner = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(owner.user);
    const { app } = createApp();
    const created = await app.request("/api/agent", {
      method: "POST",
      headers: json,
      body: JSON.stringify({
        organizationId: owner.organization.id,
        name: "Release bot",
        permissions: { board: ["read"] },
      }),
    });
    const { id: agentId } = (await created.json()) as { id: string };

    const [member] = await db
      .insert(schema.userTable)
      .values({
        id: "plain-member",
        email: "plain-member@example.com",
        emailVerified: true,
        name: "Member",
      })
      .returning();
    await db.insert(schema.organizationMemberTable).values({
      organizationId: owner.organization.id,
      userId: member.id,
      role: "member",
      joinedAt: new Date(),
    });
    mockAuthenticatedSession(member);

    const response = await app.request(`/api/agent/${agentId}/token`, {
      method: "POST",
    });
    expect(response.status).toBe(403);
  });
});
