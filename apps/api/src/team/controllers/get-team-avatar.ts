import { eq } from "drizzle-orm";
import db, { schema } from "../../database";

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

export default getTeamAvatar;
