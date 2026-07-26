import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { columnTable, boardTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import {
  coercePriority,
  coerceStatus,
  getValidTaskStatuses,
} from "../validate-task-fields";
import getNextTaskNumber from "./get-next-task-number";

export type ImportTask = {
  title: string;
  description?: string;
  status: string;
  priority?: string;
  startDate?: string | null;
  dueDate?: string | null;
  userId?: string | null;
};

async function importTasks(
  boardId: string,
  tasksToImport: ImportTask[],
  currentUserId?: string,
) {
  const board = await db.query.boardTable.findFirst({
    where: eq(boardTable.id, boardId),
  });

  if (!board) {
    throw new HTTPException(404, {
      message: "Board not found",
    });
  }

  let taskNumber = await getNextTaskNumber(boardId);
  const validStatuses = await getValidTaskStatuses(boardId);

  const results = [];

  for (const taskData of tasksToImport) {
    try {
      const { status, warning: statusWarning } = coerceStatus(
        taskData.status,
        validStatuses,
      );
      const { priority, warning: priorityWarning } = coercePriority(
        taskData.priority || "low",
      );
      const warnings = [statusWarning, priorityWarning].filter(Boolean);

      const column = await db.query.columnTable.findFirst({
        where: and(
          eq(columnTable.boardId, boardId),
          eq(columnTable.slug, status),
        ),
      });

      const [createdTask] = await db
        .insert(taskTable)
        .values({
          boardId,
          userId: taskData.userId || null,
          title: taskData.title,
          status,
          columnId: column?.id ?? null,
          startDate: taskData.startDate ? new Date(taskData.startDate) : null,
          dueDate: taskData.dueDate ? new Date(taskData.dueDate) : null,
          description: taskData.description || "",
          priority,
          number: ++taskNumber,
        })
        .returning();

      if (createdTask) {
        await publishEvent("task.created", {
          ...createdTask,
          taskId: createdTask.id,
          userId: createdTask.userId ?? "",
          currentUserId: currentUserId ?? "",
          type: "create",
          content: "imported the task",
        });

        results.push({
          success: true,
          task: createdTask,
          ...(warnings.length > 0 && { warnings }),
        });
      } else {
        results.push({
          success: false,
          error: "Failed to create task",
          task: taskData,
        });
      }
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      results.push({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        task: taskData,
      });
    }
  }

  return {
    importedAt: new Date().toISOString(),
    board: {
      id: board.id,
      name: board.name,
      slug: board.slug,
    },
    results: {
      total: tasksToImport.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      tasks: results,
    },
  };
}

export default importTasks;
