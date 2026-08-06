import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import * as v from "valibot";
import db from "../../database";
import { organizationTable } from "../../database/schema";
import {
  RESOURCE_PRIVILEGES,
  RESOURCE_TYPES,
  type ResourcePrivilege,
  type ResourceType,
} from "../../resource-access";

const privilegeSchema = v.picklist(RESOURCE_PRIVILEGES);

/**
 * Per-type overrides are OPTIONAL — an absent key means "inherit the org-wide
 * default". The body therefore takes a partial record rather than requiring
 * every resource type, matching the inheritance model the settings UI shows.
 */
export const visibilityDefaultsBodySchema = v.object({
  defaultResourcePrivilege: v.optional(privilegeSchema),
  resourceDefaultOverrides: v.optional(
    v.partial(
      v.object(
        Object.fromEntries(
          RESOURCE_TYPES.map((type) => [type, privilegeSchema]),
        ) as Record<ResourceType, typeof privilegeSchema>,
      ),
    ),
  ),
});

export type VisibilityDefaultsBody = v.InferOutput<
  typeof visibilityDefaultsBodySchema
>;

export async function getVisibilityDefaults(organizationId: string) {
  const [organization] = await db
    .select({
      defaultResourcePrivilege: organizationTable.defaultResourcePrivilege,
      resourceDefaultOverrides: organizationTable.resourceDefaultOverrides,
    })
    .from(organizationTable)
    .where(eq(organizationTable.id, organizationId))
    .limit(1);
  if (!organization) {
    throw new HTTPException(404, { message: "Organization not found" });
  }
  return {
    defaultResourcePrivilege:
      organization.defaultResourcePrivilege as ResourcePrivilege,
    resourceDefaultOverrides: (organization.resourceDefaultOverrides ??
      {}) as Partial<Record<ResourceType, ResourcePrivilege>>,
    resourceTypes: RESOURCE_TYPES,
  };
}

export async function updateVisibilityDefaults(
  organizationId: string,
  body: VisibilityDefaultsBody,
) {
  const patch: Record<string, unknown> = {};
  if (body.defaultResourcePrivilege !== undefined) {
    patch.defaultResourcePrivilege = body.defaultResourcePrivilege;
  }
  if (body.resourceDefaultOverrides !== undefined) {
    // Replace wholesale: the UI always sends the full override map, and a
    // merge would make it impossible to clear an override back to inherit.
    patch.resourceDefaultOverrides = body.resourceDefaultOverrides;
  }
  if (Object.keys(patch).length === 0) {
    return getVisibilityDefaults(organizationId);
  }
  const [updated] = await db
    .update(organizationTable)
    .set(patch)
    .where(eq(organizationTable.id, organizationId))
    .returning({ id: organizationTable.id });
  if (!updated) {
    throw new HTTPException(404, { message: "Organization not found" });
  }
  return getVisibilityDefaults(organizationId);
}
