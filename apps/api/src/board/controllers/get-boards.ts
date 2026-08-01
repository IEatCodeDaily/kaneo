import { and, eq, isNull } from "drizzle-orm";
import db from "../../database";
import { boardTable } from "../../database/schema";
import { listAccessibleResourceIds } from "../../resource-access";

async function getBoards(
  organizationId: string,
  userId: string,
  includeArchived = false,
) {
  const boards = await db.query.boardTable.findMany({
    where: includeArchived
      ? eq(boardTable.organizationId, organizationId)
      : and(
          eq(boardTable.organizationId, organizationId),
          isNull(boardTable.archivedAt),
        ),
    with: {
      tasks: true,
    },
  });

  const accessibleIds = new Set(
    await listAccessibleResourceIds({
      organizationId,
      resourceType: "board",
      userId,
      resourceIds: boards.map((board) => board.id),
    }),
  );

  const boardsWithStatistics = boards
    .filter((board) => accessibleIds.has(board.id))
    .map((board) => {
      const totalTasks = board.tasks.length;
      const completedTasks = board.tasks.filter(
        (task) => task.status === "done" || task.status === "archived",
      ).length;
      const completionPercentage =
        totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      const dueDate = board.tasks.reduce((earliest: Date | null, task) => {
        if (!earliest || (task.dueDate && task.dueDate < earliest))
          return task.dueDate;
        return earliest;
      }, null);

      /**
       * Span of the board on a timeline: from the earliest task start to the
       * latest task due date. `dueDate` above is deliberately left alone — it
       * is the *soonest* deadline and drives the "due" badge, which is a
       * different question from "how long does this board run".
       *
       * Tasks fall back to their due date when they have no start (and vice
       * versa) so a board with only one of the two still occupies a real span
       * rather than disappearing from the timeline.
       */
      let startsAt: Date | null = null;
      let endsAt: Date | null = null;
      for (const task of board.tasks) {
        const taskStart = task.startDate ?? task.dueDate;
        const taskEnd = task.dueDate ?? task.startDate;
        if (taskStart && (!startsAt || taskStart < startsAt))
          startsAt = taskStart;
        if (taskEnd && (!endsAt || taskEnd > endsAt)) endsAt = taskEnd;
      }

      return {
        ...board,
        statistics: {
          completionPercentage,
          totalTasks,
          dueDate,
          startsAt,
          endsAt,
        },
        archivedTasks: [],
        plannedTasks: [],
        columns: [],
      };
    });

  return boardsWithStatistics;
}

export default getBoards;
