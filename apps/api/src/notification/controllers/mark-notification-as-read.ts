import { and, eq, ne } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { notificationTable } from "../../database/schema";

async function markNotificationAsRead(
  id: string,
  userId: string,
  isRead = true,
) {
  const [notification] = await db
    .update(notificationTable)
    .set({ isRead })
    .where(
      and(
        eq(notificationTable.id, id),
        eq(notificationTable.userId, userId),
        ne(notificationTable.type, "task_flag_raised"),
      ),
    )
    .returning();

  if (!notification) {
    throw new HTTPException(404, {
      message: "Notification not found",
    });
  }

  return notification;
}

export default markNotificationAsRead;
