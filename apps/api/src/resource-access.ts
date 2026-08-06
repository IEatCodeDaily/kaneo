import { and, eq } from "drizzle-orm";
import db from "./database";
import {
  organizationMemberTable,
  resourceGrantTable,
  teamMemberTable,
  userTable,
} from "./database/schema";

export const RESOURCE_PRIVILEGES = ["none", "view", "edit", "manage"] as const;
export type ResourcePrivilege = (typeof RESOURCE_PRIVILEGES)[number];
export type ResourceType = "board" | "repo";

const rank = new Map(RESOURCE_PRIVILEGES.map((value, index) => [value, index]));

export function highestPrivilege(
  privileges: readonly ResourcePrivilege[],
): ResourcePrivilege {
  return privileges.reduce<ResourcePrivilege>(
    (highest, current) =>
      (rank.get(current) ?? 0) > (rank.get(highest) ?? 0) ? current : highest,
    "none",
  );
}

export async function requireResourcePrivilege(input: {
  organizationId: string;
  resourceType: ResourceType;
  resourceId: string;
  userId: string;
  required: Exclude<ResourcePrivilege, "none">;
}) {
  const actual = await getResourcePrivilege(input);
  return privilegeAllows(actual, input.required);
}

export async function getResourcePrivilege(input: {
  organizationId: string;
  resourceType: ResourceType;
  resourceId: string;
  userId: string;
}): Promise<ResourcePrivilege> {
  const [user, membership, grants, teams] = await Promise.all([
    db
      .select({ role: userTable.role })
      .from(userTable)
      .where(eq(userTable.id, input.userId))
      .limit(1),
    db
      .select({ role: organizationMemberTable.role })
      .from(organizationMemberTable)
      .where(
        and(
          eq(organizationMemberTable.organizationId, input.organizationId),
          eq(organizationMemberTable.userId, input.userId),
        ),
      )
      .limit(1),
    db
      .select({
        privilege: resourceGrantTable.privilege,
        teamId: resourceGrantTable.teamId,
        userId: resourceGrantTable.userId,
      })
      .from(resourceGrantTable)
      .where(
        and(
          eq(resourceGrantTable.organizationId, input.organizationId),
          eq(resourceGrantTable.resourceType, input.resourceType),
          eq(resourceGrantTable.resourceId, input.resourceId),
        ),
      ),
    db
      .select({ teamId: teamMemberTable.teamId })
      .from(teamMemberTable)
      .where(eq(teamMemberTable.userId, input.userId)),
  ]);

  if (user[0]?.role === "admin" || membership[0]?.role === "owner") {
    return "manage";
  }

  // Additive rollout: resources without grants retain organization-wide access.
  if (grants.length === 0) return membership.length > 0 ? "manage" : "none";

  const teamIds = new Set(teams.map((team) => team.teamId));
  const applicable = grants
    .filter(
      (grant) =>
        grant.userId === input.userId ||
        (grant.teamId !== null && teamIds.has(grant.teamId)),
    )
    .map((grant) => grant.privilege as ResourcePrivilege);
  return highestPrivilege(applicable);
}

export function privilegeAllows(
  actual: ResourcePrivilege,
  required: Exclude<ResourcePrivilege, "none">,
) {
  return (rank.get(actual) ?? 0) >= (rank.get(required) ?? 0);
}

export async function listAccessibleResourceIds(input: {
  organizationId: string;
  resourceType: ResourceType;
  userId: string;
  resourceIds: string[];
}) {
  if (input.resourceIds.length === 0) return [];
  const results = await Promise.all(
    input.resourceIds.map(async (resourceId) => ({
      resourceId,
      privilege: await getResourcePrivilege({ ...input, resourceId }),
    })),
  );
  return results
    .filter(({ privilege }) => privilegeAllows(privilege, "view"))
    .map(({ resourceId }) => resourceId);
}

export const _resourceAccessTest = { rank };
