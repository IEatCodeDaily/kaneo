import { resolve } from "node:path";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { ensureTestDatabaseMigrated } from "./helpers/database";

// Run against an isolated empty database: the first migration call is the
// acceptance oracle, and the second proves existing ledgers remain a no-op.
describe("published migration history", () => {
  it("migrates an empty database and preserves data on a second run", async () => {
    await ensureTestDatabaseMigrated();
    const table = await db.execute(
      sql`SELECT to_regclass('public.user_notification_preference') AS name`,
    );
    expect(table.rows[0].name).toBe("user_notification_preference");
    const before = await db.execute(
      sql`SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id`,
    );
    await db.insert(schema.userTable).values({
      id: "migration-sentinel",
      name: "Migration sentinel",
      email: "migration-sentinel@example.invalid",
    });
    await migrate(db, { migrationsFolder: resolve("drizzle") });
    const after = await db.execute(
      sql`SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id`,
    );
    expect(after.rows).toEqual(before.rows);
    const users = await db
      .select()
      .from(schema.userTable)
      .where(eq(schema.userTable.id, "migration-sentinel"));
    expect(users).toHaveLength(1);
  });
});
