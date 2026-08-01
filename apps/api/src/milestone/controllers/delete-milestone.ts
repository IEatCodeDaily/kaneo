import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { milestoneTable, taskTable } from "../../database/schema";

async function deleteMilestone(boardId: string, id: string) {
  await db
    .update(taskTable)
    .set({ milestoneId: null })
    .where(eq(taskTable.milestoneId, id));

  const [milestone] = await db
    .delete(milestoneTable)
    .where(and(eq(milestoneTable.id, id), eq(milestoneTable.boardId, boardId)))
    .returning();

  if (!milestone) {
    throw new HTTPException(404, { message: "Milestone not found" });
  }

  return milestone;
}

export default deleteMilestone;
