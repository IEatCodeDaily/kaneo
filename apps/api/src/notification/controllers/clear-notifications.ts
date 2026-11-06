import { and, eq, ne } from "drizzle-orm";
import db from "../../database";
import { notificationTable } from "../../database/schema";

async function clearNotifications(userId: string) {
  await db
    .delete(notificationTable)
    .where(
      and(
        eq(notificationTable.userId, userId),
        ne(notificationTable.type, "task_flag_raised"),
      ),
    );

  return { success: true };
}

export default clearNotifications;
