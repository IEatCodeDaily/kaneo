import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { taskRepoItemLinkTable } from "../../apps/api/src/database/schema";
import { linkTaskToRepoIssue } from "../../apps/api/src/plugins/github/services/link-manager";
import { resetTestDatabase } from "./helpers/database";

/**
 * Covers the board-sync regression: creating a GitHub issue from a task wrote
 * only an external_link row and never a task_repo_item_link, so the task's
 * Resources panel showed nothing and every consumer that reads
 * task_repo_item_link was blind to the relationship.
 *
 * The first version of this guard read link-manager.ts as text and asserted it
 * contained "linkTaskToRepoIssue({". That could not fail for the actual bug —
 * the call site could be commented out, the insert could silently conflict, or
 * the issue lookup could return nothing, and the grep would still pass. These
 * tests call the helper and read the resulting rows back out of Postgres.
 */

async function seed() {
  const [user] = await db
    .insert(schema.userTable)
    .values({
      name: "Link Manager User",
      email: `link-${randomUUID()}@example.com`,
      emailVerified: true,
    })
    .returning();

  const [organization] = await db
    .insert(schema.organizationTable)
    .values({
      name: "Link Manager Org",
      slug: `link-org-${randomUUID()}`,
      createdAt: new Date(),
    })
    .returning();

  const [board] = await db
    .insert(schema.boardTable)
    .values({
      organizationId: organization.id,
      name: "Link Manager Board",
      slug: `link-board-${randomUUID()}`,
      icon: "Folder",
    })
    .returning();

  const [column] = await db
    .insert(schema.columnTable)
    .values({ boardId: board.id, name: "To Do", slug: "to-do", position: 0 })
    .returning();

  const owner = "kaneo-test";
  const name = `repo-${randomUUID()}`;

  const [repo] = await db
    .insert(schema.repoTable)
    .values({
      organizationId: organization.id,
      provider: "github",
      owner,
      name,
      url: `https://github.com/${owner}/${name}`,
    })
    .returning();

  const [issue] = await db
    .insert(schema.repoIssueTable)
    .values({
      repoId: repo.id,
      number: 7,
      title: "Mirrored issue",
      state: "open",
      url: `https://github.com/${owner}/${name}/issues/7`,
    })
    .returning();

  const [task] = await db
    .insert(schema.taskTable)
    .values({
      boardId: board.id,
      columnId: column.id,
      userId: user.id,
      title: "Task that created an issue",
      number: 1,
      position: 0,
    })
    .returning();

  return { owner, name, repo, issue, task };
}

const linksForTask = (taskId: string) =>
  db
    .select()
    .from(taskRepoItemLinkTable)
    .where(eq(taskRepoItemLinkTable.taskId, taskId));

describe("board sync writes structured repo issue links", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("records a task_repo_item_link row pointing at the mirrored issue", async () => {
    const { owner, name, issue, task } = await seed();

    const link = await linkTaskToRepoIssue({
      taskId: task.id,
      owner,
      repo: name,
      issueNumber: 7,
    });

    expect(link).not.toBeNull();

    const rows = await linksForTask(task.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].repoIssueId).toBe(issue.id);
    // Board sync produces an ordinary reference, not a follower: syncing is an
    // explicit user action, so a mirrored issue must not silently start
    // overwriting task content.
    expect(rows[0].syncEnabled).toBe(false);
  });

  it("is idempotent, so a repeated sync does not duplicate the link", async () => {
    const { owner, name, task } = await seed();

    const first = await linkTaskToRepoIssue({
      taskId: task.id,
      owner,
      repo: name,
      issueNumber: 7,
    });
    const second = await linkTaskToRepoIssue({
      taskId: task.id,
      owner,
      repo: name,
      issueNumber: 7,
    });

    expect(first).not.toBeNull();
    // onConflictDoNothing returns no row for the duplicate attempt.
    expect(second).toBeNull();

    const rows = await linksForTask(task.id);
    expect(rows).toHaveLength(1);
  });

  it("does nothing when no mirrored issue matches the repository", async () => {
    const { owner, name, task } = await seed();

    const missingNumber = await linkTaskToRepoIssue({
      taskId: task.id,
      owner,
      repo: name,
      issueNumber: 999,
    });
    const missingRepo = await linkTaskToRepoIssue({
      taskId: task.id,
      owner,
      repo: "not-a-mirrored-repo",
      issueNumber: 7,
    });

    expect(missingNumber).toBeNull();
    expect(missingRepo).toBeNull();
    await expect(linksForTask(task.id)).resolves.toHaveLength(0);
  });

  it("does not confuse identically numbered issues in different repositories", async () => {
    const { owner, name, issue, task } = await seed();
    const other = await seed();

    const link = await linkTaskToRepoIssue({
      taskId: task.id,
      owner,
      repo: name,
      issueNumber: 7,
    });

    expect(link?.repoIssueId).toBe(issue.id);
    expect(link?.repoIssueId).not.toBe(other.issue.id);
  });
});
