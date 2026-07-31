import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { milestoneTable, taskTable } from "../../database/schema";

/**
 * Assign (or clear, when milestoneId is null) a task's milestone.
 * A task may only reference a milestone that lives on the SAME board.
 */
async function assignMilestoneToTask(
  taskId: string,
  milestoneId: string | null,
) {
  const [task] = await db
    .select({ id: taskTable.id, boardId: taskTable.boardId })
    .from(taskTable)
    .where(eq(taskTable.id, taskId))
    .limit(1);

  if (!task) {
    throw new HTTPException(404, { message: "Task not found" });
  }

  if (milestoneId) {
    const [milestone] = await db
      .select({ id: milestoneTable.id, boardId: milestoneTable.boardId })
      .from(milestoneTable)
      .where(eq(milestoneTable.id, milestoneId))
      .limit(1);

    if (!milestone) {
      throw new HTTPException(404, { message: "Milestone not found" });
    }

    if (milestone.boardId !== task.boardId) {
      throw new HTTPException(400, {
        message: "Milestone does not belong to the task's board",
      });
    }
  }

  const [updated] = await db
    .update(taskTable)
    .set({ milestoneId })
    .where(eq(taskTable.id, taskId))
    .returning();

  if (!updated) {
    throw new HTTPException(404, { message: "Task not found" });
  }

  return updated;
}

export default assignMilestoneToTask;
