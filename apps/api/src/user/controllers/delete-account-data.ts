import { APIError } from "better-auth/api";
import { and, eq, inArray, or } from "drizzle-orm";
import db from "../../database";
import {
  organizationMemberTable,
  organizationTable,
  projectBoardTable,
  projectMilestoneTable,
  projectRepoTable,
  projectTable,
  projectTableLinkTable,
  projectTicketTable,
  projectUpdateTable,
} from "../../database/schema";
import {
  formatBlockedOrganizationsMessage,
  hasOwnerRole,
  type OrganizationMembershipSummary,
  planAccountDeletion,
} from "../account-deletion";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function collectMemberships(
  tx: Tx,
  userId: string,
): Promise<OrganizationMembershipSummary[]> {
  const own = await tx
    .select({ organizationId: organizationMemberTable.organizationId })
    .from(organizationMemberTable)
    .where(eq(organizationMemberTable.userId, userId));
  if (own.length === 0) return [];

  const members = await tx
    .select({
      organizationId: organizationMemberTable.organizationId,
      organizationName: organizationTable.name,
      userId: organizationMemberTable.userId,
      role: organizationMemberTable.role,
    })
    .from(organizationMemberTable)
    .innerJoin(
      organizationTable,
      eq(organizationMemberTable.organizationId, organizationTable.id),
    )
    .where(
      inArray(
        organizationMemberTable.organizationId,
        own.map((row) => row.organizationId),
      ),
    );

  return own.map(({ organizationId }) => {
    const inOrg = members.filter((m) => m.organizationId === organizationId);
    const self = inOrg.find((m) => m.userId === userId);
    return {
      organizationId,
      organizationName: inOrg[0]?.organizationName ?? "organization",
      isOwner: hasOwnerRole(self?.role ?? ""),
      memberCount: inOrg.length,
      ownerCount: inOrg.filter((m) => hasOwnerRole(m.role)).length,
    };
  });
}

/*
  Project records reference their lead/author with ON DELETE RESTRICT, so the
  user row cannot be removed while any remain. They are shared work, so we
  refuse instead of silently reassigning or deleting them.
*/
async function findRetainedProjectNames(tx: Tx, userId: string) {
  const refs = [
    tx
      .select({ id: projectTable.id })
      .from(projectTable)
      .where(
        or(
          eq(projectTable.leadUserId, userId),
          eq(projectTable.createdBy, userId),
        ),
      ),
    tx
      .select({ id: projectMilestoneTable.projectId })
      .from(projectMilestoneTable)
      .where(eq(projectMilestoneTable.completedBy, userId)),
    tx
      .select({ id: projectTicketTable.projectId })
      .from(projectTicketTable)
      .where(eq(projectTicketTable.addedBy, userId)),
    tx
      .select({ id: projectBoardTable.projectId })
      .from(projectBoardTable)
      .where(eq(projectBoardTable.createdBy, userId)),
    tx
      .select({ id: projectRepoTable.projectId })
      .from(projectRepoTable)
      .where(eq(projectRepoTable.createdBy, userId)),
    tx
      .select({ id: projectTableLinkTable.projectId })
      .from(projectTableLinkTable)
      .where(eq(projectTableLinkTable.createdBy, userId)),
    tx
      .select({ id: projectUpdateTable.projectId })
      .from(projectUpdateTable)
      .where(eq(projectUpdateTable.authorId, userId)),
  ];
  const ids = new Set<string>();
  for (const query of refs) {
    for (const row of await query) ids.add(row.id);
  }
  if (ids.size === 0) return [];

  const rows = await tx
    .select({ name: projectTable.name })
    .from(projectTable)
    .where(inArray(projectTable.id, [...ids]));
  return rows.map((row) => row.name);
}

/**
 * Runs before Better Auth removes the user row. Organizations the user is the
 * only member of are deleted with them; shared organizations are left. Throws
 * CONFLICT, rolling everything back, when the user is the sole owner of a
 * shared organization or still leads/authored project records.
 */
export async function deleteAccountData(userId: string) {
  return db.transaction(async (tx) => {
    const plan = planAccountDeletion(await collectMemberships(tx, userId));

    if (plan.blockedOrganizationNames.length > 0) {
      throw new APIError("CONFLICT", {
        message: formatBlockedOrganizationsMessage(
          plan.blockedOrganizationNames,
        ),
      });
    }

    if (plan.organizationIdsToDelete.length > 0) {
      await tx
        .delete(organizationTable)
        .where(inArray(organizationTable.id, plan.organizationIdsToDelete));
    }

    if (plan.organizationIdsToLeave.length > 0) {
      await tx
        .delete(organizationMemberTable)
        .where(
          and(
            eq(organizationMemberTable.userId, userId),
            inArray(
              organizationMemberTable.organizationId,
              plan.organizationIdsToLeave,
            ),
          ),
        );
    }

    const retained = await findRetainedProjectNames(tx, userId);
    if (retained.length > 0) {
      const list = retained.map((name) => `"${name}"`).join(", ");
      throw new APIError("CONFLICT", {
        message: `You still lead or authored records in ${list}. Reassign the project lead or ask an admin to archive ${retained.length === 1 ? "it" : "them"} before deleting your account.`,
      });
    }

    return plan;
  });
}

export default deleteAccountData;
