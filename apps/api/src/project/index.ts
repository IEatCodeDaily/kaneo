import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { organizationAccess } from "../utils/organization-access-middleware";
import { requireOrganizationPermission } from "../utils/require-organization-permission";
import archiveProjectCtrl from "./controllers/archive-project";
import createProjectCtrl, {
  PROJECT_STATUSES,
} from "./controllers/create-project";
import getProjectCtrl from "./controllers/get-project";
import listProjectsCtrl from "./controllers/list-projects";
import renameProjectSlugCtrl from "./controllers/rename-project-slug";
import resolveProjectCtrl from "./controllers/resolve-project";
import createProjectResourceLinkCtrl from "./controllers/resources/create-project-resource-link";
import deleteProjectResourceLinkCtrl from "./controllers/resources/delete-project-resource-link";
import listProjectResourcesCtrl from "./controllers/resources/list-project-resources";
import updateProjectResourceLinkCtrl from "./controllers/resources/update-project-resource-link";
import unarchiveProjectCtrl from "./controllers/unarchive-project";
import updateProjectCtrl from "./controllers/update-project";
import {
  projectResourceLinkSchema,
  projectResourceRelationshipSchema,
  projectResourceTypeSchema,
} from "./project-resource-projection";

const PROJECT_PRIORITY_VALUES = [
  "no-priority",
  "low",
  "medium",
  "high",
  "urgent",
] as const;

const projectSchema = v.object({
  id: v.string(),
  organizationId: v.string(),
  slug: v.string(),
  name: v.string(),
  icon: v.nullable(v.string()),
  color: v.nullable(v.string()),
  summary: v.string(),
  description: v.nullable(v.string()),
  successCriteria: v.nullable(v.string()),
  status: v.picklist(PROJECT_STATUSES),
  priority: v.nullable(v.picklist(PROJECT_PRIORITY_VALUES)),
  leadUserId: v.string(),
  leadUserName: v.nullable(v.string()),
  leadTeamId: v.nullable(v.string()),
  leadTeamName: v.nullable(v.string()),
  startDate: v.nullable(v.string()),
  targetDate: v.nullable(v.string()),
  orgPrivilege: v.nullable(v.string()),
  archivedAt: v.nullable(v.date()),
  archivedBy: v.nullable(v.string()),
  archivedByName: v.nullable(v.string()),
  createdAt: v.date(),
  updatedAt: v.date(),
  createdBy: v.string(),
  // KFL-366 excludes ticket membership/progress/health entirely; these are
  // presentation-only placeholders for KFL-367+ to fill in.
  progress: v.null_(),
  health: v.null_(),
});

const optionalNullableString = v.optional(v.nullable(v.string()));

const project = new Hono<{
  Variables: { userId: string; organizationId: string };
}>()
  .get(
    "/",
    describeRoute({
      operationId: "listProjects",
      tags: ["Projects"],
      description: "Get all projects in an organization",
      responses: {
        200: {
          description: "List of projects",
          content: {
            "application/json": { schema: resolver(v.array(projectSchema)) },
          },
        },
      },
    }),
    validator(
      "query",
      v.object({
        organizationId: v.string(),
        includeArchived: v.optional(v.string()),
      }),
    ),
    organizationAccess.fromQuery(),
    requireOrganizationPermission({ project: ["read"] }),
    async (c) => {
      const organizationId = c.get("organizationId");
      const userId = c.get("userId");
      const { includeArchived } = c.req.valid("query");
      const projects = await listProjectsCtrl(
        organizationId,
        userId,
        includeArchived === "true",
      );
      return c.json(projects);
    },
  )
  .post(
    "/",
    describeRoute({
      operationId: "createProject",
      tags: ["Projects"],
      description: "Create a new project in an organization",
      responses: {
        200: {
          description: "Project created successfully",
          content: {
            "application/json": { schema: resolver(projectSchema) },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        organizationId: v.string(),
        name: v.string(),
        summary: v.string(),
        leadUserId: v.string(),
        leadTeamId: optionalNullableString,
        slug: v.optional(v.string()),
        status: v.optional(v.string()),
        priority: optionalNullableString,
        icon: optionalNullableString,
        color: optionalNullableString,
        description: optionalNullableString,
        successCriteria: optionalNullableString,
        startDate: optionalNullableString,
        targetDate: optionalNullableString,
      }),
    ),
    organizationAccess.fromBody(),
    requireOrganizationPermission({ project: ["create"] }),
    async (c) => {
      const body = c.req.valid("json");
      const organizationId = c.get("organizationId");
      const userId = c.get("userId");
      const created = await createProjectCtrl({
        organizationId,
        name: body.name,
        summary: body.summary,
        leadUserId: body.leadUserId,
        leadTeamId: body.leadTeamId,
        createdBy: userId,
        slug: body.slug,
        status: body.status,
        priority: body.priority,
        icon: body.icon,
        color: body.color,
        description: body.description,
        successCriteria: body.successCriteria,
        startDate: body.startDate,
        targetDate: body.targetDate,
      });
      return c.json(created);
    },
  )
  .get(
    "/resolve",
    describeRoute({
      operationId: "resolveProject",
      tags: ["Projects"],
      description:
        "Resolve a project slug (canonical or alias) to its canonical projection",
      responses: {
        200: {
          description: "Resolved project",
          content: {
            "application/json": {
              schema: resolver(
                v.object({
                  ...projectSchema.entries,
                  usedSlugAlias: v.boolean(),
                }),
              ),
            },
          },
        },
      },
    }),
    validator(
      "query",
      v.object({ organizationId: v.string(), slug: v.string() }),
    ),
    organizationAccess.fromQuery(),
    requireOrganizationPermission({ project: ["read"] }),
    async (c) => {
      const { slug } = c.req.valid("query");
      const organizationId = c.get("organizationId");
      const userId = c.get("userId");
      const resolved = await resolveProjectCtrl(organizationId, slug, userId);
      return c.json(resolved);
    },
  )
  .get(
    "/:id",
    describeRoute({
      operationId: "getProject",
      tags: ["Projects"],
      description: "Get a specific project by ID",
      responses: {
        200: {
          description: "Project details",
          content: {
            "application/json": { schema: resolver(projectSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    organizationAccess.fromProject(),
    requireOrganizationPermission({ project: ["read"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const organizationId = c.get("organizationId");
      const projectData = await getProjectCtrl(organizationId, id);
      return c.json(projectData);
    },
  )
  .put(
    "/:id",
    describeRoute({
      operationId: "updateProject",
      tags: ["Projects"],
      description: "Update project metadata",
      responses: {
        200: {
          description: "Project updated successfully",
          content: {
            "application/json": { schema: resolver(projectSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        name: v.string(),
        summary: v.string(),
        status: v.string(),
        priority: v.nullable(v.string()),
        icon: v.nullable(v.string()),
        color: v.nullable(v.string()),
        description: v.nullable(v.string()),
        successCriteria: v.nullable(v.string()),
        leadUserId: v.string(),
        leadTeamId: v.nullable(v.string()),
        startDate: v.nullable(v.string()),
        targetDate: v.nullable(v.string()),
        orgPrivilege: v.nullable(
          v.picklist(["none", "view", "edit", "manage"] as const),
        ),
      }),
    ),
    organizationAccess.fromProject(),
    requireOrganizationPermission({ project: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const organizationId = c.get("organizationId");
      const updated = await updateProjectCtrl(id, {
        organizationId,
        ...body,
      });
      return c.json(updated);
    },
  )
  .put(
    "/:id/slug",
    describeRoute({
      operationId: "renameProjectSlug",
      tags: ["Projects"],
      description: "Rename a project's canonical slug",
      responses: {
        200: {
          description: "Project slug renamed successfully",
          content: {
            "application/json": { schema: resolver(projectSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator("json", v.object({ slug: v.string() })),
    organizationAccess.fromProject(),
    requireOrganizationPermission({ project: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { slug } = c.req.valid("json");
      const organizationId = c.get("organizationId");
      const updated = await renameProjectSlugCtrl(id, organizationId, slug);
      return c.json(updated);
    },
  )
  .put(
    "/:id/archive",
    describeRoute({
      operationId: "archiveProject",
      tags: ["Projects"],
      description: "Archive a project",
      responses: {
        200: {
          description: "Project archived successfully",
          content: {
            "application/json": { schema: resolver(projectSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    organizationAccess.fromProject(),
    requireOrganizationPermission({ project: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const organizationId = c.get("organizationId");
      const userId = c.get("userId");
      const archived = await archiveProjectCtrl(id, organizationId, userId);
      return c.json(archived);
    },
  )
  .put(
    "/:id/unarchive",
    describeRoute({
      operationId: "unarchiveProject",
      tags: ["Projects"],
      description: "Unarchive a project",
      responses: {
        200: {
          description: "Project unarchived successfully",
          content: {
            "application/json": { schema: resolver(projectSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    organizationAccess.fromProject(),
    requireOrganizationPermission({ project: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const organizationId = c.get("organizationId");
      const unarchived = await unarchiveProjectCtrl(id, organizationId);
      return c.json(unarchived);
    },
  )
  .get(
    "/:id/resources",
    describeRoute({
      operationId: "listProjectResources",
      tags: ["Projects"],
      description: "List contextual resource links for a project",
      responses: {
        200: {
          description: "List of project resource links",
          content: {
            "application/json": {
              schema: resolver(v.array(projectResourceLinkSchema)),
            },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    organizationAccess.fromProject(),
    requireOrganizationPermission({ project: ["read"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const organizationId = c.get("organizationId");
      const userId = c.get("userId");
      const links = await listProjectResourcesCtrl(organizationId, id, userId);
      return c.json(links);
    },
  )
  .post(
    "/:id/resources",
    describeRoute({
      operationId: "createProjectResourceLink",
      tags: ["Projects"],
      description: "Link a contextual resource to a project",
      responses: {
        200: {
          description: "Project resource link created",
          content: {
            "application/json": { schema: resolver(projectResourceLinkSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        resourceType: projectResourceTypeSchema,
        resourceId: v.string(),
        relationship: projectResourceRelationshipSchema,
        label: v.optional(v.nullable(v.string())),
        note: v.optional(v.nullable(v.string())),
        rank: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
      }),
    ),
    organizationAccess.fromProject(),
    requireOrganizationPermission({ project: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const organizationId = c.get("organizationId");
      const userId = c.get("userId");
      const link = await createProjectResourceLinkCtrl({
        organizationId,
        projectId: id,
        userId,
        ...body,
      });
      return c.json(link);
    },
  )
  .put(
    "/:id/resources/:linkId",
    describeRoute({
      operationId: "updateProjectResourceLink",
      tags: ["Projects"],
      description: "Update a project resource link's metadata",
      responses: {
        200: {
          description: "Project resource link updated",
          content: {
            "application/json": { schema: resolver(projectResourceLinkSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string(), linkId: v.string() })),
    validator(
      "json",
      v.object({
        relationship: projectResourceRelationshipSchema,
        label: v.optional(v.nullable(v.string())),
        note: v.optional(v.nullable(v.string())),
        rank: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
      }),
    ),
    organizationAccess.fromProject(),
    requireOrganizationPermission({ project: ["update"] }),
    async (c) => {
      const { id, linkId } = c.req.valid("param");
      const body = c.req.valid("json");
      const organizationId = c.get("organizationId");
      const userId = c.get("userId");
      const link = await updateProjectResourceLinkCtrl({
        organizationId,
        projectId: id,
        linkId,
        userId,
        ...body,
      });
      return c.json(link);
    },
  )
  .delete(
    "/:id/resources/:linkId",
    describeRoute({
      operationId: "deleteProjectResourceLink",
      tags: ["Projects"],
      description: "Remove a project resource link",
      responses: {
        204: { description: "Project resource link removed" },
      },
    }),
    validator("param", v.object({ id: v.string(), linkId: v.string() })),
    organizationAccess.fromProject(),
    requireOrganizationPermission({ project: ["update"] }),
    async (c) => {
      const { id, linkId } = c.req.valid("param");
      const organizationId = c.get("organizationId");
      const userId = c.get("userId");
      await deleteProjectResourceLinkCtrl({
        organizationId,
        projectId: id,
        linkId,
        userId,
      });
      return new Response(null, { status: 204 });
    },
  );

export default project;
