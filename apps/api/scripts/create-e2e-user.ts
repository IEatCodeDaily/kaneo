/**
 * Create (or reset) a dedicated e2e test user using better-auth's own password
 * hasher, so the normal email+password sign-in flow works end to end.
 *
 * Usage: node --import tsx scripts/create-e2e-user.ts <email> <password> <name>
 */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import db from "../src/database";
import {
  accountTable,
  organizationMemberTable,
  organizationTable,
  userTable,
} from "../src/database/schema";

const email = process.argv[2];
const password = process.argv[3];
const name = process.argv[4] ?? "E2E Bot";

if (!email || !password) {
  console.error("usage: create-e2e-user.ts <email> <password> [name]");
  process.exit(1);
}

function id(prefix: string) {
  return `${prefix}${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

async function main() {
  // Kaneo overrides better-auth's hasher with bcrypt (see apps/api/src/auth.ts
  // emailAndPassword.password.hash), so the stored hash must be bcrypt too.
  const hash = await bcrypt.hash(password, 10);

  const [existing] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, email))
    .limit(1);

  let userId: string;

  if (existing) {
    userId = existing.id;
    console.log(`user exists: ${userId} — resetting password`);
    await db
      .update(userTable)
      .set({ emailVerified: true, updatedAt: new Date() })
      .where(eq(userTable.id, userId));

    const [acct] = await db
      .select({ id: accountTable.id })
      .from(accountTable)
      .where(eq(accountTable.userId, userId))
      .limit(1);

    if (acct) {
      await db
        .update(accountTable)
        .set({ password: hash, updatedAt: new Date() })
        .where(eq(accountTable.id, acct.id));
      console.log("password reset on existing credential account");
    } else {
      await db.insert(accountTable).values({
        id: id("acc"),
        accountId: userId,
        providerId: "credential",
        userId,
        password: hash,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log("credential account created");
    }
  } else {
    userId = id("usr");
    await db.insert(userTable).values({
      id: userId,
      name,
      email,
      emailVerified: true,
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.insert(accountTable).values({
      id: id("acc"),
      accountId: userId,
      providerId: "credential",
      userId,
      password: hash,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log(`user created: ${userId}`);
  }

  // Ensure membership in every organization so the dashboard has data.
  const orgs = await db
    .select({ id: organizationTable.id, name: organizationTable.name })
    .from(organizationTable);

  for (const org of orgs) {
    const members = await db
      .select({ id: organizationMemberTable.id, userId: organizationMemberTable.userId })
      .from(organizationMemberTable)
      .where(eq(organizationMemberTable.organizationId, org.id));

    if (members.some((m) => m.userId === userId)) {
      console.log(`already member of ${org.name}`);
      continue;
    }

    await db.insert(organizationMemberTable).values({
      organizationId: org.id,
      userId,
      role: "owner",
      joinedAt: new Date(),
    });
    console.log(`added as owner of ${org.name}`);
  }

  console.log(JSON.stringify({ userId, email, orgs: orgs.length }));
  process.exit(0);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
