import { and, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import db from "../database";
import { projectTable, teamTable, userTable } from "../database/schema";

// The archiver is a second join against user, separate from the lead join.
const archivedByUser = alias(userTable, "archived_by_user");

/**
 * KFL-366: this ticket excludes ticket membership and progress/health
 * computation entirely (that's KFL-367+). Every projection therefore returns
 * presentation-only `progress: null` and `health: null` rather than
 * persisting or deriving them, so the client can render "No scoped work" /
 * "No update" without the API inventing data it doesn't own yet.
 */
export const projectSelection = {
  id: projectTable.id,
  organizationId: projectTable.organizationId,
  slug: projectTable.slug,
  name: projectTable.name,
  icon: projectTable.icon,
  color: projectTable.color,
  summary: projectTable.summary,
  description: projectTable.description,
  successCriteria: projectTable.successCriteria,
  status: projectTable.status,
  priority: projectTable.priority,
  leadUserId: projectTable.leadUserId,
  leadUserName: userTable.name,
  leadTeamId: projectTable.leadTeamId,
  leadTeamName: teamTable.name,
  startDate: projectTable.startDate,
  targetDate: projectTable.targetDate,
  orgPrivilege: projectTable.orgPrivilege,
  archivedAt: projectTable.archivedAt,
  archivedBy: projectTable.archivedBy,
  archivedByName: archivedByUser.name,
  createdAt: projectTable.createdAt,
  updatedAt: projectTable.updatedAt,
  createdBy: projectTable.createdBy,
} as const;

/** Presentation-only fields this ticket does not persist or derive. */
export function withPresentationOnlyFields<T extends Record<string, unknown>>(
  row: T,
) {
  return { ...row, progress: null, health: null };
}

export function projectSelectQuery() {
  return db
    .select(projectSelection)
    .from(projectTable)
    .leftJoin(userTable, eq(projectTable.leadUserId, userTable.id))
    .leftJoin(teamTable, eq(projectTable.leadTeamId, teamTable.id))
    .leftJoin(archivedByUser, eq(projectTable.archivedBy, archivedByUser.id));
}

export async function findProjectById(
  organizationId: string,
  projectId: string,
) {
  const [row] = await projectSelectQuery()
    .where(
      and(
        eq(projectTable.id, projectId),
        eq(projectTable.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ? withPresentationOnlyFields(row) : null;
}

export async function findProjectBySlug(organizationId: string, slug: string) {
  const normalized = slug.toLowerCase();
  const [row] = await projectSelectQuery()
    .where(
      and(
        eq(projectTable.organizationId, organizationId),
        sql`lower(${projectTable.slug}) = ${normalized}`,
      ),
    )
    .limit(1);
  return row ? withPresentationOnlyFields(row) : null;
}

export async function listProjectsForOrganization(
  organizationId: string,
  includeArchived: boolean,
) {
  const rows = await projectSelectQuery()
    .where(
      includeArchived
        ? eq(projectTable.organizationId, organizationId)
        : and(
            eq(projectTable.organizationId, organizationId),
            isNull(projectTable.archivedAt),
          ),
    )
    .orderBy(projectTable.createdAt);
  return rows.map(withPresentationOnlyFields);
}
