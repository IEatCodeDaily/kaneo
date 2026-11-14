import { asc, eq } from "drizzle-orm";
import db from "../../database";
import { columnTable } from "../../database/schema";
import { compareStatuses } from "../../task/status-taxonomy";

/** A board's statuses in display order: type rank, then position in type. */
async function getColumns(boardId: string) {
  const columns = await db
    .select()
    .from(columnTable)
    .where(eq(columnTable.boardId, boardId))
    .orderBy(asc(columnTable.position));

  return columns.sort(compareStatuses);
}

export default getColumns;
