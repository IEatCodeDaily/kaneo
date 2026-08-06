import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  boardTable,
  repoIssueTable,
  repoPullRequestTable,
  taskRepoItemLinkTable,
  taskTable,
} from "../../database/schema";

type RepoItemType = "issue" | "pullRequest";

type TaskLink = {
  id: string;
  taskId: string;
  createdAt: Date;
  task: {
    id: string;
    title: string;
    status: string;
    priority: string | null;
    number: number | null;
    boardId: string;
  };
};

function itemColumn(itemType: RepoItemType) {
  return itemType === "issue"
    ? taskRepoItemLinkTable.repoIssueId
    : taskRepoItemLinkTable.repoPullRequestId;
}

function itemTable(itemType: RepoItemType) {
  return itemType === "issue" ? repoIssueTable : repoPullRequestTable;
}

export async function getRepoItemTaskLinks(
  repoId: string,
  number: number,
  itemType: RepoItemType,
  organizationId: string,
): Promise<TaskLink[]> {
  const item = itemTable(itemType);
  const itemId = itemColumn(itemType);

  return db
    .select({
      id: taskRepoItemLinkTable.id,
      taskId: taskTable.id,
      createdAt: taskRepoItemLinkTable.createdAt,
      task: {
        id: taskTable.id,
        title: taskTable.title,
        status: taskTable.status,
        priority: taskTable.priority,
        number: taskTable.number,
        boardId: taskTable.boardId,
      },
    })
    .from(taskRepoItemLinkTable)
    .innerJoin(taskTable, eq(taskRepoItemLinkTable.taskId, taskTable.id))
    .innerJoin(boardTable, eq(taskTable.boardId, boardTable.id))
    .innerJoin(item, eq(itemId, item.id))
    .where(
      and(
        eq(item.repoId, repoId),
        eq(item.number, number),
        eq(boardTable.organizationId, organizationId),
      ),
    );
}

export async function addRepoItemTaskLink({
  repoId,
  number,
  itemType,
  taskId,
  organizationId,
}: {
  repoId: string;
  number: number;
  itemType: RepoItemType;
  taskId: string;
  organizationId: string;
}) {
  const item = itemTable(itemType);
  const itemId = itemColumn(itemType);
  const [repoItem] = await db
    .select({ id: item.id })
    .from(item)
    .where(and(eq(item.repoId, repoId), eq(item.number, number)))
    .limit(1);
  if (!repoItem) {
    throw new HTTPException(404, { message: `${itemType === "issue" ? "Issue" : "Pull request"} not found` });
  }

  const [task] = await db
    .select({ id: taskTable.id })
    .from(taskTable)
    .innerJoin(boardTable, eq(taskTable.boardId, boardTable.id))
    .where(and(eq(taskTable.id, taskId), eq(boardTable.organizationId, organizationId)))
    .limit(1);
  if (!task) throw new HTTPException(404, { message: "Task not found" });

  const values =
    itemType === "issue"
      ? { taskId, repoIssueId: repoItem.id }
      : { taskId, repoPullRequestId: repoItem.id };
  const [link] = await db.insert(taskRepoItemLinkTable).values(values).onConflictDoNothing().returning();
  if (link) return link;

  const [existing] = await db
    .select()
    .from(taskRepoItemLinkTable)
    .where(and(eq(taskRepoItemLinkTable.taskId, taskId), eq(itemId, repoItem.id)))
    .limit(1);
  return existing;
}

export async function removeRepoItemTaskLink({
  repoId,
  number,
  itemType,
  taskId,
  organizationId,
}: {
  repoId: string;
  number: number;
  itemType: RepoItemType;
  taskId: string;
  organizationId: string;
}) {
  const item = itemTable(itemType);
  const itemId = itemColumn(itemType);
  const [link] = await db
    .select({ id: taskRepoItemLinkTable.id })
    .from(taskRepoItemLinkTable)
    .innerJoin(taskTable, eq(taskRepoItemLinkTable.taskId, taskTable.id))
    .innerJoin(boardTable, eq(taskTable.boardId, boardTable.id))
    .innerJoin(item, eq(itemId, item.id))
    .where(
      and(
        eq(item.repoId, repoId),
        eq(item.number, number),
        eq(taskTable.id, taskId),
        eq(boardTable.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!link) throw new HTTPException(404, { message: "Task link not found" });

  await db.delete(taskRepoItemLinkTable).where(eq(taskRepoItemLinkTable.id, link.id));
  return link;
}

export type { RepoItemType };
