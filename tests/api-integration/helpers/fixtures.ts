import { randomUUID } from "node:crypto";
import { DEFAULT_PROJECT_COLUMNS } from "../../../apps/api/src/board/controllers/create-board";
import db, { schema } from "../../../apps/api/src/database";

export type SeededMemberContext = {
  user: typeof schema.userTable.$inferSelect;
  organization: typeof schema.organizationTable.$inferSelect;
};

export async function createOrganizationMember(
  overrides?: Partial<{
    userName: string;
    organizationName: string;
    role: string;
  }>,
): Promise<SeededMemberContext> {
  const userId = `user-${randomUUID()}`;
  const organizationId = `organization-${randomUUID()}`;

  const [user] = await db
    .insert(schema.userTable)
    .values({
      id: userId,
      email: `${userId}@example.com`,
      emailVerified: true,
      name: overrides?.userName || "Integration Test User",
    })
    .returning();

  const [organization] = await db
    .insert(schema.organizationTable)
    .values({
      id: organizationId,
      createdAt: new Date(),
      name: overrides?.organizationName || "Integration Test Organization",
      slug: `organization-${randomUUID()}`,
    })
    .returning();

  await db.insert(schema.organizationMemberTable).values({
    organizationId: organization.id,
    userId: user.id,
    role: overrides?.role ?? "member",
    joinedAt: new Date(),
  });

  return { user, organization };
}

export async function createBoardFixture({
  organizationId,
  name = "Integration Board",
  icon = "Folder",
  slug = `board-${randomUUID()}`,
}: {
  organizationId: string;
  name?: string;
  icon?: string;
  slug?: string;
}) {
  const [board] = await db
    .insert(schema.boardTable)
    .values({
      organizationId,
      name,
      icon,
      slug,
    })
    .returning();

  const insertedColumns: (typeof schema.columnTable.$inferSelect)[] = [];

  for (const col of DEFAULT_PROJECT_COLUMNS) {
    const [inserted] = await db
      .insert(schema.columnTable)
      .values({
        boardId: board.id,
        name: col.name,
        slug: col.slug,
        position: col.position,
        isFinal: col.isFinal,
      })
      .returning();
    if (inserted) {
      insertedColumns.push(inserted);
    }
  }

  const columnsBySlug = new Map(
    insertedColumns.map((column) => [column.slug, column]),
  );

  const todo = columnsBySlug.get("to-do");
  const inProgress = columnsBySlug.get("in-progress");
  const inReview = columnsBySlug.get("in-review");
  const done = columnsBySlug.get("done");

  if (!todo || !inProgress || !inReview || !done) {
    throw new Error("Failed to seed default board columns");
  }

  return {
    board,
    columns: {
      todo,
      inProgress,
      inReview,
      done,
    },
  };
}
