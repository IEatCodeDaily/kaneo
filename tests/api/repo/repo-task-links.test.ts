import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #174: tasks synced to a GitHub issue by the board↔GitHub integration were
 * invisible in the issue view.
 *
 * Two independent mechanisms attach a task to an issue:
 *   1. `task_repo_item_link` — "Create synced issue in repo" and manual linking;
 *   2. `external_link` — the board↔GitHub integration, which writes NO
 *      `task_repo_item_link` row.
 *
 * The controller read only (1), so 9 of 10 integration-synced tasks showed an
 * empty task list on the issue while the task itself displayed the issue as
 * synced.
 */

type Row = Record<string, unknown>;

const state = {
  repoItemRows: [] as Row[],
  externalRows: [] as Row[],
  issueUrl: null as string | null,
  /** Which tables the code selected from, in order. */
  selectedFrom: [] as string[],
};

/**
 * Minimal Drizzle chain stub. `select().from(x)` decides which fixture set is
 * returned, and the chain is awaitable at the end like the real builder.
 */
function makeChain(rows: Row[]) {
  const chain: Record<string, unknown> = {};
  for (const method of ["innerJoin", "leftJoin", "where"]) {
    chain[method] = () => chain;
  }
  // Awaiting the builder resolves to the rows.
  chain.then = (resolve: (value: Row[]) => unknown) => resolve(rows);
  return chain;
}

vi.mock("../../../apps/api/src/database", () => ({
  default: {
    select: () => ({
      from: (table: { _?: { name?: string } } | unknown) => {
        const name =
          (table as { _?: { name?: string } })?._?.name ?? String(table);
        state.selectedFrom.push(name);
        return makeChain(
          name.includes("external_link")
            ? state.externalRows
            : state.repoItemRows,
        );
      },
    }),
    query: {
      repoIssueTable: {
        findFirst: async () =>
          state.issueUrl ? { url: state.issueUrl } : undefined,
      },
    },
  },
}));

vi.mock("../../../apps/api/src/database/schema", () => {
  const table = (name: string) =>
    new Proxy(
      { _: { name } },
      {
        get: (target, prop) =>
          prop === "_" ? target._ : { table: name, column: String(prop) },
      },
    );
  return {
    boardTable: table("board"),
    externalLinkTable: table("external_link"),
    repoIssueTable: table("repo_issue"),
    repoPullRequestTable: table("repo_pull_request"),
    taskRepoItemLinkTable: table("task_repo_item_link"),
    taskTable: table("task"),
  };
});

const { getRepoItemTaskLinks } = await import(
  "../../../apps/api/src/repo/controllers/repo-task-links"
);

function repoItemLink(taskNumber: number, taskId = `task-${taskNumber}`): Row {
  return {
    id: `ril-${taskNumber}`,
    taskId,
    createdAt: new Date("2026-01-01"),
    syncEnabled: false,
    syncBrokenAt: null,
    syncBrokenReason: null,
    task: {
      id: taskId,
      title: `Task ${taskNumber}`,
      status: "to-do",
      priority: "low",
      number: taskNumber,
      boardId: "board-1",
    },
  };
}

function externalLink(taskNumber: number, taskId = `task-${taskNumber}`): Row {
  return {
    id: `el-${taskNumber}`,
    taskId,
    createdAt: new Date("2026-01-02"),
    task: {
      id: taskId,
      title: `Task ${taskNumber}`,
      status: "to-do",
      priority: "low",
      number: taskNumber,
      boardId: "board-1",
    },
  };
}

beforeEach(() => {
  state.repoItemRows = [];
  state.externalRows = [];
  state.issueUrl = "https://github.com/acme/widgets/issues/4";
  state.selectedFrom = [];
});

describe("#174 issue task links include integration-synced tasks", () => {
  it("returns tasks that only have an external_link", async () => {
    state.externalRows = [externalLink(3)];

    const links = await getRepoItemTaskLinks("repo-1", 4, "issue", "org-1");

    // The regression: this returned [].
    expect(links.map((l) => l.task.number)).toEqual([3]);
    // The integration link IS the sync.
    expect(links[0].syncEnabled).toBe(true);
  });

  it("returns tasks from both mechanisms", async () => {
    state.repoItemRows = [repoItemLink(18)];
    state.externalRows = [externalLink(3)];

    const links = await getRepoItemTaskLinks("repo-1", 4, "issue", "org-1");

    expect(
      links.map((l) => l.task.number).sort((a, b) => Number(a) - Number(b)),
    ).toEqual([3, 18]);
  });

  it("lists a task linked both ways only once, keeping the repo-item flags", async () => {
    state.repoItemRows = [repoItemLink(2, "task-2")];
    state.externalRows = [externalLink(2, "task-2")];

    const links = await getRepoItemTaskLinks("repo-1", 4, "issue", "org-1");

    expect(links).toHaveLength(1);
    expect(links[0].id).toBe("ril-2");
    // repo-item link wins: it carries the real (false) sync flag.
    expect(links[0].syncEnabled).toBe(false);
  });

  // NEGATIVE CONTROL: without this, the assertions above would pass for an
  // implementation that always appends a task.
  it("returns nothing when neither mechanism has a row", async () => {
    const links = await getRepoItemTaskLinks("repo-1", 4, "issue", "org-1");
    expect(links).toEqual([]);
  });

  it("never queries external_link for pull requests", async () => {
    state.repoItemRows = [repoItemLink(7)];

    const links = await getRepoItemTaskLinks(
      "repo-1",
      4,
      "pullRequest",
      "org-1",
    );

    expect(links.map((l) => l.task.number)).toEqual([7]);
    expect(state.selectedFrom).not.toContain("external_link");
  });

  it("skips the integration lookup when the issue has no mirrored URL", async () => {
    state.issueUrl = null;
    state.externalRows = [externalLink(3)];

    const links = await getRepoItemTaskLinks("repo-1", 4, "issue", "org-1");

    expect(links).toEqual([]);
  });
});
