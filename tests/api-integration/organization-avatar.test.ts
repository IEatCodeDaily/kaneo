import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { MAX_AVATAR_BYTES } from "../../apps/api/src/user/avatar";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createOrganizationMember } from "./helpers/fixtures";

const json = { "content-type": "application/json" };

// 1x1 PNG (passes the magic-byte check)
const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("API integration: organization avatar", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("stores a logo, serves it publicly with an ETag, and clears it on delete", async () => {
    const owner = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(owner.user);
    const { app } = createApp();

    const put = await app.request(
      `/api/organization/${owner.organization.id}/avatar`,
      {
        method: "PUT",
        headers: json,
        body: JSON.stringify({ contentType: "image/png", data: PNG_1X1 }),
      },
    );
    expect(put.status).toBe(200);
    const saved = (await put.json()) as {
      id: string;
      url: string;
      size: number;
    };
    expect(saved.id).toBe(owner.organization.id);
    expect(saved.url).toBe(`/api/organization/avatar/${owner.organization.id}`);
    expect(saved.size).toBeGreaterThan(0);

    const [org] = await db
      .select({ logo: schema.organizationTable.logo })
      .from(schema.organizationTable)
      .where(eq(schema.organizationTable.id, owner.organization.id));
    expect(org.logo).toBe(`data:image/png;base64,${PNG_1X1}`);

    // Public download: no session, binary body, cache headers.
    const download = await app.request(saved.url);
    expect(download.status).toBe(200);
    expect(download.headers.get("content-type")).toBe("image/png");
    expect(download.headers.get("cache-control")).toContain("immutable");
    const etag = download.headers.get("etag");
    expect(etag).toBeTruthy();
    expect(Buffer.from(await download.arrayBuffer()).length).toBe(saved.size);

    const conditional = await app.request(saved.url, {
      headers: { "If-None-Match": etag ?? "" },
    });
    expect(conditional.status).toBe(304);

    const cleared = await app.request(
      `/api/organization/${owner.organization.id}/avatar`,
      { method: "DELETE" },
    );
    expect(cleared.status).toBe(200);
    expect(((await cleared.json()) as { deleted: boolean }).deleted).toBe(true);

    const [after] = await db
      .select({ logo: schema.organizationTable.logo })
      .from(schema.organizationTable)
      .where(eq(schema.organizationTable.id, owner.organization.id));
    expect(after.logo).toBeNull();

    const gone = await app.request(saved.url);
    expect(gone.status).toBe(404);
  });

  it("rotates the ETag when the logo is replaced", async () => {
    const owner = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(owner.user);
    const { app } = createApp();
    const url = `/api/organization/${owner.organization.id}/avatar`;

    await app.request(url, {
      method: "PUT",
      headers: json,
      body: JSON.stringify({ contentType: "image/png", data: PNG_1X1 }),
    });
    const first = await app.request(
      `/api/organization/avatar/${owner.organization.id}`,
    );

    // A different 1x1 PNG (single grey pixel).
    const PNG_GREY =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    await app.request(url, {
      method: "PUT",
      headers: json,
      body: JSON.stringify({ contentType: "image/png", data: PNG_GREY }),
    });
    const second = await app.request(
      `/api/organization/avatar/${owner.organization.id}`,
    );

    expect(second.headers.get("etag")).toBeTruthy();
    expect(second.headers.get("etag")).not.toBe(first.headers.get("etag"));
  });

  it("rejects invalid uploads", async () => {
    const owner = await createOrganizationMember({ role: "owner" });
    mockAuthenticatedSession(owner.user);
    const { app } = createApp();
    const url = `/api/organization/${owner.organization.id}/avatar`;

    const badType = await app.request(url, {
      method: "PUT",
      headers: json,
      body: JSON.stringify({
        contentType: "image/gif",
        data: "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      }),
    });
    expect(badType.status).toBe(400);

    // PNG magic bytes required: declared PNG but GIF payload.
    const badMagic = await app.request(url, {
      method: "PUT",
      headers: json,
      body: JSON.stringify({
        contentType: "image/png",
        data: "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      }),
    });
    expect(badMagic.status).toBe(400);

    const oversized = Buffer.alloc(MAX_AVATAR_BYTES + 1, 0x89);
    const tooBig = await app.request(url, {
      method: "PUT",
      headers: json,
      body: JSON.stringify({
        contentType: "image/png",
        data: oversized.toString("base64"),
      }),
    });
    expect(tooBig.status).toBe(400);
  });

  it("refuses avatar changes to a non-admin member and unknown organizations", async () => {
    const owner = await createOrganizationMember({ role: "owner" });
    const { app } = createApp();

    const [member] = await db
      .insert(schema.userTable)
      .values({
        id: "plain-org-member",
        email: "plain-org-member@example.com",
        emailVerified: true,
        name: "Plain Member",
      })
      .returning();
    await db.insert(schema.organizationMemberTable).values({
      organizationId: owner.organization.id,
      userId: member.id,
      role: "member",
      joinedAt: new Date(),
    });

    mockAuthenticatedSession(member);
    const forbidden = await app.request(
      `/api/organization/${owner.organization.id}/avatar`,
      {
        method: "PUT",
        headers: json,
        body: JSON.stringify({ contentType: "image/png", data: PNG_1X1 }),
      },
    );
    expect(forbidden.status).toBe(403);

    mockAuthenticatedSession(owner.user);
    // Non-members never reach the handler: organizationAccess 403s them.
    const missing = await app.request("/api/organization/org-missing/avatar", {
      method: "PUT",
      headers: json,
      body: JSON.stringify({ contentType: "image/png", data: PNG_1X1 }),
    });
    expect(missing.status).toBe(403);
  });
});
