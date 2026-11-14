import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { columnTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { publishProjectTicketUpdates } from "../../project/publish-project-ticket-updates";
import { sealDescriptionHistory } from "../utils/description-history";
import { assertValidTaskStatus, isStatusClosed } from "../validate-task-fields";

async function updateTaskStatus({
  id,
  status,
  currentUserId,
}: {
  id: string;
  status: string;
  currentUserId: string;
}) {
  const existingTask = await db.query.taskTable.findFirst({
    where: eq(taskTable.id, id),
  });

  if (!existingTask) {
    throw new HTTPException(404, {
      message: "Task not found",
    });
  }

  await assertValidTaskStatus(status, existingTask.boardId);

  const column = await db.query.columnTable.findFirst({
    where: and(
      eq(columnTable.boardId, existingTask.boardId),
      eq(columnTable.slug, status),
    ),
  });

  // Closing the task ends the compression window, so the newest revision is
  // sealed and a later edit starts a fresh history entry.
  // Closed = the status row's is_final, so custom closed statuses seal too.
  const shouldSeal =
    (column?.isFinal ?? false) &&
    !(await isStatusClosed(existingTask.boardId, existingTask.status));

  const [updatedTask] = await db
    .update(taskTable)
    .set({
      status,
      columnId: column?.id ?? null,
      ...(shouldSeal
        ? {
            descriptionHistory: sealDescriptionHistory(
              existingTask.descriptionHistory,
              currentUserId,
            ),
          }
        : {}),
    })
    .where(eq(taskTable.id, id))
    .returning();

  if (!updatedTask) {
    throw new HTTPException(500, {
      message: "Failed to update task status",
    });
  }

  await publishEvent("task.status_changed", {
    taskId: updatedTask.id,
    boardId: updatedTask.boardId,
    userId: currentUserId,
    oldStatus: existingTask.status,
    newStatus: status,
    title: updatedTask.title,
    assigneeId: updatedTask.userId,
    type: "status_changed",
  });

  await publishEvent("task-relation.refresh", {
    boardId: updatedTask.boardId,
    userId: currentUserId,
  });

  await publishProjectTicketUpdates(updatedTask.id);

  return updatedTask;
}

export default updateTaskStatus;
