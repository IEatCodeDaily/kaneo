import { and, eq, ne } from "drizzle-orm";
import db from "../../database";
import { notificationTable } from "../../database/schema";

async function markAllNotificationsAsRead(userId: string) {
  await db
    .update(notificationTable)
    .set({ isRead: true })
    .where(
      and(
        eq(notificationTable.userId, userId),
        ne(notificationTable.type, "task_flag_raised"),
      ),
    );

  return { success: true };
}

export default markAllNotificationsAsRead;
