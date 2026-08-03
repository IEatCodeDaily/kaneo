import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { boardTable } from "../../database/schema";

async function updateBoard(
  id: string,
  name: string,
  icon: string,
  slug: string,
  description: string,
  isPublic: boolean,
  organizationId: string,
  subtaskDepthLimit?: number,
) {
  const [existingBoard] = await db
    .select()
    .from(boardTable)
    .where(
      and(eq(boardTable.id, id), eq(boardTable.organizationId, organizationId)),
    );

  const isBoardExisting = Boolean(existingBoard);

  if (!isBoardExisting) {
    throw new HTTPException(404, {
      message:
        "Board doesn't exist or doesn't belong to the specified organization",
    });
  }

  const [updatedOrganization] = await db
    .update(boardTable)
    .set({
      name,
      icon,
      slug,
      description,
      isPublic,
      ...(subtaskDepthLimit === undefined ? {} : { subtaskDepthLimit }),
    })
    .where(eq(boardTable.id, id))
    .returning();

  return updatedOrganization;
}

export default updateBoard;
