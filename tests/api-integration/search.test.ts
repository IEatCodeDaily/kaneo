import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import globalSearch from "../../apps/api/src/search/controllers/global-search";
import { resetTestDatabase } from "./helpers/database";
import {
  createBoardFixture,
  createOrganizationMember,
} from "./helpers/fixtures";

async function fixture() {
  const member = await createOrganizationMember({ userName: "Ayu Saraswati" });
  const { board } = await createBoardFixture({
    organizationId: member.organization.id,
    slug: "KFL",
  });
  const tasks = await db
    .insert(schema.taskTable)
    .values([
      {
        createdAt: new Date("2026-01-01"),
        boardId: board.id,
        number: 123,
        title: "Replace gasket",
        description: "pressure control",
        status: "to-do",
        priority: "high",
        userId: member.user.id,
      },
      {
        boardId: board.id,
        number: 124,
        title: "Pressure control",
        status: "done",
        priority: "low",
      },
      {
        createdAt: new Date("2026-01-03"),
        boardId: board.id,
        number: 125,
        title: "Investigate",
        description: "control pressure",
        status: "canceled",
      },
      {
        boardId: board.id,
        number: 126,
        title: "Pressure sensor",
        description: "calibration",
        status: "in-progress",
      },
    ])
    .returning();
  await db.insert(schema.activityTable).values({
    taskId: tasks[3].id,
    type: "comment",
    content: "control pressure measured",
    userId: member.user.id,
  });
  await db.insert(schema.labelTable).values({
    taskId: tasks[0].id,
    name: "bug",
    color: "red",
    organizationId: member.organization.id,
  });
  const search = (query: string) =>
    globalSearch({
      query,
      userId: member.user.id,
      organizationId: member.organization.id,
    });
  return { ...member, board, tasks, search };
}

describe("ranked global search on Postgres", () => {
  beforeEach(resetTestDatabase);
  it("ranks exact keys first and title before description before comments", async () => {
    const { search, tasks } = await fixture();
    for (const key of ["KFL-123", "123", "#123"]) {
      expect((await search(key)).results[0].id).toBe(tasks[0].id);
    }
    const hits = (await search("pressure control type:ticket")).results;
    expect(hits.map((hit) => hit.id)).toEqual([
      tasks[1].id,
      tasks[2].id,
      tasks[0].id,
      tasks[3].id,
    ]);
    expect(hits[3].content).toContain("measured");
  });
  it("matches words in either order across title, description and comments", async () => {
    const { search, tasks } = await fixture();
    for (const query of ["sensor control", "control sensor"]) {
      expect(
        (await search(`${query} type:ticket`)).results.map((hit) => hit.id),
      ).toEqual([tasks[3].id]);
    }
    expect(
      (await search("calibration pressure type:ticket")).results[0].id,
    ).toBe(tasks[3].id);
  });
  it("uses trigram typo matching when installed, otherwise the FTS-only predicate is safe", async () => {
    const { search, tasks } = await fixture();
    const extension = await db.execute(
      sql`select 1 from pg_extension where extname = 'pg_trgm'`,
    );
    const results = (await search("presure type:ticket")).results;
    if (extension.rows.length)
      expect(results.map((hit) => hit.id)).toContain(tasks[1].id);
    else expect(results).toEqual([]);
  });
  it("applies every task filter including custom column names and filters without text", async () => {
    const { search, tasks } = await fixture();
    for (const query of [
      "is:open priority:high",
      "status:to-do",
      'status:"To do"',
      "assignee:me",
      'assignee:"Ayu Saraswati"',
      "board:KFL label:bug",
      "priority:high",
    ]) {
      expect(
        (await search(`${query} type:ticket`)).results.map((hit) => hit.id),
        query,
      ).toEqual([tasks[0].id]);
    }
    expect(
      (await search("is:done type:ticket")).results.map((hit) => hit.id),
    ).toEqual([tasks[1].id]);
    expect(
      new Set(
        (await search("is:closed type:ticket")).results.map((hit) => hit.id),
      ),
    ).toEqual(new Set([tasks[1].id, tasks[2].id]));
    expect((await search("board:no-such-board type:ticket")).results).toEqual(
      [],
    );
  });
  it("scopes entity types and repository states", async () => {
    const { search, organization } = await fixture();
    const [repo] = await db
      .insert(schema.repoTable)
      .values({
        organizationId: organization.id,
        provider: "github",
        owner: "acme",
        name: "pressure",
        slug: "pressure",
        url: "https://github.com/acme/pressure",
      })
      .returning();
    await db.insert(schema.repoIssueTable).values({
      repoId: repo.id,
      number: 1,
      title: "Pressure problem",
      state: "open",
      url: "https://github.com/acme/pressure/issues/1",
    });
    await db.insert(schema.repoPullRequestTable).values({
      repoId: repo.id,
      number: 2,
      title: "Pressure fix",
      state: "closed",
      url: "https://github.com/acme/pressure/pull/2",
    });
    for (const [kind, resultType] of [
      ["ticket", "task"],
      ["board", "board"],
      ["repo", "repository"],
      ["issue", "issue"],
      ["pr", "pull_request"],
      ["comment", "comment"],
    ]) {
      const results = (await search(`type:${kind}`)).results;
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((hit) => hit.type === resultType)).toBe(true);
    }
    expect((await search("is:open type:issue")).results).toHaveLength(1);
    expect((await search("is:closed type:pr")).results).toHaveLength(1);
    expect((await search("is:closed type:issue")).results).toHaveLength(0);
  });
  it("never returns hidden-board tickets/comments, foreign organizations or deleted tickets", async () => {
    const { search, organization, user, tasks } = await fixture();
    const { board: hidden } = await createBoardFixture({
      organizationId: organization.id,
      slug: "SECRET",
    });
    await db
      .update(schema.boardTable)
      .set({ orgPrivilege: "none" })
      .where(eq(schema.boardTable.id, hidden.id));
    const [secret] = await db
      .insert(schema.taskTable)
      .values({ boardId: hidden.id, title: "Pressure secret", number: 999 })
      .returning();
    await db.insert(schema.activityTable).values({
      taskId: secret.id,
      type: "comment",
      content: "pressure secret",
      userId: user.id,
    });
    await db
      .update(schema.taskTable)
      .set({ deletedAt: new Date() })
      .where(eq(schema.taskTable.id, tasks[0].id));
    await db.insert(schema.activityTable).values({
      taskId: tasks[0].id,
      type: "comment",
      content: "pressure deleted",
      userId: user.id,
    });
    for (const query of [
      "pressure",
      "SECRET-999",
      "#999",
      "board:SECRET",
      "type:comment pressure",
    ]) {
      const hits = (await search(query)).results;
      expect(
        hits.some(
          (hit) =>
            hit.boardId === hidden.id ||
            hit.id === tasks[0].id ||
            hit.content?.includes("deleted"),
        ),
      ).toBe(false);
    }
    const other = await createOrganizationMember();
    expect(
      (
        await globalSearch({
          query: "type:ticket",
          userId: user.id,
          organizationId: other.organization.id,
        })
      ).results,
    ).toEqual([]);
  });
});
