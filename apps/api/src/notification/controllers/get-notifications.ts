import { and, desc, eq } from "drizzle-orm";
import db from "../../database";
import {
  boardTable,
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
    .leftJoin(
      organizationTable,
      eq(boardTable.organizationId, organizationTable.id),
    )
    .where(eq(notificationTable.userId, userId))
    .orderBy(desc(notificationTable.createdAt))
    .limit(50);

  return rows.map(({ notification, boardId, boardName, organizationId }) => {
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
      },
    };
  });
}

export default getNotifications;
