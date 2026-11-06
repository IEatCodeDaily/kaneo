import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { ensureTestDatabaseMigrated } from "./helpers/database";
import {
  createBoardFixture,
  createOrganizationMember,
} from "./helpers/fixtures";

describe("complete Project migration history", () => {
  it("creates all resource-link tables and the milestone ownership constraint on a fresh database", async () => {
    await ensureTestDatabaseMigrated();
    const tables = await db.execute(
      sql`SELECT to_regclass('public.project_board') AS board, to_regclass('public.project_repo') AS repo, to_regclass('public.project_table_link') AS table_link`,
    );
    expect(tables.rows[0]).toEqual({
      board: "project_board",
      repo: "project_repo",
      table_link: "project_table_link",
    });
    const constraints = await db.execute(
      sql`SELECT conname FROM pg_constraint WHERE conname='project_ticket_project_milestone_project_id_fk'`,
    );
    expect(constraints.rows).toHaveLength(1);
    const member = await createOrganizationMember();
    const { board } = await createBoardFixture({
      organizationId: member.organization.id,
    });
    const [project] = await db
      .insert(schema.projectTable)
      .values({
        organizationId: member.organization.id,
        slug: "history-sentinel",
        name: "History sentinel",
        summary: "preserve rows",
        leadUserId: member.user.id,
        createdBy: member.user.id,
      })
      .returning();
    const [link] = await db
      .insert(schema.projectBoardTable)
      .values({
        organizationId: member.organization.id,
        projectId: project.id,
        boardId: board.id,
        relationship: "context",
        createdBy: member.user.id,
      })
      .returning();
    await db.execute(
      sql`ALTER TABLE project_ticket DROP CONSTRAINT project_ticket_project_milestone_project_id_fk`,
    );
    await db.execute(
      sql`DELETE FROM drizzle.__drizzle_migrations WHERE created_at = 1793798984941`,
    );
    await migrate(db, { migrationsFolder: resolve("drizzle") });
    const existing = await db.select().from(schema.projectBoardTable);
    expect(existing).toContainEqual(link);
    const fk = await db.execute(
      sql`SELECT convalidated,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='public.project_ticket'::regclass AND conname='project_ticket_project_milestone_project_id_fk'`,
    );
    expect(fk.rows[0].convalidated).toBe(true);
    expect(fk.rows[0].definition).toContain(
      "FOREIGN KEY (project_id, project_milestone_id)",
    );
    // Model a skipped history with absent link tables, independently of existing-row upgrade.
    // Model the observed upgraded watermark with omitted schema objects.
    // Only disposable test DB: do not apply this setup to a live database.
    await db.execute(
      sql`ALTER TABLE project_ticket DROP CONSTRAINT project_ticket_project_milestone_project_id_fk`,
    );
    await db.execute(
      sql`DROP TABLE project_board, project_repo, project_table_link`,
    );
    await db.execute(
      sql`DELETE FROM drizzle.__drizzle_migrations WHERE created_at = 1793798984941`,
    );
    await migrate(db, { migrationsFolder: resolve("drizzle") });
    const repaired = await db.execute(
      sql`SELECT to_regclass('public.project_board') AS board`,
    );
    expect(repaired.rows[0].board).toBe("project_board");
    const allTables = await db.execute(
      sql`SELECT to_regclass('public.project_repo') AS repo,to_regclass('public.project_table_link') AS table_link`,
    );
    expect(allTables.rows[0]).toEqual({
      repo: "project_repo",
      table_link: "project_table_link",
    });
    const repairedConstraint = await db.execute(
      sql`SELECT conname FROM pg_constraint WHERE conname='project_ticket_project_milestone_project_id_fk'`,
    );
    expect(repairedConstraint.rows).toHaveLength(1);
    const before = await db.execute(
      sql`SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`,
    );
    await migrate(db, { migrationsFolder: resolve("drizzle") });
    const after = await db.execute(
      sql`SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`,
    );
    expect(after.rows).toEqual(before.rows);
  });
});
