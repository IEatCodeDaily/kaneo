import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";
import { auth } from "../../apps/api/src/auth";
import db, { schema } from "../../apps/api/src/database";
import { resetTestDatabase } from "./helpers/database";
import { createOrganizationMember } from "./helpers/fixtures";

beforeEach(resetTestDatabase);

it("configured deletion guard refuses a sole owner of a shared organization and keeps both", async () => {
  const member = await createOrganizationMember({
    role: "owner",
    organizationName: "Shared",
  });
  const otherId = `user-${randomUUID()}`;
  await db.insert(schema.userTable).values({
    id: otherId,
    email: `${otherId}@example.com`,
    emailVerified: true,
    name: "Other",
  });
  await db.insert(schema.organizationMemberTable).values({
    organizationId: member.organization.id,
    userId: otherId,
    role: "member",
    joinedAt: new Date(),
  });

  const guard = auth.options.user?.deleteUser?.beforeDelete;
  expect(guard).toBeTypeOf("function");
  if (!guard) throw new Error("Account deletion guard missing");
  await expect(guard(member.user, undefined)).rejects.toThrow(
    /only owner of "Shared"/,
  );
  expect(
    await db.query.userTable.findFirst({
      where: eq(schema.userTable.id, member.user.id),
    }),
  ).toBeDefined();
  expect(
    await db.query.organizationTable.findFirst({
      where: eq(schema.organizationTable.id, member.organization.id),
    }),
  ).toBeDefined();
});
