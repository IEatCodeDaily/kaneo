import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import claimTaskNumbers, {
  claimTaskNumber,
} from "../../apps/api/src/task/controllers/claim-task-numbers";
import createTask from "../../apps/api/src/task/controllers/create-task";
import { resetTestDatabase } from "./helpers/database";

/**
 * #127 "Can't Create Ticket: Internal Server Error".
 *
 * `board.last_task_number` is a counter, but `task.number` is also protected by
 * the `(board_id, number)` unique constraint. If any path writes a task number
 * without advancing the counter, the counter falls behind the real maximum and
 * the next create claims a number that already exists — the insert dies on the
 * unique constraint and the board 500s on EVERY subsequent create, because each
 * retry claims the same colliding number.
 *
 * Reproduced on the live database: Kaneo Test had last_task_number = 12 while a
 * task already held number 13.
 *
 * These drive the real controller against a real migrated database, so the
 * failure mode is the actual HTTP-visible one rather than a mocked stand-in.
 */

async function seedBoard() {
  const [user] = await db
    .insert(schema.userTable)
    .values({
      name: "Task Number User",
      email: `tasknum-${randomUUID()}@example.com`,
      emailVerified: true,
    })
    .returning();

  const [organization] = await db
    .insert(schema.organizationTable)
    .values({
      name: "Task Number Org",
      slug: `tasknum-org-${randomUUID()}`,
      createdAt: new Date(),
    })
    .returning();

  const [board] = await db
    .insert(schema.boardTable)
    .values({
      organizationId: organization.id,
      name: "Task Number Board",
      slug: `board-${randomUUID()}`,
      icon: "Folder",
    })
    .returning();

  await db
    .insert(schema.columnTable)
    .values({ boardId: board.id, name: "To Do", slug: "to-do", position: 0 });

  return { user, organization, board };
}

const lastTaskNumber = async (boardId: string) => {
  const row = await db.query.boardTable.findFirst({
    where: eq(schema.boardTable.id, boardId),
  });
  return row?.lastTaskNumber;
};

describe("#127 task number claiming survives a drifted counter", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("creates a task normally when the counter is in sync", async () => {
    const { board, user } = await seedBoard();

    const task = await createTask({
      boardId: board.id,
      currentUserId: user.id,
      title: "First task",
      description: "",
      status: "to-do",
    });

    expect(task.number).toBe(1);
    expect(await lastTaskNumber(board.id)).toBe(1);
  });

  /**
   * The actual bug. Without the GREATEST() repair this throws a 23505
   * unique_violation, which the API surfaces as a 500.
   */
  it("still creates a task when the counter has fallen behind", async () => {
    const { board, user } = await seedBoard();

    // Simulate the corrupted state seen in production: a task exists with a
    // number above the board counter.
    await db.insert(schema.taskTable).values({
      boardId: board.id,
      title: "Pre-existing high-numbered task",
      status: "to-do",
      description: "",
      priority: "low",
      number: 13,
      position: 1,
    });
    await db
      .update(schema.boardTable)
      .set({ lastTaskNumber: 12 })
      .where(eq(schema.boardTable.id, board.id));

    const task = await createTask({
      boardId: board.id,
      currentUserId: user.id,
      title: "Task after drift",
      description: "",
      status: "to-do",
    });

    // Must skip past the existing 13 rather than colliding with it.
    expect(task.number).toBe(14);
    expect(await lastTaskNumber(board.id)).toBe(14);
  });

  it("keeps working for subsequent creates after repairing itself", async () => {
    const { board, user } = await seedBoard();

    await db.insert(schema.taskTable).values({
      boardId: board.id,
      title: "High",
      status: "to-do",
      description: "",
      priority: "low",
      number: 13,
      position: 1,
    });
    await db
      .update(schema.boardTable)
      .set({ lastTaskNumber: 12 })
      .where(eq(schema.boardTable.id, board.id));

    const first = await createTask({
      boardId: board.id,
      currentUserId: user.id,
      title: "A",
      description: "",
      status: "to-do",
    });
    const second = await createTask({
      boardId: board.id,
      currentUserId: user.id,
      title: "B",
      description: "",
      status: "to-do",
    });

    expect(second.number).toBe(first.number + 1);
  });

  it("reserves a contiguous block for bulk imports past the drift", async () => {
    const { board } = await seedBoard();

    await db.insert(schema.taskTable).values({
      boardId: board.id,
      title: "High",
      status: "to-do",
      description: "",
      priority: "low",
      number: 20,
      position: 1,
    });
    await db
      .update(schema.boardTable)
      .set({ lastTaskNumber: 5 })
      .where(eq(schema.boardTable.id, board.id));

    const start = await claimTaskNumbers(board.id, 3);
    expect(start).toBe(21);
    expect(await lastTaskNumber(board.id)).toBe(23);
  });

  it("does not renumber or disturb existing tasks", async () => {
    const { board, user } = await seedBoard();

    const [existing] = await db
      .insert(schema.taskTable)
      .values({
        boardId: board.id,
        title: "Existing",
        status: "to-do",
        description: "",
        priority: "low",
        number: 7,
        position: 1,
      })
      .returning();

    await createTask({
      boardId: board.id,
      currentUserId: user.id,
      title: "New",
      description: "",
      status: "to-do",
    });

    const after = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, existing.id),
    });
    expect(after?.number).toBe(7);
  });

  it("still reports a missing board rather than inventing a number", async () => {
    await expect(claimTaskNumber("does-not-exist")).rejects.toMatchObject({
      status: 404,
    });
  });
});
