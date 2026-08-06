import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { organizationAccess } from "../utils/organization-access-middleware";
import getOrganizationMembersCtrl from "./controllers/get-organization-members";
import listOrganizationsCtrl from "./controllers/list-organizations";

const organization = new Hono<{
  Variables: {
    userId: string;
    organizationId: string;
    apiKey: { id: string; metadata?: string | null } | null;
  };
}>()
  .get(
    "/",
    describeRoute({
      operationId: "listOrganizations",
      tags: ["Organizations"],
      description:
        "List organizations the authenticated principal can access. Works for user sessions AND agent/API keys — agent keys see only the organization they are scoped to. (The Better Auth /api/auth/organization/list route is session-only, which left agents unable to discover organization ids.)",
      responses: {
        200: {
          description: "Organizations visible to the caller",
          content: {
            "application/json": {
              schema: resolver(
                v.array(
                  v.object({
                    id: v.string(),
                    name: v.string(),
                    slug: v.string(),
                    logo: v.nullable(v.string()),
                    role: v.optional(v.string()),
                  }),
                ),
              ),
            },
          },
        },
      },
    }),
    async (c) => {
      const userId = c.get("userId");
      const apiKey = c.get("apiKey");
      return c.json(await listOrganizationsCtrl(userId, apiKey?.metadata));
    },
  )
  .get(
    "/:organizationId/members",
    describeRoute({
      operationId: "getOrganizationMembers",
      tags: ["Organizations"],
      description: "Get all members of a organization",
      responses: {
        200: {
          description: "List of organization members",
          content: {
            "application/json": {
              schema: resolver(
                v.array(
                  v.object({
                    id: v.string(),
                    name: v.string(),
                    email: v.string(),
                    image: v.nullable(v.string()),
                    role: v.string(),
                  }),
                ),
              ),
            },
          },
        },
      },
    }),
    validator("param", v.object({ organizationId: v.string() })),
    organizationAccess.fromParam("organizationId"),
    async (c) => {
      const organizationId = c.get("organizationId");
      const members = await getOrganizationMembersCtrl(organizationId);
      return c.json(members);
    },
  );

export default organization;
