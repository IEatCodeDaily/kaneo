/**
 * Migrate stored organization_role permission payloads from the pre-rename
 * vocabulary (`project`, `workspace`) to the current one (`board`,
 * `organization`).
 *
 * Care is needed because better-auth's own `organization` statement already
 * exists in the payload alongside the old Kaneo `workspace` statement, so the
 * two must be MERGED (union of actions), not overwritten.
 *
 * Idempotent: rows already migrated are left untouched.
 * Pass --apply to write; default is a dry run.
 */
import { eq } from "drizzle-orm";
import db from "../src/database";
import { organizationRoleTable } from "../src/database/schema";

const APPLY = process.argv.includes("--apply");

function union(a: unknown, b: unknown): string[] {
  const out = new Set<string>();
  for (const v of [a, b]) {
    if (Array.isArray(v)) {
      for (const x of v) if (typeof x === "string") out.add(x);
    }
  }
  return Array.from(out);
}

function migrate(payload: Record<string, unknown>): {
  next: Record<string, unknown>;
  changed: boolean;
} {
  const next: Record<string, unknown> = { ...payload };
  let changed = false;

  // project -> board (merge if board already present)
  if ("project" in next) {
    next.board = union(next.board, next.project);
    delete next.project;
    changed = true;
  }

  // workspace -> organization (merge: better-auth already defines organization)
  if ("workspace" in next) {
    next.organization = union(next.organization, next.workspace);
    delete next.workspace;
    changed = true;
  }

  return { next, changed };
}

async function main() {
  const rows = await db
    .select({
      id: organizationRoleTable.id,
      organizationId: organizationRoleTable.organizationId,
      role: organizationRoleTable.role,
      permission: organizationRoleTable.permission,
    })
    .from(organizationRoleTable);

  console.log(`${APPLY ? "APPLY" : "DRY RUN"} — ${rows.length} role row(s)\n`);

  let migrated = 0;
  for (const row of rows) {
    let parsed: Record<string, unknown>;
    try {
      parsed =
        typeof row.permission === "string"
          ? JSON.parse(row.permission)
          : (row.permission as Record<string, unknown>);
    } catch {
      console.log(`  ${row.role}: UNPARSEABLE permission, skipping`);
      continue;
    }

    const { next, changed } = migrate(parsed ?? {});
    if (!changed) {
      console.log(`  ${row.role}: already migrated`);
      continue;
    }

    console.log(`  ${row.role}:`);
    console.log(`    board        = ${JSON.stringify(next.board)}`);
    console.log(`    organization = ${JSON.stringify(next.organization)}`);

    if (APPLY) {
      const serialized =
        typeof row.permission === "string" ? JSON.stringify(next) : next;
      await db
        .update(organizationRoleTable)
        .set({ permission: serialized as never })
        .where(eq(organizationRoleTable.id, row.id));
    }
    migrated++;
  }

  console.log(
    `\n${APPLY ? "migrated" : "would migrate"}: ${migrated}/${rows.length}`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
