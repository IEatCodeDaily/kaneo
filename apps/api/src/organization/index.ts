import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { organizationAccess } from "../utils/organization-access-middleware";
import getOrganizationMembersCtrl from "./controllers/get-organization-members";

const organization = new Hono<{
  Variables: {
    userId: string;
    organizationId: string;
  };
}>().get(
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
