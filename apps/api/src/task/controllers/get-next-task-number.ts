import { eq, max } from "drizzle-orm";
import db from "../../database";
import { taskTable } from "../../database/schema";

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

async function getNextTaskNumber(boardId: string, dbOrTx: DbOrTx = db) {
  const [result] = await dbOrTx
    .select({ maxNumber: max(taskTable.number) })
    .from(taskTable)
    .where(eq(taskTable.boardId, boardId));

  return result?.maxNumber ?? 0;
}

export default getNextTaskNumber;
