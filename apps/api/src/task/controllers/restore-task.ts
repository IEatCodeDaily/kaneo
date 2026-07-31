import { and, eq, isNotNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable } from "../../database/schema";
import { publishEvent } from "../../events";

/**
 * Restores a soft-deleted task by clearing `deletedAt`/`deletedBy`.
 * Throws 404 when the task does not exist or is not in the trash.
 */
async function restoreTask(taskId: string, currentUserId: string) {
  const [restoredTask] = await db
    .update(taskTable)
    .set({ deletedAt: null, deletedBy: null })
    .where(and(eq(taskTable.id, taskId), isNotNull(taskTable.deletedAt)))
    .returning()
    .execute();

  if (!restoredTask) {
    throw new HTTPException(404, {
      message: "Trashed task not found",
    });
  }

  await publishEvent("task.restored", {
    taskId: restoredTask.id,
    boardId: restoredTask.boardId,
    userId: currentUserId,
    title: restoredTask.title,
  });

  return restoredTask;
}

export default restoreTask;
