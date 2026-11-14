import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { columnTable } from "../../database/schema";
import { isClosedStatusType } from "../../task/status-taxonomy";

async function updateColumn(
  id: string,
  data: {
    name?: string;
    icon?: string | null;
    color?: string | null;
    isFinal?: boolean;
    statusType?: string | null;
  },
) {
  const existing = await db.query.columnTable.findFirst({
    where: eq(columnTable.id, id),
  });

  if (!existing) {
    throw new HTTPException(404, { message: "Column not found" });
  }

  // The type drives the closed flag: closed types (completed, canceled,
  // duplicate) imply isFinal; clearing the type or setting isFinal=false
  // reopens the column.
  const statusType =
    data.statusType !== undefined
      ? data.statusType
      : data.isFinal === false
        ? null
        : undefined;
  const isFinal =
    statusType !== undefined
      ? isClosedStatusType(statusType)
      : (data.isFinal ?? undefined);

  const [updated] = await db
    .update(columnTable)
    .set({
      ...(data.name !== undefined && { name: data.name }),
      ...(data.icon !== undefined && { icon: data.icon }),
      ...(data.color !== undefined && { color: data.color }),
      ...(isFinal !== undefined && { isFinal }),
      ...(statusType !== undefined && { statusType }),
    })
    .where(eq(columnTable.id, id))
    .returning();

  if (!updated) {
    throw new HTTPException(500, { message: "Failed to update column" });
  }

  return updated;
}

export default updateColumn;
