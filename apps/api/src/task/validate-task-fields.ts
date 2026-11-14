import { and, asc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { columnTable } from "../database/schema";
import {
  compareStatuses,
  pickStatusByType,
  type StatusType,
} from "./status-taxonomy";

export const VALID_PRIORITIES = [
  "no-priority",
  "low",
  "medium",
  "high",
  "urgent",
] as const;

export function assertValidPriority(priority: string): void {
  if (!(VALID_PRIORITIES as readonly string[]).includes(priority)) {
    throw new HTTPException(400, {
      message: `Invalid priority "${priority}". Valid values: ${VALID_PRIORITIES.join(", ")}`,
    });
  }
}

/** A board's statuses in display order (type rank, then position). */
export async function getBoardStatuses(boardId: string) {
  const rows = await db
    .select({
      id: columnTable.id,
      slug: columnTable.slug,
      statusType: columnTable.statusType,
      position: columnTable.position,
      isFinal: columnTable.isFinal,
    })
    .from(columnTable)
    .where(eq(columnTable.boardId, boardId))
    .orderBy(asc(columnTable.position));
  return rows.sort(compareStatuses);
}

/** Every status is a board row: the valid statuses are the board's slugs. */
export async function getValidTaskStatuses(boardId: string): Promise<string[]> {
  return (await getBoardStatuses(boardId)).map((status) => status.slug);
}

export async function assertValidTaskStatus(
  status: string,
  boardId: string,
): Promise<void> {
  const validStatuses = await getValidTaskStatuses(boardId);

  if (!validStatuses.includes(status)) {
    throw new HTTPException(400, {
      message: `Invalid status "${status}". Valid statuses for this board: ${validStatuses.join(", ")}`,
    });
  }
}

/**
 * The board's status for a type — the seeded slug when present, else the
 * first row of that type. Replaces every hardcoded fallback slug. Every board
 * keeps ≥1 row per type (delete/re-type guards), so this only misses on a
 * board created outside the API; callers fall back to their old literal then.
 */
export async function resolveStatusByType(
  boardId: string,
  statusType: StatusType,
): Promise<string | undefined> {
  return pickStatusByType(await getBoardStatuses(boardId), statusType)?.slug;
}

/**
 * Whether a status closes a ticket on this board — its row's `is_final`.
 * Never a slug list: a custom closed status ("Won't fix") must count.
 */
export async function isStatusClosed(
  boardId: string,
  slug: string,
): Promise<boolean> {
  const [row] = await db
    .select({ isFinal: columnTable.isFinal })
    .from(columnTable)
    .where(and(eq(columnTable.boardId, boardId), eq(columnTable.slug, slug)))
    .limit(1);
  return row?.isFinal === true;
}

export function coerceStatus(
  status: string,
  validStatuses: string[],
  fallbackStatus: string,
): { status: string; warning?: string } {
  if (validStatuses.includes(status)) {
    return { status };
  }
  return {
    status: fallbackStatus,
    warning: `Unknown status "${status}" mapped to "${fallbackStatus}"`,
  };
}

export function coercePriority(priority: string): {
  priority: string;
  warning?: string;
} {
  if ((VALID_PRIORITIES as readonly string[]).includes(priority)) {
    return { priority };
  }
  return {
    priority: "no-priority",
    warning: `Unknown priority "${priority}" mapped to "no-priority"`,
  };
}
