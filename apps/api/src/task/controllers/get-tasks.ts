import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  type SQL,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  boardTable,
  columnTable,
  externalLinkTable,
  labelTable,
  taskRelationTable,
  taskTable,
  teamTable,
  userTable,
} from "../../database/schema";

/** Self-join alias: the parent side of a subtask relation. */
const parentTask = alias(taskTable, "parent_task");

type GetTasksOptions = {
  assigneeId?: string;
  dueAfter?: string;
  dueBefore?: string;
  limit?: number;
  page?: number;
  priority?: string;
  sortBy?:
    | "createdAt"
    | "priority"
    | "dueDate"
    | "position"
    | "title"
    | "number";
  sortOrder?: "asc" | "desc";
  status?: string;
};

const priorityCaseExpr = sql<number>`CASE
  WHEN ${taskTable.priority} = 'urgent' THEN 4
  WHEN ${taskTable.priority} = 'high' THEN 3
  WHEN ${taskTable.priority} = 'medium' THEN 2
  WHEN ${taskTable.priority} = 'low' THEN 1
  ELSE 0
END`;

function buildOrderBy(
  sortBy: GetTasksOptions["sortBy"],
  sortOrder: GetTasksOptions["sortOrder"],
): SQL {
  const direction = sortOrder === "desc" ? desc : asc;

  switch (sortBy) {
    case "createdAt":
      return direction(taskTable.createdAt);
    case "priority":
      return direction(priorityCaseExpr);
    case "dueDate":
      return direction(taskTable.dueDate);
    case "title":
      return direction(taskTable.title);
    case "number":
      return direction(taskTable.number);
    default:
      return direction(taskTable.position);
  }
}

async function getTasks(boardId: string, options: GetTasksOptions = {}) {
  const board = await db.query.boardTable.findFirst({
    where: eq(boardTable.id, boardId),
  });

  if (!board) {
    throw new HTTPException(404, {
      message: "Board not found",
    });
  }

  const conditions = [
    eq(taskTable.boardId, boardId),
    isNull(taskTable.deletedAt),
  ];

  if (options.status) {
    conditions.push(eq(taskTable.status, options.status));
  }

  if (options.priority) {
    conditions.push(eq(taskTable.priority, options.priority));
  }

  if (options.assigneeId) {
    conditions.push(eq(taskTable.userId, options.assigneeId));
  }

  if (options.dueBefore) {
    conditions.push(lte(taskTable.dueDate, new Date(options.dueBefore)));
  }

  if (options.dueAfter) {
    conditions.push(gte(taskTable.dueDate, new Date(options.dueAfter)));
  }

  const whereClause = and(...conditions);
  const usePagination = options.page != null || options.limit != null;
  const page = options.page && options.page > 0 ? options.page : 1;
  const pageSize =
    options.limit && options.limit > 0 ? Math.min(options.limit, 100) : 50;
  const offset = (page - 1) * pageSize;

  const orderByClause = buildOrderBy(
    options.sortBy ?? "position",
    options.sortOrder ?? "asc",
  );

  const [taskCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(taskTable)
    .where(whereClause);

  const total = Number(taskCount?.count ?? 0);

  const taskSelection = {
    id: taskTable.id,
    title: taskTable.title,
    number: taskTable.number,
    description: taskTable.description,
    status: taskTable.status,
    priority: taskTable.priority,
    startDate: taskTable.startDate,
    dueDate: taskTable.dueDate,
    position: taskTable.position,
    createdAt: taskTable.createdAt,
    userId: taskTable.userId,
    teamId: taskTable.teamId,
    assigneeName: userTable.name,
    assigneeId: userTable.id,
    assigneeImage: userTable.image,
    teamAssigneeName: teamTable.name,
    boardId: taskTable.boardId,
  };

  const query = db
    .select(taskSelection)
    .from(taskTable)
    .leftJoin(userTable, eq(taskTable.userId, userTable.id))
    .leftJoin(teamTable, eq(taskTable.teamId, teamTable.id))
    .leftJoin(boardTable, eq(taskTable.boardId, boardTable.id))
    .where(whereClause)
    .orderBy(orderByClause);

  const paginatedTasks = usePagination
    ? await query.limit(pageSize).offset(offset)
    : await query;

  const taskIds = paginatedTasks.map((task) => task.id);

  const labelsData =
    taskIds.length > 0
      ? await db
          .select({
            id: labelTable.id,
            name: labelTable.name,
            color: labelTable.color,
            taskId: labelTable.taskId,
          })
          .from(labelTable)
          .where(inArray(labelTable.taskId, taskIds))
      : [];

  const externalLinksData =
    taskIds.length > 0
      ? await db
          .select()
          .from(externalLinkTable)
          .where(inArray(externalLinkTable.taskId, taskIds))
      : [];

  const taskLabelsMap = new Map<
    string,
    Array<{ id: string; name: string; color: string }>
  >();
  for (const label of labelsData) {
    if (label.taskId) {
      if (!taskLabelsMap.has(label.taskId)) {
        taskLabelsMap.set(label.taskId, []);
      }
      taskLabelsMap.get(label.taskId)?.push({
        id: label.id,
        name: label.name,
        color: label.color,
      });
    }
  }

  const taskExternalLinksMap = new Map<
    string,
    Array<{
      id: string;
      taskId: string;
      integrationId: string;
      resourceType: string;
      externalId: string;
      url: string;
      title: string | null;
      metadata: Record<string, unknown> | null;
    }>
  >();
  for (const externalLink of externalLinksData) {
    if (!taskExternalLinksMap.has(externalLink.taskId)) {
      taskExternalLinksMap.set(externalLink.taskId, []);
    }
    taskExternalLinksMap.get(externalLink.taskId)?.push({
      ...externalLink,
      metadata: externalLink.metadata
        ? JSON.parse(externalLink.metadata)
        : null,
    });
  }

  const boardColumns = await db
    .select()
    .from(columnTable)
    .where(eq(columnTable.boardId, boardId))
    .orderBy(asc(columnTable.position));

  // A "subtask" relation points parent -> child, so a task's parent is the
  // SOURCE of a relation that targets it. Board and list views need this to
  // group children under their parent without a request per card.
  const parentRelations =
    taskIds.length > 0
      ? await db
          .select({
            childId: taskRelationTable.targetTaskId,
            parentId: parentTask.id,
            parentNumber: parentTask.number,
            parentTitle: parentTask.title,
            parentStatus: parentTask.status,
          })
          .from(taskRelationTable)
          .innerJoin(
            parentTask,
            eq(taskRelationTable.sourceTaskId, parentTask.id),
          )
          .where(
            and(
              eq(taskRelationTable.relationType, "subtask"),
              inArray(taskRelationTable.targetTaskId, taskIds),
            ),
          )
      : [];

  const parentByChildId = new Map(
    parentRelations.map((relation) => [
      relation.childId,
      {
        id: relation.parentId,
        number: relation.parentNumber,
        title: relation.parentTitle,
        status: relation.parentStatus,
      },
    ]),
  );

  const withRelations = (task: (typeof paginatedTasks)[number]) => ({
    ...task,
    labels: taskLabelsMap.get(task.id) || [],
    externalLinks: taskExternalLinksMap.get(task.id) || [],
    parentTask: parentByChildId.get(task.id) ?? null,
  });

  const columns = boardColumns.map((column) => ({
    id: column.slug,
    slug: column.slug,
    name: column.name,
    icon: column.icon,
    isFinal: column.isFinal,
    tasks: paginatedTasks
      .filter((task) => task.status === column.slug)
      .map(withRelations),
  }));

  const archivedTasks = paginatedTasks
    .filter((task) => task.status === "archived")
    .map(withRelations);

  const plannedTasks = paginatedTasks
    .filter((task) => task.status === "planned")
    .map(withRelations);

  return {
    data: {
      id: board.id,
      name: board.name,
      slug: board.slug,
      icon: board.icon,
      description: board.description,
      isPublic: board.isPublic,
      organizationId: board.organizationId,
      columns,
      archivedTasks,
      plannedTasks,
    },
    pagination: usePagination
      ? {
          total,
          page,
          pageSize,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        }
      : {
          total,
          page: 1,
          pageSize: total,
          totalPages: 1,
        },
  };
}

export default getTasks;
