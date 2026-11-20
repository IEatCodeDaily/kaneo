import type { ExtractTablesWithRelations } from "drizzle-orm";
import { and, eq, sql } from "drizzle-orm";
import type {
  NodePgDatabase,
  NodePgTransaction,
} from "drizzle-orm/node-postgres";
import type { AnyPgTable, PgColumn } from "drizzle-orm/pg-core";
import type * as schema from "../database/schema";

type Schema = typeof schema;

/** Only select is needed; both the pool db and transactions satisfy this. */
type SlugDb =
  | NodePgDatabase<Schema>
  | NodePgTransaction<Schema, ExtractTablesWithRelations<Schema>>;

type SlugTable = AnyPgTable & {
  id: PgColumn;
  organizationId: PgColumn;
  slug: PgColumn;
};

/**
 * Slug generation for URL-addressed resources (#resource-slugs): repos, data
 * tables and dashboards. Same normalization projects use — lowercase, runs of
 * non-alphanumerics become '-', trimmed, capped at 63 chars — plus a -2, -3…
 * suffix loop scoped to one organization (the `(organization_id, lower(slug))`
 * unique index is the authority; this pre-check loop only avoids the common
 * collision).
 */
export function slugifyResourceName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "");
}

/**
 * First unused slug for `table` within `organizationId`, derived from `name`.
 * An empty normalization falls back to a time-ordered handle so a name like
 * "日本語" still gets a usable slug.
 *
 * ponytail: check-then-insert races a concurrent create onto the unique index
 * (23505); add a catch-and-retry here if that ever shows up in practice.
 */
export async function uniqueResourceSlug(
  db: SlugDb,
  table: SlugTable,
  organizationId: string,
  name: string,
): Promise<string> {
  const base = slugifyResourceName(name);
  if (!base) {
    return `resource-${Date.now().toString(36)}`;
  }
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const [row] = await db
      .select({ id: table.id })
      .from(table)
      .where(
        and(
          eq(table.organizationId, organizationId),
          sql`lower(${table.slug}) = ${candidate}`,
        ),
      )
      .limit(1);
    if (!row) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}
