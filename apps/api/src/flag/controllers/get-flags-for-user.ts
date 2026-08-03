import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import db from "../../database";
import {
  boardTable,
  flagTypeTable,
  taskFlagTable,
  taskTable,
  teamMemberTable,
  teamTable,
} from "../../database/schema";

/**
 * Active flags aimed at the current user, either directly (targetUserId) or
 * via one of their teams (targetTeamId). Resolved flags are excluded.
 *
 * Note: boards belong directly to an organization in this schema — there is no
 * intermediate project table — so org scoping reads `board.organizationId`.
 */
async function getFlagsForUser(userId: string, organizationId?: string) {
  const teams = await db
    .select({ teamId: teamMemberTable.teamId })
    .from(teamMemberTable)
    .innerJoin(teamTable, eq(teamMemberTable.teamId, teamTable.id))
    .where(
      and(
        eq(teamMemberTable.userId, userId),
        organizationId
          ? eq(teamTable.organizationId, organizationId)
          : undefined,
      ),
    );

  const teamIds = teams.map((team) => team.teamId);

  const targetCondition = teamIds.length
    ? or(
        eq(taskFlagTable.targetUserId, userId),
        inArray(taskFlagTable.targetTeamId, teamIds),
      )
    : eq(taskFlagTable.targetUserId, userId);

  const conditions = [isNull(taskFlagTable.resolvedAt), targetCondition];

  if (organizationId) {
    conditions.push(eq(boardTable.organizationId, organizationId));
  }

  return db
    .select({
      id: taskFlagTable.id,
      taskId: taskFlagTable.taskId,
      taskTitle: taskTable.title,
      taskNumber: taskTable.number,
      boardId: taskTable.boardId,
      boardName: boardTable.name,
      organizationId: boardTable.organizationId,
      flagTypeId: taskFlagTable.flagTypeId,
      flagTypeName: flagTypeTable.name,
      flagTypeColor: flagTypeTable.color,
      flagTypeIcon: flagTypeTable.icon,
      flaggedBy: taskFlagTable.flaggedBy,
      targetUserId: taskFlagTable.targetUserId,
      targetTeamId: taskFlagTable.targetTeamId,
      note: taskFlagTable.note,
      createdAt: taskFlagTable.createdAt,
    })
    .from(taskFlagTable)
    .innerJoin(taskTable, eq(taskFlagTable.taskId, taskTable.id))
    .innerJoin(boardTable, eq(taskTable.boardId, boardTable.id))
    .innerJoin(flagTypeTable, eq(taskFlagTable.flagTypeId, flagTypeTable.id))
    .where(and(...conditions))
    .orderBy(desc(taskFlagTable.createdAt));
}

export default getFlagsForUser;
