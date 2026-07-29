import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import db from "../../../apps/api/src/database";

const currentDir = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(currentDir, "../../../apps/api/drizzle");

let migrationPromise: Promise<void> | null = null;

function getDatabaseName(connectionString: string) {
  return new URL(connectionString).pathname.replace(/^\//, "");
}

function getAdminDatabaseUrl(connectionString: string) {
  const url = new URL(connectionString);
  url.pathname = "/postgres";
  return url.toString();
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function ensureTestDatabaseExists() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL must be defined for integration tests");
  }

  const databaseName = getDatabaseName(connectionString);

  if (!databaseName.endsWith("_test")) {
    throw new Error(
      `Refusing to manage non-test database "${databaseName}". DATABASE_URL must point to a test database.`,
    );
  }

  const adminClient = new Client({
    connectionString: getAdminDatabaseUrl(connectionString),
  });

  await adminClient.connect();

  try {
    const result = await adminClient.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [databaseName],
    );

    if (result.rowCount === 0) {
      await adminClient.query(
        `CREATE DATABASE ${quoteIdentifier(databaseName)}`,
      );
    }
  } finally {
    await adminClient.end();
  }
}

export async function ensureTestDatabaseMigrated() {
  if (!migrationPromise) {
    migrationPromise = (async () => {
      await ensureTestDatabaseExists();
      await migrate(db, {
        migrationsFolder,
      });
    })();
  }

  try {
    await migrationPromise;
  } catch (error) {
    migrationPromise = null;
    throw error;
  }
}

export async function resetTestDatabase() {
  await ensureTestDatabaseMigrated();

  // Derive the table list from the database rather than hardcoding it. The
  // previous hardcoded list silently rotted through the workspace/project ->
  // organization/board rename: it still named "project", "workspace", and
  // "workspace_member", so every TRUNCATE raised 42P01 and took down the whole
  // suite. Reading pg_tables keeps this correct across future renames.
  const truncate = sql.raw(`
      DO $$
      DECLARE
        tables text;
      BEGIN
        SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
          INTO tables
          FROM pg_tables
         WHERE schemaname = 'public'
           AND tablename <> '__drizzle_migrations';

        IF tables IS NOT NULL THEN
          EXECUTE 'TRUNCATE TABLE ' || tables || ' RESTART IDENTITY CASCADE';
        END IF;
      END $$;
    `);

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await db.execute(truncate);
      return;
    } catch (error) {
      const cause = error instanceof Error ? error.cause : undefined;
      const code =
        cause && typeof cause === "object" && "code" in cause
          ? cause.code
          : undefined;
      if (code !== "40P01" || attempt === 3) throw error;

      // PostgreSQL deadlocks are transaction-retry conditions. Fire-and-forget
      // event work can briefly race the next test's ACCESS EXCLUSIVE locks;
      // back off until that work releases its relation locks.
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }
}
