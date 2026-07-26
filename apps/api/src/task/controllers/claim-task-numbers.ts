import { eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { boardTable } from "../../database/schema";

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

async function claimTaskNumbers(
  boardId: string,
  count: number,
  dbOrTx: DbOrTx = db,
) {
  const [updated] = await dbOrTx
    .update(boardTable)
    .set({
      lastTaskNumber: sql`${boardTable.lastTaskNumber} + ${count}`,
    })
    .where(eq(boardTable.id, boardId))
    .returning({ lastTaskNumber: boardTable.lastTaskNumber });

  if (!updated) {
    throw new HTTPException(404, {
      message: "Board not found",
    });
  }

  return updated.lastTaskNumber - count + 1;
}

export async function claimTaskNumber(boardId: string, dbOrTx: DbOrTx = db) {
  return claimTaskNumbers(boardId, 1, dbOrTx);
}

export default claimTaskNumbers;
