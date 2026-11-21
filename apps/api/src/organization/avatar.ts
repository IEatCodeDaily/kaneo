import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import db, { schema } from "../database";
import { decodeAvatarUpload, MAX_AVATAR_BYTES } from "../user/avatar";

export { MAX_AVATAR_BYTES };

/*
  The organization logo lives in the existing organization.logo text column
  (Better Auth's own field) as a data URL — no extra table, no migration.
  The public download route below serves the decoded bytes with a content
  hash ETag so sidebar/selector rendering can go through a cacheable URL.
*/
export function buildOrganizationAvatarUrl(organizationId: string) {
  return `/api/organization/avatar/${organizationId}`;
}

function toDataUrl(mimeType: string, bytes: Buffer) {
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

const DATA_URL_PATTERN =
  /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

export async function saveOrganizationAvatar({
  organizationId,
  contentType,
  data,
}: {
  organizationId: string;
  contentType: string;
  data: string;
}) {
  const { mimeType, bytes } = decodeAvatarUpload({ contentType, data });

  const [saved] = await db
    .update(schema.organizationTable)
    .set({ logo: toDataUrl(mimeType, bytes) })
    .where(eq(schema.organizationTable.id, organizationId))
    .returning({ id: schema.organizationTable.id });

  if (!saved) return null;

  const url = buildOrganizationAvatarUrl(saved.id);
  return { id: saved.id, url, size: bytes.length };
}

export async function getOrganizationAvatar(organizationId: string) {
  const [organization] = await db
    .select({ logo: schema.organizationTable.logo })
    .from(schema.organizationTable)
    .where(eq(schema.organizationTable.id, organizationId))
    .limit(1);

  if (!organization?.logo) return null;

  const match = DATA_URL_PATTERN.exec(organization.logo);
  if (!match) return null;

  const bytes = Buffer.from(match[2], "base64");
  const etag = `"${createHash("sha1").update(bytes).digest("hex").slice(0, 16)}"`;
  return { mimeType: match[1], bytes, etag };
}

export async function deleteOrganizationAvatar(organizationId: string) {
  const [deleted] = await db
    .update(schema.organizationTable)
    .set({ logo: null })
    .where(eq(schema.organizationTable.id, organizationId))
    .returning({ id: schema.organizationTable.id });

  return { deleted: Boolean(deleted) };
}
