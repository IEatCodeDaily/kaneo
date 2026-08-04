import { and, desc, eq } from "drizzle-orm";
import db from "../../database";
import {
  boardTable,
  columnTable,
  notificationTable,
  organizationTable,
  taskTable,
} from "../../database/schema";

async function getNotifications(userId: string) {
  const rows = await db
    .select({
      notification: notificationTable,
      boardId: boardTable.id,
      boardName: boardTable.name,
      organizationId: organizationTable.id,
      taskStatus: taskTable.status,
      taskStatusName: columnTable.name,
    })
    .from(notificationTable)
    .leftJoin(
      taskTable,
      and(
        eq(notificationTable.resourceId, taskTable.id),
        eq(notificationTable.resourceType, "task"),
      ),
    )
    .leftJoin(boardTable, eq(taskTable.boardId, boardTable.id))
    .leftJoin(columnTable, eq(taskTable.columnId, columnTable.id))
    .leftJoin(
      organizationTable,
      eq(boardTable.organizationId, organizationTable.id),
    )
    .where(eq(notificationTable.userId, userId))
    .orderBy(desc(notificationTable.createdAt))
    .limit(50);

  return rows.map(
    ({
      notification,
      boardId,
      boardName,
      organizationId,
      taskStatus,
      taskStatusName,
    }) => {
      if (!boardId && !organizationId) {
        return notification;
      }

      const existing =
        notification.eventData &&
        typeof notification.eventData === "object" &&
        !Array.isArray(notification.eventData)
          ? (notification.eventData as Record<string, unknown>)
          : {};

      return {
        ...notification,
        eventData: {
          ...existing,
          boardId: boardId ?? existing.boardId ?? null,
          boardName: boardName ?? existing.boardName ?? null,
          organizationId: organizationId ?? existing.organizationId ?? null,
          // Current status of the ticket, resolved live at read time so the
          // inbox reflects moves that happened after the notification fired.
          taskStatus: taskStatus ?? existing.taskStatus ?? null,
          // Per-board display label; falls back to the raw slug when the task
          // has no column (e.g. Backlog) so the UI always has something to show.
          taskStatusName:
            taskStatusName ?? taskStatus ?? existing.taskStatusName ?? null,
        },
      };
    },
  );
}

export default getNotifications;
