import { and, eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { columnTable } from "../../database/schema";
import {
  BACKLOG_STATUS_TYPES,
  isClosedStatusType,
  isStatusType,
  STATUS_TYPE_BY_SLUG,
  STATUS_TYPES,
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
  statusType,
  showOnBoard,
}: {
  boardId: string;
  name: string;
  icon?: string;
  color?: string;
  statusType?: string;
  showOnBoard?: boolean;
}) {
  const slug = toSlug(name);

  if (!slug) {
    throw new HTTPException(400, {
      message: "Status name must contain at least one alphanumeric character",
    });
  }

  // A seeded slug implies its type; anything else must name one explicitly.
  const resolvedStatusType = statusType ?? STATUS_TYPE_BY_SLUG[slug];
  if (!isStatusType(resolvedStatusType)) {
    throw new HTTPException(400, {
      message: `statusType is required. Valid types: ${STATUS_TYPES.join(", ")}`,
    });
  }

  const existing = await db
    .select({ id: columnTable.id })
    .from(columnTable)
    .where(and(eq(columnTable.boardId, boardId), eq(columnTable.slug, slug)));

  if (existing.length > 0) {
    throw new HTTPException(409, {
      message: `A status with slug "${slug}" already exists in this board`,
    });
  }

  // Positions are per type: a new status goes to the end of its type group.
  const [maxPos] = await db
    .select({
      maxPosition: sql<number>`COALESCE(MAX(${columnTable.position}), -1)`,
    })
    .from(columnTable)
    .where(
      and(
        eq(columnTable.boardId, boardId),
        eq(columnTable.statusType, resolvedStatusType),
      ),
    );

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
      isFinal: isClosedStatusType(resolvedStatusType),
      statusType: resolvedStatusType,
      showOnBoard:
        showOnBoard ??
        !(BACKLOG_STATUS_TYPES as readonly string[]).includes(
          resolvedStatusType,
        ),
    })
    .returning();

  if (!created) {
    throw new HTTPException(500, { message: "Failed to create status" });
  }

  return created;
}

export default createColumn;
