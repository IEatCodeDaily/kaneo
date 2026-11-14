import { eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { columnTable } from "../../database/schema";
import {
  BACKLOG_STATUS_SLUGS,
  isClosedStatusType,
  STATUS_TYPE_BY_SLUG,
} from "../../task/status-taxonomy";

export function toSlug(name: string): string {
  const slug = name
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  return /[\p{L}\p{N}]/u.test(slug) ? slug : "";
}

async function createColumn({
  boardId,
  name,
  icon,
  color,
  isFinal,
  statusType,
}: {
  boardId: string;
  name: string;
  icon?: string;
  color?: string;
  isFinal?: boolean;
  statusType?: string | null;
}) {
  const slug = toSlug(name);

  if (!slug) {
    throw new HTTPException(400, {
      message: "Column name must contain at least one alphanumeric character",
    });
  }

  // Only the backlog statuses are reserved: they have their own surface, so a
  // board column with their slug would double-render tickets. Closed statuses
  // (done/canceled/duplicate) are ALLOWED as columns — that is how a board
  // backs its Canceled status with a visible lane.
  if ((BACKLOG_STATUS_SLUGS as readonly string[]).includes(slug)) {
    throw new HTTPException(409, {
      message: `Column slug "${slug}" is reserved for backlog statuses`,
    });
  }

  // Unknown slugs (custom columns) start unclassified; the board can pick a
  // type in the Status settings afterwards.
  const resolvedStatusType = statusType ?? STATUS_TYPE_BY_SLUG[slug] ?? null;
  const resolvedIsFinal =
    isClosedStatusType(resolvedStatusType) || isFinal === true;

  const existing = await db
    .select({ id: columnTable.id })
    .from(columnTable)
    .where(
      sql`${columnTable.boardId} = ${boardId} AND ${columnTable.slug} = ${slug}`,
    );

  if (existing.length > 0) {
    throw new HTTPException(409, {
      message: `Column with slug "${slug}" already exists in this board`,
    });
  }

  const [maxPos] = await db
    .select({
      maxPosition: sql<number>`COALESCE(MAX(${columnTable.position}), -1)`,
    })
    .from(columnTable)
    .where(eq(columnTable.boardId, boardId));

  const position = (maxPos?.maxPosition ?? -1) + 1;

  const [created] = await db
    .insert(columnTable)
    .values({
      boardId,
      name,
      slug,
      position,
      icon: icon || null,
      color: color || null,
      isFinal: resolvedIsFinal,
      statusType: resolvedStatusType,
    })
    .returning();

  if (!created) {
    throw new HTTPException(500, { message: "Failed to create column" });
  }

  return created;
}

export default createColumn;
