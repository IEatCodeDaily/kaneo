import { and, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { columnTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";

type TaskOrderUpdate = {
  id: string;
  position: number;
  status: string;
};

export default async function reorderTasks(
  boardId: string,
  updates: TaskOrderUpdate[],
  userId: string,
) {
  const ids = updates.map((update) => update.id);
  if (new Set(ids).size !== ids.length) {
    throw new HTTPException(400, { message: "Duplicate task IDs" });
  }

  const [tasks, columns] = await Promise.all([
    db
      .select({ id: taskTable.id })
      .from(taskTable)
      .where(and(eq(taskTable.boardId, boardId), inArray(taskTable.id, ids))),
    db
      .select({ id: columnTable.id, slug: columnTable.slug })
      .from(columnTable)
      .where(eq(columnTable.boardId, boardId)),
  ]);
  if (tasks.length !== updates.length) {
    throw new HTTPException(400, {
      message: "Every task must belong to the target board",
    });
  }

  const columnIds = new Map<string, string>();
  for (const column of columns) {
    columnIds.set(column.id, column.id);
    columnIds.set(column.slug, column.id);
  }
  if (updates.some((update) => !columnIds.has(update.status))) {
    throw new HTTPException(400, { message: "Invalid task status" });
  }

  await db.transaction(async (tx) => {
    for (const update of updates) {
      await tx
        .update(taskTable)
        .set({
          columnId: columnIds.get(update.status),
          position: update.position,
          status: update.status,
        })
        .where(
          and(eq(taskTable.id, update.id), eq(taskTable.boardId, boardId)),
        );
    }
  });

  await publishEvent("task-relation.refresh", { boardId, userId });
  return { success: true, updatedCount: updates.length };
}
