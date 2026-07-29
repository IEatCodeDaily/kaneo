import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { taskRepoItemLinkTable } from "../../apps/api/src/database/schema";
import { resetTestDatabase } from "./helpers/database";

/**
 * Covers "Fix Non-repo-board-synced Task-Issue Sync".
 *
 * A task can follow a GitHub issue from ANY board (task_repo_item_link with
 * sync_enabled = true). Inbound sync (GitHub -> Kaneo) is correctly
 * board-agnostic: syncFollowersForIssue() selects purely on repoIssueId.
 *
 * Outbound sync (Kaneo -> GitHub) is not. plugins/registry.ts resolves which
 * plugins to notify with:
 *
 *     getActiveIntegrations(event.boardId)
 *       -> where integration.boardId = <the task's board>
 *
 * So editing a followed task only reaches GitHub when the task happens to live
 * on the same board that holds the board-level GitHub integration. A task that
 * follows an issue from any other board is silently one-way: it accepts inbound
 * changes but never pushes its own.
 *
 * Production data at the time of writing showed exactly this: both
 * sync_enabled = true links lived on boards with zero active integrations.
 *
 * These tests assert on the resolver's behaviour rather than on source text, so
 * they fail for the real defect.
 */

vi.mock("../../apps/api/src/plugins/github/utils/github-app", () => ({
  getGithubApp: () => null,
  getInstallationIdForRepo: async () => 1,
}));

async function seedFollowerOnOtherBoard() {
  const [user] = await db
    .insert(schema.userTable)
    .values({
      name: "Cross Board User",
      email: `cross-${randomUUID()}@example.com`,
      emailVerified: true,
    })
    .returning();

  const [organization] = await db
    .insert(schema.organizationTable)
    .values({
      name: "Cross Board Org",
      slug: `cross-org-${randomUUID()}`,
      createdAt: new Date(),
    })
    .returning();

  // Board A holds the GitHub integration (the "repo board").
  const [repoBoard] = await db
    .insert(schema.boardTable)
    .values({
      organizationId: organization.id,
      name: "Repo Board",
      slug: `repo-board-${randomUUID()}`,
      icon: "Folder",
    })
    .returning();

  // Board B has NO integration — this is where the followed task lives.
  const [otherBoard] = await db
    .insert(schema.boardTable)
    .values({
      organizationId: organization.id,
      name: "Other Board",
      slug: `other-board-${randomUUID()}`,
      icon: "Folder",
    })
    .returning();

  const [otherColumn] = await db
    .insert(schema.columnTable)
    .values({
      boardId: otherBoard.id,
      name: "To Do",
      slug: "to-do",
      position: 0,
    })
    .returning();

  const owner = "kaneo-test";
  const name = `repo-${randomUUID()}`;

  const [integration] = await db
    .insert(schema.integrationTable)
    .values({
      boardId: repoBoard.id,
      type: "github",
      isActive: true,
      config: JSON.stringify({
        repositoryOwner: owner,
        repositoryName: name,
        installationId: 1,
      }),
    })
    .returning();

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
      number: 42,
      title: "Followed issue",
      state: "open",
      url: `https://github.com/${owner}/${name}/issues/42`,
    })
    .returning();

  // The followed task lives on the board WITHOUT the integration.
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      boardId: otherBoard.id,
      columnId: otherColumn.id,
      userId: user.id,
      title: "Follower on another board",
      number: 1,
      position: 0,
    })
    .returning();

  await db.insert(taskRepoItemLinkTable).values({
    taskId: task.id,
    repoIssueId: issue.id,
    syncEnabled: true,
  });

  // An external_link is what the outbound handlers actually look for.
  await db.insert(schema.externalLinkTable).values({
    taskId: task.id,
    integrationId: integration.id,
    resourceType: "issue",
    externalId: "42",
    url: issue.url,
    title: issue.title,
  });

  return { integration, issue, otherBoard, repoBoard, task };
}

describe("outbound sync for tasks following an issue from another board", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("resolves the GitHub integration for a follower task on a board that has none", async () => {
    const { integration, task, otherBoard } = await seedFollowerOnOtherBoard();

    const { resolveIntegrationsForTask } = await import(
      "../../apps/api/src/plugins/registry"
    );

    const resolved = await resolveIntegrationsForTask(task.id, otherBoard.id);

    // The task follows an issue owned by an integration on a DIFFERENT board,
    // so that integration must still be reachable for outbound sync.
    expect(
      resolved.map((row) => row.id),
      "outbound sync could not reach the integration that owns the followed issue",
    ).toContain(integration.id);
  });

  it("still resolves board-level integrations for ordinary tasks", async () => {
    const { integration, repoBoard } = await seedFollowerOnOtherBoard();

    const { resolveIntegrationsForTask } = await import(
      "../../apps/api/src/plugins/registry"
    );

    // A task on the repo board itself, with no follower link at all.
    const [column] = await db
      .insert(schema.columnTable)
      .values({
        boardId: repoBoard.id,
        name: "To Do",
        slug: "to-do",
        position: 0,
      })
      .returning();

    const [user] = await db
      .insert(schema.userTable)
      .values({
        name: "Plain User",
        email: `plain-${randomUUID()}@example.com`,
        emailVerified: true,
      })
      .returning();

    const [plainTask] = await db
      .insert(schema.taskTable)
      .values({
        boardId: repoBoard.id,
        columnId: column.id,
        userId: user.id,
        title: "Plain task on the repo board",
        number: 2,
        position: 1,
      })
      .returning();

    const resolved = await resolveIntegrationsForTask(
      plainTask.id,
      repoBoard.id,
    );

    expect(
      resolved.map((row) => row.id),
      "board-level integration resolution regressed",
    ).toContain(integration.id);
  });

  it("does not resolve unrelated integrations", async () => {
    const { task, otherBoard } = await seedFollowerOnOtherBoard();

    // A second org/board/integration that has nothing to do with this task.
    const [strangerOrg] = await db
      .insert(schema.organizationTable)
      .values({
        name: "Stranger Org",
        slug: `stranger-${randomUUID()}`,
        createdAt: new Date(),
      })
      .returning();

    const [strangerBoard] = await db
      .insert(schema.boardTable)
      .values({
        organizationId: strangerOrg.id,
        name: "Stranger Board",
        slug: `stranger-board-${randomUUID()}`,
        icon: "Folder",
      })
      .returning();

    const [strangerIntegration] = await db
      .insert(schema.integrationTable)
      .values({
        boardId: strangerBoard.id,
        type: "github",
        isActive: true,
        config: JSON.stringify({
          repositoryOwner: "someone-else",
          repositoryName: "unrelated",
          installationId: 99,
        }),
      })
      .returning();

    const { resolveIntegrationsForTask } = await import(
      "../../apps/api/src/plugins/registry"
    );

    const resolved = await resolveIntegrationsForTask(task.id, otherBoard.id);

    expect(
      resolved.map((row) => row.id),
      "outbound sync leaked an unrelated integration",
    ).not.toContain(strangerIntegration.id);
  });
});
