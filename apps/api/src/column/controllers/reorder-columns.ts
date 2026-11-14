import { and, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { columnTable } from "../../database/schema";
import getColumns from "./get-columns";

/**
 * Positions are per type (order WITHIN a type group). A reorder may only
 * shuffle statuses of one type — changing type is an explicit update, never a
 * side effect of a drag.
 */
async function reorderColumns(
  boardId: string,
  columns: Array<{ id: string; position: number }>,
) {
  if (columns.length === 0) return getColumns(boardId);

  const rows = await db
    .select({ id: columnTable.id, statusType: columnTable.statusType })
    .from(columnTable)
    .where(
      and(
        eq(columnTable.boardId, boardId),
        inArray(
          columnTable.id,
          columns.map((col) => col.id),
        ),
      ),
    );

  if (rows.length !== columns.length) {
    throw new HTTPException(400, {
      message: "Every status must belong to this board",
    });
  }
  if (new Set(rows.map((row) => row.statusType)).size > 1) {
    throw new HTTPException(400, {
      message: "Statuses can only be reordered within one type",
    });
  }

  for (const col of columns) {
    await db
      .update(columnTable)
      .set({ position: col.position })
      .where(and(eq(columnTable.id, col.id), eq(columnTable.boardId, boardId)));
  }

  return getColumns(boardId);
}

export default reorderColumns;
