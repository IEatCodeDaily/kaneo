import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import db from "../../database";
import {
  activityTable,
  boardTable,
  taskTable,
  userTable,
  organizationTable,
  organizationMemberTable,
} from "../../database/schema";

type SearchParams = {
  query: string;
  userEmail?: string;
  userId?: string;
  type?:
    | "all"
    | "tasks"
    | "boards"
    | "organizations"
    | "comments"
    | "activities";
  organizationId?: string;
  boardId?: string;
  limit?: number;
};

type SearchResult = {
  id: string;
  type: "task" | "board" | "organization" | "comment" | "activity";
  title: string;
  description?: string;
  content?: string;
  boardId?: string;
  boardName?: string;
  organizationId?: string;
  organizationName?: string;
  userId?: string;
  userName?: string;
  createdAt: Date;
  relevanceScore: number;
  taskNumber?: number;
  boardSlug?: string;
  priority?: string;
  status?: string;
};

function toDisplayCase(value: string) {
  return value
    .replace(/[-_]/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function getActivitySearchContent(
  type: string,
  content: string | null,
  eventData: unknown,
) {
  if (content) return content;
  if (!eventData || typeof eventData !== "object" || Array.isArray(eventData)) {
    return undefined;
  }

  const data = eventData as Record<string, unknown>;

  switch (type) {
    case "status_changed":
      return `changed status from ${toDisplayCase(String(data.oldStatus ?? ""))} to ${toDisplayCase(String(data.newStatus ?? ""))}`;
    case "priority_changed":
      return `changed priority from ${toDisplayCase(String(data.oldPriority ?? ""))} to ${toDisplayCase(String(data.newPriority ?? ""))}`;
    case "unassigned":
      return "unassigned the task";
    case "assignee_changed":
      return data.isSelfAssigned
        ? "assigned the task to themselves"
        : `assigned the task to ${String(data.newAssignee ?? "someone")}`;
    case "due_date_changed":
      if (!data.newDueDate) {
        return "cleared the due date";
      }
      if (!data.oldDueDate) {
        return `set due date to ${String(data.newDueDate)}`;
      }
      return `changed due date from ${String(data.oldDueDate)} to ${String(data.newDueDate)}`;
    case "title_changed":
      return `changed title from "${String(data.oldTitle ?? "")}" to "${String(data.newTitle ?? "")}"`;
    case "task":
      return "created the task";
    default:
      return undefined;
  }
}

async function globalSearch(params: SearchParams): Promise<{
  results: SearchResult[];
  totalCount: number;
  searchQuery: string;
}> {
  const {
    query,
    userId,
    userEmail,
    type = "all",
    organizationId,
    boardId,
    limit = 20,
  } = params;

  let resolvedUserId = userId;
  if (!resolvedUserId && userEmail) {
    const user = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.email, userEmail))
      .limit(1);

    if (user.length > 0 && user[0]) {
      resolvedUserId = user[0].id;
    }
  }

  if (!resolvedUserId) {
    return { results: [], totalCount: 0, searchQuery: query };
  }

  const userOrganizations = await db
    .select({ organizationId: organizationMemberTable.organizationId })
    .from(organizationMemberTable)
    .where(eq(organizationMemberTable.userId, resolvedUserId));

  const accessibleOrganizationIds = userOrganizations
    .map((w) => w.organizationId)
    .filter(Boolean);

  if (accessibleOrganizationIds.length === 0) {
    return { results: [], totalCount: 0, searchQuery: query };
  }

  const results: SearchResult[] = [];
  const searchPattern = `%${query.toLowerCase()}%`;

  const organizationFilter = organizationId
    ? eq(boardTable.organizationId, organizationId)
    : inArray(boardTable.organizationId, accessibleOrganizationIds);

  // Check if query matches short-id pattern (e.g. "DEP-23")
  const shortIdMatch = query.match(/^([A-Za-z][\w-]*)-(\d+)$/);

  if (type === "all" || type === "tasks") {
    const seenTaskIds = new Set<string>();

    // If query matches short-id pattern, look up by board slug + task number first
    if (shortIdMatch?.[1] && shortIdMatch[2]) {
      const slug = shortIdMatch[1];
      const numberStr = shortIdMatch[2];
      const taskNumber = Number.parseInt(numberStr, 10);

      const shortIdTasks = await db
        .select({
          id: taskTable.id,
          title: taskTable.title,
          description: taskTable.description,
          boardId: taskTable.boardId,
          boardName: boardTable.name,
          boardSlug: boardTable.slug,
          organizationId: boardTable.organizationId,
          organizationName: organizationTable.name,
          userId: taskTable.userId,
          userName: userTable.name,
          createdAt: taskTable.createdAt,
          taskNumber: taskTable.number,
          priority: taskTable.priority,
          status: taskTable.status,
        })
        .from(taskTable)
        .leftJoin(boardTable, eq(taskTable.boardId, boardTable.id))
        .leftJoin(
          organizationTable,
          eq(boardTable.organizationId, organizationTable.id),
        )
        .leftJoin(userTable, eq(taskTable.userId, userTable.id))
        .where(
          and(
            organizationFilter,
            boardId ? eq(taskTable.boardId, boardId) : undefined,
            ilike(boardTable.slug, slug),
            eq(taskTable.number, taskNumber),
          ),
        )
        .limit(1);

      for (const task of shortIdTasks) {
        seenTaskIds.add(task.id);
        results.push({
          id: task.id,
          type: "task",
          title: task.title,
          description: task.description || undefined,
          boardId: task.boardId,
          boardName: task.boardName || undefined,
          boardSlug: task.boardSlug || undefined,
          organizationId: task.organizationId || undefined,
          organizationName: task.organizationName || undefined,
          userId: task.userId || undefined,
          userName: task.userName || undefined,
          createdAt: task.createdAt,
          relevanceScore: 10, // Highest relevance for exact short-id match
          taskNumber: task.taskNumber || undefined,
          priority: task.priority || undefined,
          status: task.status,
        });
      }
    }

    // Also run text search for tasks
    const taskRelevanceScore = sql<number>`
      CASE
        WHEN LOWER(${taskTable.title}) LIKE ${searchPattern} THEN 3
        WHEN LOWER(${taskTable.description}) LIKE ${searchPattern} THEN 2
        ELSE 1
      END
    `;

    const taskQuery = db
      .select({
        id: taskTable.id,
        title: taskTable.title,
        description: taskTable.description,
        boardId: taskTable.boardId,
        boardName: boardTable.name,
        boardSlug: boardTable.slug,
        organizationId: boardTable.organizationId,
        organizationName: organizationTable.name,
        userId: taskTable.userId,
        userName: userTable.name,
        createdAt: taskTable.createdAt,
        taskNumber: taskTable.number,
        priority: taskTable.priority,
        status: taskTable.status,
        relevanceScore: taskRelevanceScore.as("relevanceScore"),
      })
      .from(taskTable)
      .leftJoin(boardTable, eq(taskTable.boardId, boardTable.id))
      .leftJoin(organizationTable, eq(boardTable.organizationId, organizationTable.id))
      .leftJoin(userTable, eq(taskTable.userId, userTable.id))
      .where(
        and(
          organizationFilter,
          boardId ? eq(taskTable.boardId, boardId) : undefined,
          or(
            ilike(taskTable.title, searchPattern),
            ilike(taskTable.description, searchPattern),
          ),
        ),
      )
      .orderBy(desc(taskRelevanceScore), desc(taskTable.createdAt))
      .limit(limit);

    const tasks = await taskQuery;

    for (const task of tasks) {
      if (seenTaskIds.has(task.id)) continue;
      results.push({
        id: task.id,
        type: "task",
        title: task.title,
        description: task.description || undefined,
        boardId: task.boardId,
        boardName: task.boardName || undefined,
        boardSlug: task.boardSlug || undefined,
        organizationId: task.organizationId || undefined,
        organizationName: task.organizationName || undefined,
        userId: task.userId || undefined,
        userName: task.userName || undefined,
        createdAt: task.createdAt,
        relevanceScore: task.relevanceScore,
        taskNumber: task.taskNumber || undefined,
        priority: task.priority || undefined,
        status: task.status,
      });
    }
  }

  if (type === "all" || type === "boards") {
    const boardRelevanceScore = sql<number>`
      CASE
        WHEN LOWER(${boardTable.name}) LIKE ${searchPattern} THEN 3
        WHEN LOWER(${boardTable.description}) LIKE ${searchPattern} THEN 2
        ELSE 1
      END
    `;

    const boardQuery = db
      .select({
        id: boardTable.id,
        name: boardTable.name,
        description: boardTable.description,
        slug: boardTable.slug,
        organizationId: boardTable.organizationId,
        organizationName: organizationTable.name,
        createdAt: boardTable.createdAt,
        relevanceScore: boardRelevanceScore.as("relevanceScore"),
      })
      .from(boardTable)
      .leftJoin(organizationTable, eq(boardTable.organizationId, organizationTable.id))
      .where(
        and(
          organizationFilter,
          or(
            ilike(boardTable.name, searchPattern),
            ilike(boardTable.description, searchPattern),
          ),
        ),
      )
      .orderBy(desc(boardRelevanceScore), desc(boardTable.createdAt))
      .limit(limit);

    const boards = await boardQuery;

    for (const board of boards) {
      results.push({
        id: board.id,
        type: "board",
        title: board.name,
        description: board.description || undefined,
        boardId: board.id,
        boardSlug: board.slug || undefined,
        organizationId: board.organizationId,
        organizationName: board.organizationName || undefined,
        createdAt: board.createdAt,
        relevanceScore: board.relevanceScore,
      });
    }
  }

  if (type === "all" || type === "organizations") {
    const organizationRelevanceScore = sql<number>`
      CASE
        WHEN LOWER(${organizationTable.name}) LIKE ${searchPattern} THEN 3
        WHEN LOWER(${organizationTable.description}) LIKE ${searchPattern} THEN 2
        ELSE 1
      END
    `;

    const organizationQuery = db
      .select({
        id: organizationTable.id,
        name: organizationTable.name,
        description: organizationTable.description,
        createdAt: organizationTable.createdAt,
        relevanceScore: organizationRelevanceScore.as("relevanceScore"),
      })
      .from(organizationTable)
      .leftJoin(
        organizationMemberTable,
        eq(organizationTable.id, organizationMemberTable.organizationId),
      )
      .where(
        and(
          inArray(organizationTable.id, accessibleOrganizationIds),
          or(
            ilike(organizationTable.name, searchPattern),
            ilike(organizationTable.description, searchPattern),
          ),
        ),
      )
      .orderBy(desc(organizationRelevanceScore), desc(organizationTable.createdAt))
      .limit(limit);

    const organizations = await organizationQuery;

    for (const organization of organizations) {
      results.push({
        id: organization.id,
        type: "organization",
        title: organization.name,
        description: organization.description || undefined,
        organizationId: organization.id,
        organizationName: organization.name,
        createdAt: organization.createdAt,
        relevanceScore: organization.relevanceScore,
      });
    }
  }

  if (type === "all" || type === "comments" || type === "activities") {
    const searchableActivityText = sql<string>`COALESCE(${activityTable.content}, CAST(${activityTable.eventData} AS text), '')`;
    const activityRelevanceScore = sql<number>`
      CASE
        WHEN LOWER(${searchableActivityText}) LIKE ${searchPattern} THEN 2
        WHEN LOWER(${taskTable.title}) LIKE ${searchPattern} THEN 1
        ELSE 1
      END
    `;

    const activityQuery = db
      .select({
        id: activityTable.id,
        type: activityTable.type,
        content: activityTable.content,
        eventData: activityTable.eventData,
        taskId: activityTable.taskId,
        taskTitle: taskTable.title,
        taskNumber: taskTable.number,
        boardId: boardTable.id,
        boardName: boardTable.name,
        boardSlug: boardTable.slug,
        organizationId: boardTable.organizationId,
        organizationName: organizationTable.name,
        userId: activityTable.userId,
        userName: userTable.name,
        createdAt: activityTable.createdAt,
        relevanceScore: activityRelevanceScore.as("relevanceScore"),
      })
      .from(activityTable)
      .leftJoin(taskTable, eq(activityTable.taskId, taskTable.id))
      .leftJoin(boardTable, eq(taskTable.boardId, boardTable.id))
      .leftJoin(organizationTable, eq(boardTable.organizationId, organizationTable.id))
      .leftJoin(userTable, eq(activityTable.userId, userTable.id))
      .where(
        and(
          organizationFilter,
          boardId ? eq(taskTable.boardId, boardId) : undefined,
          or(
            ilike(searchableActivityText, searchPattern),
            ilike(taskTable.title, searchPattern),
          ),
          type === "comments" ? eq(activityTable.type, "comment") : undefined,
        ),
      )
      .orderBy(desc(activityRelevanceScore), desc(activityTable.createdAt))
      .limit(limit);

    const activities = await activityQuery;

    for (const activity of activities) {
      const isComment = activity.type === "comment";
      const activityContent = getActivitySearchContent(
        activity.type,
        activity.content,
        activity.eventData,
      );
      results.push({
        id: activity.id,
        type: isComment ? "comment" : "activity",
        title: isComment
          ? `Comment on ${activity.taskTitle || "task"}`
          : `${activity.type} on ${activity.taskTitle || "task"}`,
        content: activityContent,
        boardId: activity.boardId || undefined,
        boardName: activity.boardName || undefined,
        boardSlug: activity.boardSlug || undefined,
        organizationId: activity.organizationId || undefined,
        organizationName: activity.organizationName || undefined,
        userId: activity.userId || undefined,
        userName: activity.userName || undefined,
        createdAt: activity.createdAt,
        relevanceScore: activity.relevanceScore,
        taskNumber: activity.taskNumber || undefined,
      });
    }
  }

  results.sort((a, b) => {
    if (a.relevanceScore !== b.relevanceScore) {
      return b.relevanceScore - a.relevanceScore;
    }
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const finalResults = results.slice(0, limit);

  return {
    results: finalResults,
    totalCount: results.length,
    searchQuery: query,
  };
}

export default globalSearch;
