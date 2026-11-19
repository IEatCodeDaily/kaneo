import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import db, { schema } from "../database";
import { decodeAvatarUpload, MAX_AVATAR_BYTES } from "../user/avatar";

export { MAX_AVATAR_BYTES };

export function buildTeamAvatarUrl(id: string) {
  return `/api/team/avatar/${id}`;
}

export async function saveTeamAvatar({
  teamId,
  contentType,
  data,
}: {
  teamId: string;
  contentType: string;
  data: string;
}) {
  const { mimeType, bytes } = decodeAvatarUpload({ contentType, data });

  const [saved] = await db
    .insert(schema.teamAvatarTable)
    .values({
      teamId,
      mimeType,
      size: bytes.length,
      data: bytes,
    })
    .onConflictDoUpdate({
      target: schema.teamAvatarTable.teamId,
      set: {
        id: createId(),
        mimeType,
        size: bytes.length,
        data: bytes,
        updatedAt: new Date(),
      },
    })
    .returning({ id: schema.teamAvatarTable.id });

  const url = buildTeamAvatarUrl(saved.id);
  await db
    .update(schema.teamTable)
    .set({ image: url })
    .where(eq(schema.teamTable.id, teamId));

  return { id: saved.id, url, size: bytes.length };
}

export async function getTeamAvatar(id: string) {
  const [avatar] = await db
    .select({
      id: schema.teamAvatarTable.id,
      mimeType: schema.teamAvatarTable.mimeType,
      size: schema.teamAvatarTable.size,
      data: schema.teamAvatarTable.data,
      updatedAt: schema.teamAvatarTable.updatedAt,
    })
    .from(schema.teamAvatarTable)
    .where(eq(schema.teamAvatarTable.id, id))
    .limit(1);

  return avatar ?? null;
}

export async function deleteTeamAvatar(id: string) {
  const [deleted] = await db
    .delete(schema.teamAvatarTable)
    .where(eq(schema.teamAvatarTable.id, id))
    .returning({ teamId: schema.teamAvatarTable.teamId });

  if (deleted) {
    await db
      .update(schema.teamTable)
      .set({ image: null })
      .where(eq(schema.teamTable.id, deleted.teamId));
  }

  return { deleted: Boolean(deleted) };
}
