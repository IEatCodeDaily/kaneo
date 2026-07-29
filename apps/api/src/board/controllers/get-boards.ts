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

      return {
        ...board,
        statistics: {
          completionPercentage,
          totalTasks,
          dueDate,
        },
        archivedTasks: [],
        plannedTasks: [],
        columns: [],
      };
    });

  return boardsWithStatistics;
}

export default getBoards;
