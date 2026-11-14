import { and, count, eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { columnTable } from "../../database/schema";
import {
  isClosedStatusType,
  isStatusType,
  STATUS_TYPES,
} from "../../task/status-taxonomy";

/**
 * Every board keeps at least one status of each type — by-type fallbacks
 * (create default, Move to Backlog, forge close) resolve against it. Throws
 * 409 when `column` is the last of its type. Shared by delete + re-type.
 */
export async function assertNotLastOfType(column: {
  boardId: string;
  statusType: string;
  name: string;
}) {
  const [row] = await db
    .select({ n: count() })
    .from(columnTable)
    .where(
      and(
        eq(columnTable.boardId, column.boardId),
        eq(columnTable.statusType, column.statusType),
      ),
    );
  if ((row?.n ?? 0) <= 1) {
    throw new HTTPException(409, {
      message: `"${column.name}" is the board's only ${column.statusType} status. Add another ${column.statusType} status first.`,
    });
  }
}

async function updateColumn(
  id: string,
  data: {
    name?: string;
    icon?: string | null;
    color?: string | null;
    statusType?: string;
    showOnBoard?: boolean;
  },
) {
  const existing = await db.query.columnTable.findFirst({
    where: eq(columnTable.id, id),
  });

  if (!existing) {
    throw new HTTPException(404, { message: "Status not found" });
  }

  const retype =
    data.statusType !== undefined && data.statusType !== existing.statusType;
  let retypedPosition = existing.position;

  if (retype) {
    if (!isStatusType(data.statusType)) {
      throw new HTTPException(400, {
        message: `Invalid statusType. Valid types: ${STATUS_TYPES.join(", ")}`,
      });
    }
    await assertNotLastOfType(existing);
    // Positions are per type: a re-typed status joins the end of its new group.
    const [maxPos] = await db
      .select({
        maxPosition: sql<number>`COALESCE(MAX(${columnTable.position}), -1)`,
      })
      .from(columnTable)
      .where(
        and(
          eq(columnTable.boardId, existing.boardId),
          eq(columnTable.statusType, data.statusType),
        ),
      );
    retypedPosition = (maxPos?.maxPosition ?? -1) + 1;
  }

  const [updated] = await db
    .update(columnTable)
    .set({
      ...(data.name !== undefined && { name: data.name }),
      ...(data.icon !== undefined && { icon: data.icon }),
      ...(data.color !== undefined && { color: data.color }),
      ...(data.showOnBoard !== undefined && { showOnBoard: data.showOnBoard }),
      ...(retype && {
        statusType: data.statusType,
        isFinal: isClosedStatusType(data.statusType ?? null),
        position: retypedPosition,
      }),
    })
    .where(eq(columnTable.id, id))
    .returning();

  if (!updated) {
    throw new HTTPException(500, { message: "Failed to update status" });
  }

  return updated;
}

export default updateColumn;
