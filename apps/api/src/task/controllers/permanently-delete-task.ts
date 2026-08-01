import { and, eq, isNotNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { deleteS3Keys, getTaskAssetKeys } from "../../storage/cleanup-assets";

/**
 * Permanently removes a task that is already in the trash. This is a real DB
 * delete - FK cascades drop assets/labels/relations - so it is only allowed for
 * tasks whose `deletedAt` is set.
 */
async function permanentlyDeleteTask(taskId: string, currentUserId: string) {
  const assetKeys = await getTaskAssetKeys(taskId);

  const [deletedTask] = await db
    .delete(taskTable)
    .where(and(eq(taskTable.id, taskId), isNotNull(taskTable.deletedAt)))
    .returning()
    .execute();

  if (!deletedTask) {
    throw new HTTPException(404, {
      message: "Trashed task not found",
    });
  }

  await publishEvent("task.permanently_deleted", {
    taskId: deletedTask.id,
    boardId: deletedTask.boardId,
    userId: currentUserId,
    title: deletedTask.title,
  });

  // Fire-and-forget S3 cleanup after successful DB delete
  if (assetKeys.length > 0) {
    deleteS3Keys(assetKeys).catch(() => {});
  }

  return deletedTask;
}

export default permanentlyDeleteTask;
