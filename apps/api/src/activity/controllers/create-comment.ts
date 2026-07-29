import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  activityTable,
  boardTable,
  taskTable,
  userTable,
} from "../../database/schema";
import { publishEvent } from "../../events";
import createNotification from "../../notification/controllers/create-notification";
import { parseMentionIds } from "../../utils/parse-mentions";

async function createComment(taskId: string, userId: string, content: string) {
  const [activity] = await db
    .insert(activityTable)
    .values({
      taskId,
      type: "comment",
      userId,
      content,
    })
    .returning();

  if (!activity) {
    throw new HTTPException(500, {
      message: "Failed to create activity",
    });
  }

  const [user] = await db
    .select({ name: userTable.name })
    .from(userTable)
    .where(eq(userTable.id, userId));

  const [task] = await db
    .select({
      assigneeId: taskTable.userId,
      boardId: taskTable.boardId,
      title: taskTable.title,
      organizationId: boardTable.organizationId,
    })
    .from(taskTable)
    .innerJoin(boardTable, eq(taskTable.boardId, boardTable.id))
    .where(eq(taskTable.id, taskId));

  if (task) {
    await publishEvent("comment.created", {
      ...activity,
      comment: content,
      authorName: user?.name ?? null,
      boardId: task.boardId,
    });
  }

  // Notify any organization members @mentioned in the comment (not the author).
  const mentionedIds = parseMentionIds(content).filter((id) => id !== userId);
  for (const mentionedId of mentionedIds) {
    await createNotification({
      userId: mentionedId,
      type: "task_mention",
      eventData: {
        taskTitle: task?.title ?? null,
        mentionerName: user?.name ?? null,
        boardId: task?.boardId ?? null,
        organizationId: task?.organizationId ?? null,
      },
      resourceId: taskId,
      resourceType: "task",
    });
  }

  if (
    task?.assigneeId &&
    task.assigneeId !== userId &&
    !mentionedIds.includes(task.assigneeId)
  ) {
    await createNotification({
      userId: task.assigneeId,
      type: "task_comment",
      eventData: {
        taskTitle: task.title,
        commenterName: user?.name ?? null,
        commentPreview: content.slice(0, 160),
        boardId: task.boardId,
        organizationId: task.organizationId,
      },
      resourceId: taskId,
      resourceType: "task",
    });
  }

  return activity;
}

export default createComment;
