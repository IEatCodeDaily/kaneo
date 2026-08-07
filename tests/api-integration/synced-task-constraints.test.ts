import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { taskRepoItemLinkTable } from "../../apps/api/src/database/schema";
import { resetTestDatabase } from "./helpers/database";

/**
 * Exercises the 0043 synced-task constraints against a real migrated database.
 *
 * The previous version of this file read 0043_task_synced_issue.sql as text and
 * asserted it contained certain substrings. That guard could not fail for the
 * bug it was supposed to catch: the migration was missing from
 * drizzle/meta/_journal.json, so db:migrate skipped it and the constraints
 * existed in no database at all. The SQL file still contained the expected
 * text, so the assertions stayed green while the feature was unenforced.
 *
 * These tests insert conflicting rows and require Postgres to reject them,
 * which is only possible if the migration actually ran.
 */

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";

async function seedRepoWithIssues() {
  const [user] = await db
    .insert(schema.userTable)
    .values({
      name: "Sync Constraint User",
      email: `sync-${randomUUID()}@example.com`,
      emailVerified: true,
    })
    .returning();

  const [organization] = await db
    .insert(schema.organizationTable)
    .values({
      name: "Sync Constraint Org",
      slug: `sync-org-${randomUUID()}`,
      createdAt: new Date(),
    })
    .returning();

  const board = await createBoard(organization.id, "Sync Constraint Board");

  const [repo] = await db
    .insert(schema.repoTable)
    .values({
      organizationId: organization.id,
      provider: "github",
      owner: "kaneo-test",
      name: `repo-${randomUUID()}`,
      url: "https://github.com/kaneo-test/repo",
    })
    .returning();

  const issues = await db
    .insert(schema.repoIssueTable)
    .values([
      {
        repoId: repo.id,
        number: 1,
        title: "First issue",
        state: "open",
        url: "https://github.com/kaneo-test/repo/issues/1",
      },
      {
        repoId: repo.id,
        number: 2,
        title: "Second issue",
        state: "open",
        url: "https://github.com/kaneo-test/repo/issues/2",
      },
    ])
    .returning();

  return { user, organization, board, repo, issues };
}

async function createBoard(organizationId: string, name: string) {
  const [board] = await db
    .insert(schema.boardTable)
    .values({
      organizationId,
      name,
      slug: `board-${randomUUID()}`,
      icon: "Folder",
    })
    .returning();

  const [column] = await db
    .insert(schema.columnTable)
    .values({ boardId: board.id, name: "To Do", slug: "to-do", position: 0 })
    .returning();

  return { ...board, columnId: column.id };
}

let taskNumber = 0;

async function createTask(
  board: { id: string; columnId: string },
  userId: string,
  title: string,
) {
  taskNumber += 1;
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      boardId: board.id,
      columnId: board.columnId,
      userId,
      title,
      number: taskNumber,
      position: 0,
    })
    .returning();
  return task;
}

describe("synced task database constraints", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    taskNumber = 0;
  });

  it("lets many tasks across boards follow one issue", async () => {
    const { organization, board, user, issues } = await seedRepoWithIssues();
    const secondBoard = await createBoard(organization.id, "Second Board");

    const taskA = await createTask(board, user.id, "Follower A");
    const taskB = await createTask(secondBoard, user.id, "Follower B");

    const rows = await db
      .insert(taskRepoItemLinkTable)
      .values([
        { taskId: taskA.id, repoIssueId: issues[0].id, syncEnabled: true },
        { taskId: taskB.id, repoIssueId: issues[0].id, syncEnabled: true },
      ])
      .returning();

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.syncEnabled)).toBe(true);
    expect(new Set(rows.map((row) => row.repoIssueId))).toEqual(
      new Set([issues[0].id]),
    );
  });

  it("rejects a second synced issue for the same task", async () => {
    const { board, user, issues } = await seedRepoWithIssues();
    const task = await createTask(board, user.id, "One source");

    await db.insert(taskRepoItemLinkTable).values({
      taskId: task.id,
      repoIssueId: issues[0].id,
      syncEnabled: true,
    });

    await expect(
      db.insert(taskRepoItemLinkTable).values({
        taskId: task.id,
        repoIssueId: issues[1].id,
        syncEnabled: true,
      }),
    ).rejects.toMatchObject({ cause: { code: UNIQUE_VIOLATION } });
  });

  it("still allows extra issue references that do not sync", async () => {
    const { board, user, issues } = await seedRepoWithIssues();
    const task = await createTask(board, user.id, "Mixed links");

    await db.insert(taskRepoItemLinkTable).values({
      taskId: task.id,
      repoIssueId: issues[0].id,
      syncEnabled: true,
    });

    const [reference] = await db
      .insert(taskRepoItemLinkTable)
      .values({
        taskId: task.id,
        repoIssueId: issues[1].id,
        syncEnabled: false,
      })
      .returning();

    expect(reference.syncEnabled).toBe(false);

    const links = await db
      .select()
      .from(taskRepoItemLinkTable)
      .where(eq(taskRepoItemLinkTable.taskId, task.id));

    expect(links).toHaveLength(2);
    expect(links.filter((link) => link.syncEnabled)).toHaveLength(1);
  });

  it("refuses to sync a link with no issue, so pull requests cannot sync", async () => {
    const { board, user, repo } = await seedRepoWithIssues();
    const task = await createTask(board, user.id, "PR link");

    const [pullRequest] = await db
      .insert(schema.repoPullRequestTable)
      .values({
        repoId: repo.id,
        number: 42,
        title: "A pull request",
        state: "open",
        url: "https://github.com/kaneo-test/repo/pull/42",
      })
      .returning();

    await expect(
      db.insert(taskRepoItemLinkTable).values({
        taskId: task.id,
        repoPullRequestId: pullRequest.id,
        repoIssueId: null,
        syncEnabled: true,
      }),
    ).rejects.toMatchObject({ cause: { code: CHECK_VIOLATION } });
  });

  it("keeps a broken follower and its reason instead of deleting it", async () => {
    const { board, user, issues } = await seedRepoWithIssues();
    const task = await createTask(board, user.id, "Broken sync");

    const [link] = await db
      .insert(taskRepoItemLinkTable)
      .values({
        taskId: task.id,
        repoIssueId: issues[0].id,
        syncEnabled: true,
      })
      .returning();

    const [broken] = await db
      .update(taskRepoItemLinkTable)
      .set({ syncBrokenAt: new Date(), syncBrokenReason: "issue deleted" })
      .where(eq(taskRepoItemLinkTable.id, link.id))
      .returning();

    expect(broken.syncEnabled).toBe(true);
    expect(broken.syncBrokenReason).toBe("issue deleted");
    expect(broken.syncBrokenAt).toBeInstanceOf(Date);
  });
});
