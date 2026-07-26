import { and, asc, eq, max } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  assetTable,
  columnTable,
  boardTable,
  taskTable,
} from "../../database/schema";
import { publishEvent } from "../../events";
import getNextTaskNumber from "./get-next-task-number";

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

function isSameBoardMove(
  sourceBoardId: string,
  destinationBoardId: string,
) {
  return sourceBoardId === destinationBoardId;
}

async function resolveDestinationStatus(
  destinationBoardId: string,
  currentStatus: string,
  requestedStatus?: string,
) {
  const destinationColumns = await db
    .select({
      id: columnTable.id,
      slug: columnTable.slug,
      position: columnTable.position,
    })
    .from(columnTable)
    .where(eq(columnTable.boardId, destinationBoardId))
    .orderBy(asc(columnTable.position));

  if (destinationColumns.length === 0) {
    throw new HTTPException(400, {
      message: "Destination board does not have a workflow",
    });
  }

  const requestedColumn = requestedStatus
    ? destinationColumns.find((column) => column.slug === requestedStatus)
    : null;

  if (requestedStatus && !requestedColumn) {
    throw new HTTPException(400, {
      message: "Selected status is not valid for the destination board",
    });
  }

  const matchingCurrentColumn = destinationColumns.find(
    (column) => column.slug === currentStatus,
  );

  return requestedColumn ?? matchingCurrentColumn ?? destinationColumns[0];
}

async function getNextTaskPosition(
  dbOrTx: DbOrTx,
  boardId: string,
  status: string,
  columnId: string,
) {
  const [maxPositionResult] = await dbOrTx
    .select({ maxPosition: max(taskTable.position) })
    .from(taskTable)
    .where(
      and(
        eq(taskTable.boardId, boardId),
        eq(taskTable.status, status),
        eq(taskTable.columnId, columnId),
      ),
    );

  return (maxPositionResult?.maxPosition ?? 0) + 1;
}

async function moveTask({
  taskId,
  destinationBoardId,
  destinationStatus,
  currentUserId,
}: {
  taskId: string;
  destinationBoardId: string;
  destinationStatus?: string;
  currentUserId: string;
}) {
  const existingTask = await db.query.taskTable.findFirst({
    where: eq(taskTable.id, taskId),
  });

  if (!existingTask) {
    throw new HTTPException(404, {
      message: "Task not found",
    });
  }

  if (isSameBoardMove(existingTask.boardId, destinationBoardId)) {
    throw new HTTPException(400, {
      message: "Task is already in that board",
    });
  }

  const [sourceBoard, destinationBoard] = await Promise.all([
    db.query.boardTable.findFirst({
      where: eq(boardTable.id, existingTask.boardId),
    }),
    db.query.boardTable.findFirst({
      where: eq(boardTable.id, destinationBoardId),
    }),
  ]);

  if (!sourceBoard || !destinationBoard) {
    throw new HTTPException(404, {
      message: "Board not found",
    });
  }

  if (sourceBoard.organizationId !== destinationBoard.organizationId) {
    throw new HTTPException(400, {
      message: "Tasks can only be moved within the same organization",
    });
  }

  const resolvedColumn = await resolveDestinationStatus(
    destinationBoardId,
    existingTask.status,
    destinationStatus,
  );

  const movedTask = await db.transaction(async (tx) => {
    const [nextTaskNumber, nextPosition] = await Promise.all([
      getNextTaskNumber(destinationBoardId, tx),
      getNextTaskPosition(
        tx,
        destinationBoardId,
        resolvedColumn.slug,
        resolvedColumn.id,
      ),
    ]);

    const [updatedTask] = await tx
      .update(taskTable)
      .set({
        boardId: destinationBoardId,
        status: resolvedColumn.slug,
        columnId: resolvedColumn.id,
        number: nextTaskNumber + 1,
        position: nextPosition,
      })
      .where(eq(taskTable.id, taskId))
      .returning();

    if (!updatedTask) {
      throw new HTTPException(500, {
        message: "Failed to move task",
      });
    }

    await tx
      .update(assetTable)
      .set({ boardId: destinationBoardId })
      .where(eq(assetTable.taskId, taskId));

    return updatedTask;
  });

  await publishEvent("task.moved", {
    taskId,
    type: "moved",
    userId: currentUserId,
    fromBoardId: sourceBoard.id,
    fromBoardName: sourceBoard.name,
    toBoardId: destinationBoard.id,
    toBoardName: destinationBoard.name,
    oldStatus: existingTask.status,
    newStatus: resolvedColumn.slug,
  });

  return {
    task: movedTask,
    sourceBoardId: sourceBoard.id,
    destinationBoardId: destinationBoard.id,
  };
}

export default moveTask;
