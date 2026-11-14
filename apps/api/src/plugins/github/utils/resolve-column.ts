import { and, eq } from "drizzle-orm";
import db from "../../../database";
import { workflowRuleTable } from "../../../database/schema";
import {
  pickStatusByType,
  STATUS_TYPE_BY_SLUG,
} from "../../../task/status-taxonomy";
import { getBoardStatuses } from "../../../task/validate-task-fields";

/**
 * The status a forge event moves a ticket to: the board's workflow rule for
 * the event, else `fallbackStatus` when the board has it, else the board's
 * status of the fallback's TYPE (a board that replaced "done" with "Shipped"
 * still closes), else the board's first status.
 */
export async function resolveTargetStatus(
  boardId: string,
  eventType: string,
  fallbackStatus: string,
  integrationType: "github" | "gitea" = "github",
): Promise<string> {
  const boardColumns = await getBoardStatuses(boardId);

  if (boardColumns.length === 0) {
    return fallbackStatus;
  }

  const rule = await db.query.workflowRuleTable.findFirst({
    where: and(
      eq(workflowRuleTable.boardId, boardId),
      eq(workflowRuleTable.integrationType, integrationType),
      eq(workflowRuleTable.eventType, eventType),
    ),
  });

  if (rule) {
    const mappedColumn = boardColumns.find(
      (column) => column.id === rule.columnId,
    );
    if (mappedColumn) {
      return mappedColumn.slug;
    }
  }

  if (boardColumns.some((column) => column.slug === fallbackStatus)) {
    return fallbackStatus;
  }

  const fallbackType = STATUS_TYPE_BY_SLUG[fallbackStatus];
  const byType = fallbackType
    ? pickStatusByType(boardColumns, fallbackType)
    : undefined;

  return byType?.slug ?? boardColumns[0]?.slug ?? fallbackStatus;
}
