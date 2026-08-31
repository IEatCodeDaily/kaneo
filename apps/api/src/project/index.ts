import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { organizationAccess } from "../utils/organization-access-middleware";
import { requireOrganizationPermission } from "../utils/require-organization-permission";
import addProjectTicketCtrl from "./controllers/add-project-ticket";
import archiveProjectCtrl from "./controllers/archive-project";
import createProjectCtrl, {
  PROJECT_STATUSES,
} from "./controllers/create-project";
import getProjectCtrl from "./controllers/get-project";
import listProjectTicketsCtrl from "./controllers/list-project-tickets";
import listProjectsCtrl from "./controllers/list-projects";
import removeProjectTicketCtrl from "./controllers/remove-project-ticket";
import renameProjectSlugCtrl from "./controllers/rename-project-slug";
import resolveProjectCtrl from "./controllers/resolve-project";
import unarchiveProjectCtrl from "./controllers/unarchive-project";
import updateProjectCtrl from "./controllers/update-project";

const PROJECT_PRIORITY_VALUES = [
  "no-priority",
  "low",
  "medium",
  "high",
  "urgent",
] as const;
const projectProgressSchema = v.object({
  completed: v.number(),
  eligible: v.number(),
  percent: v.nullable(v.number()),
});

const projectTicketSchema = v.object({
  id: v.string(),
  boardId: v.string(),
  boardSlug: v.string(),
  boardName: v.string(),
  number: v.number(),
  key: v.string(),
  title: v.string(),
  status: v.string(),
  priority: v.nullable(v.string()),
  archivedAt: v.nullable(v.date()),
  rank: v.number(),
  addedAt: v.date(),
  addedBy: v.string(),
});

const projectTicketsResponseSchema = v.object({
  tickets: v.array(projectTicketSchema),
  progress: projectProgressSchema,
});

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
  // KFL-367 derives progress from the authorization-filtered visible set;
  // health remains presentation-only until the Updates ticket.
  progress: projectProgressSchema,
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
      const userId = c.get("userId");
      const projectData = await getProjectCtrl(organizationId, id, userId);
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
    "/:id/tickets",
    describeRoute({
      operationId: "listProjectTickets",
      tags: ["Projects"],
      description:
        "List scoped Project tickets with requester-filtered progress",
      responses: {
        200: {
          description: "Scoped tickets and progress",
          content: {
            "application/json": {
              schema: resolver(projectTicketsResponseSchema),
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
      return c.json(await listProjectTicketsCtrl(organizationId, id, userId));
    },
  )
  .post(
    "/:id/tickets",
    describeRoute({
      operationId: "addProjectTicket",
      tags: ["Projects"],
      description: "Scope a ticket into a Project",
      responses: {
        200: {
          description: "Scoped ticket projection",
          content: {
            "application/json": { schema: resolver(projectTicketSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({ taskId: v.string(), rank: v.optional(v.number()) }),
    ),
    organizationAccess.fromProject(),
    requireOrganizationPermission({ project: ["update"] }),
    requireOrganizationPermission({ task: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { taskId, rank } = c.req.valid("json");
      const userId = c.get("userId");
      const ticket = await addProjectTicketCtrl({
        projectId: id,
        taskId,
        rank,
        userId,
      });
      return c.json(ticket);
    },
  )
  .delete(
    "/:id/tickets/:taskId",
    describeRoute({
      operationId: "removeProjectTicket",
      tags: ["Projects"],
      description: "Remove a ticket from a Project",
      responses: {
        200: {
          description: "Membership removed",
          content: {
            "application/json": {
              schema: resolver(v.object({ ok: v.boolean() })),
            },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string(), taskId: v.string() })),
    organizationAccess.fromProject(),
    requireOrganizationPermission({ project: ["update"] }),
    requireOrganizationPermission({ task: ["update"] }),
    async (c) => {
      const { id, taskId } = c.req.valid("param");
      const userId = c.get("userId");
      await removeProjectTicketCtrl({ projectId: id, taskId, userId });
      return c.json({ ok: true });
    },
  );

export default project;
