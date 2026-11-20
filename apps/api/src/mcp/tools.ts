import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  assertBoardPermission,
  assertMcpPermission,
  assertTablePermission,
  assertTaskPermission,
  type McpPermissionMap,
} from "./permissions";

class ApiClient {
  constructor(
    private baseUrl: string,
    private token: string,
  ) {}

  async json<T = unknown>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${this.token}`);
    if (init?.body != null && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const res = await fetch(url, {
      ...init,
      headers,
      signal: AbortSignal.timeout(10_000),
    });

    const text = await res.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    if (!res.ok) {
      const detail =
        typeof body === "object" && body !== null && "message" in body
          ? (body as { message: string }).message
          : typeof body === "string" && body.length > 0
            ? body.slice(0, 500)
            : `HTTP ${res.status}`;
      throw new Error(`${path}: ${detail}`);
    }
    return body as T;
  }
}

function textResult(data: unknown, isError = false): CallToolResult {
  const text =
    typeof data === "string" ? data : (JSON.stringify(data, null, 2) ?? "");
  return { content: [{ type: "text", text }], isError };
}

function errorResult(message: string): CallToolResult {
  return textResult({ error: message }, true);
}

function run(fn: () => Promise<unknown>): Promise<CallToolResult> {
  return fn()
    .then((data) => textResult(data))
    .catch((e: unknown) =>
      errorResult(e instanceof Error ? e.message : String(e)),
    );
}

const PRIORITIES = ["no-priority", "low", "medium", "high", "urgent"] as const;

function isTaskPriority(v: string): v is (typeof PRIORITIES)[number] {
  return (PRIORITIES as readonly string[]).includes(v);
}

function formatOptionalIso(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return undefined;
}

function buildFullTaskUpdateBody(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, string | number | undefined> {
  const positionRaw = patch.position ?? existing.position;
  const position =
    typeof positionRaw === "number"
      ? positionRaw
      : typeof positionRaw === "string"
        ? Number(positionRaw)
        : Number.NaN;
  if (!Number.isFinite(position))
    throw new Error(
      "Cannot update task: missing numeric `position` on existing task.",
    );

  const title =
    (patch.title as string) ??
    (typeof existing.title === "string" ? existing.title : undefined);
  if (!title) throw new Error("Cannot update task: missing title.");

  const description =
    patch.description !== undefined
      ? patch.description === null
        ? ""
        : String(patch.description)
      : existing.description == null
        ? ""
        : String(existing.description);

  const status =
    (patch.status as string) ??
    (typeof existing.status === "string" ? existing.status : undefined);
  if (!status) throw new Error("Cannot update task: missing status.");

  const priorityRaw =
    (patch.priority as string) ??
    (typeof existing.priority === "string" ? existing.priority : undefined);
  if (!priorityRaw || !isTaskPriority(priorityRaw))
    throw new Error("Cannot update task: invalid or missing priority.");

  const boardId =
    (patch.boardId as string) ??
    (typeof existing.boardId === "string" ? existing.boardId : undefined);
  if (!boardId) throw new Error("Cannot update task: missing boardId.");

  const userId =
    patch.userId !== undefined
      ? patch.userId === null
        ? ""
        : (patch.userId as string)
      : typeof existing.userId === "string"
        ? existing.userId
        : undefined;

  const startDate = formatOptionalIso(
    patch.startDate !== undefined ? patch.startDate : existing.startDate,
  );
  const dueDate = formatOptionalIso(
    patch.dueDate !== undefined ? patch.dueDate : existing.dueDate,
  );

  const body: Record<string, string | number | undefined> = {
    title,
    description,
    status,
    priority: priorityRaw,
    boardId,
    position,
  };
  if (startDate !== undefined) body.startDate = startDate;
  if (dueDate !== undefined) body.dueDate = dueDate;
  if (userId !== undefined) body.userId = userId;
  return body;
}

const prioritySchema = z.enum([
  "no-priority",
  "low",
  "medium",
  "high",
  "urgent",
]);
const nonEmptyString = z.string().trim().min(1);
const optionalNonEmptyString = nonEmptyString.optional();
const nullableOptionalNonEmptyString = nonEmptyString.nullable().optional();
const isoDateTimeSchema = z.string().datetime({ offset: true });
const optionalIsoDateTimeSchema = isoDateTimeSchema.optional();
const nullableOptionalIsoDateTimeSchema = isoDateTimeSchema
  .nullable()
  .optional();
const hexColorSchema = z
  .string()
  .regex(
    /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
    "Expected a hex color like #FF6600",
  );

/**
 * Mirror of the dashboard `panelSchema` valibot validator enforced by
 * PUT /api/data-table/organization/:organizationId/dashboards/:dashboardId
 * (apps/api/src/data-table/index.ts). Kept in sync by hand: the MCP layer
 * validates early so an agent gets a readable error instead of an HTTP 400
 * dump, and the REST route remains authoritative.
 */
const PANEL_TYPES = ["stat", "bar", "line", "area", "pie", "table"] as const;
const PANEL_SPANS = [6, 8, 9, 12, 15, 16, 24] as const;
const AGGREGATIONS = ["count", "sum", "avg", "min", "max"] as const;
const FILTER_OPS = [
  "eq",
  "neq",
  "in",
  "lt",
  "lte",
  "gt",
  "gte",
  "isEmpty",
] as const;
const panelQuerySchema = z.object({
  tableId: nonEmptyString,
  metric: z.object({
    agg: z.enum(AGGREGATIONS),
    fieldId: optionalNonEmptyString,
  }),
  groupBy: z
    .object({
      fieldId: nonEmptyString,
      bucket: z.enum(["day", "week", "month"]).optional(),
    })
    .optional(),
  filters: z
    .array(
      z.object({
        fieldId: nonEmptyString,
        op: z.enum(FILTER_OPS),
        value: z.unknown().optional(),
      }),
    )
    .max(50)
    .optional(),
  limit: z.number().int().min(1).max(500).optional(),
});
const dashboardPanelSchema = z.object({
  id: optionalNonEmptyString,
  title: nonEmptyString,
  type: z.enum(PANEL_TYPES),
  span: z
    .number()
    .int()
    .refine((v): v is (typeof PANEL_SPANS)[number] =>
      (PANEL_SPANS as readonly number[]).includes(v),
    ),
  query: panelQuerySchema,
});
const dashboardPanelsSchema = z.array(dashboardPanelSchema).max(100);

export function registerMcpTools(
  server: McpServer,
  baseUrl: string,
  token: string,
  userId?: string,
): void {
  const client = new ApiClient(baseUrl, token);

  /**
   * Permission gate for task tools (#38). When the MCP session knows which
   * user it acts for, every task tool re-checks that user's organization
   * permissions with the same rules the HTTP API enforces, before any request
   * is issued. Without this a tool would inherit the raw bearer token and
   * bypass role checks entirely.
   */
  const guardTask = (taskId: string, permissions: McpPermissionMap) =>
    userId
      ? assertTaskPermission(userId, taskId, permissions)
      : Promise.resolve("");
  const guardBoard = (boardId: string, permissions: McpPermissionMap) =>
    userId
      ? assertBoardPermission(userId, boardId, permissions)
      : Promise.resolve("");

  server.registerTool(
    "whoami",
    {
      description: "Return the current Kaneo session and user.",
      inputSchema: z.object({}),
    },
    async () =>
      run(() => client.json("/api/auth/get-session", { method: "GET" })),
  );

  server.registerTool(
    "list_organizations",
    {
      description:
        "List organizations the authenticated principal (user session or agent key) can access. Agent keys see only the organization they are scoped to.",
      inputSchema: z.object({}),
    },
    async () =>
      // NOT /api/auth/organization/list: that Better Auth route is
      // session-only and rejects agent/API keys with INVALID_API_KEY,
      // leaving agents unable to discover the org id every other
      // org-scoped tool requires.
      run(() => client.json("/api/organization", { method: "GET" })),
  );

  server.registerTool(
    "list_boards",
    {
      description: "List boards in a organization.",
      inputSchema: z.object({
        organizationId: nonEmptyString.describe("Organization ID"),
        includeArchived: z
          .boolean()
          .optional()
          .describe("Include archived boards"),
      }),
    },
    async (args) => {
      const qs = new URLSearchParams({ organizationId: args.organizationId });
      if (args.includeArchived === true) qs.set("includeArchived", "true");
      return run(() =>
        client.json(`/api/board?${qs.toString()}`, { method: "GET" }),
      );
    },
  );

  server.registerTool(
    "get_board",
    {
      description: "Get a single board by ID.",
      inputSchema: z.object({ id: nonEmptyString }),
    },
    async (args) =>
      run(() => client.json(`/api/board/${encodeURIComponent(args.id)}`)),
  );

  server.registerTool(
    "create_board",
    {
      description: "Create a board in a organization.",
      inputSchema: z.object({
        name: nonEmptyString,
        organizationId: nonEmptyString,
        icon: nonEmptyString,
        slug: nonEmptyString,
      }),
    },
    async (args) =>
      run(() =>
        client.json("/api/board", {
          method: "POST",
          body: JSON.stringify({
            name: args.name,
            organizationId: args.organizationId,
            icon: args.icon,
            slug: args.slug,
          }),
        }),
      ),
  );

  server.registerTool(
    "update_board",
    {
      description:
        "Update board metadata (PATCH-style: only provided fields are changed).",
      inputSchema: z.object({
        id: nonEmptyString,
        name: optionalNonEmptyString,
        icon: z.string().optional(),
        slug: optionalNonEmptyString,
        description: z.string().optional(),
        isPublic: z.boolean().optional(),
      }),
    },
    async (args) => {
      const { id, ...patch } = args;
      return run(async () => {
        const existing = (await client.json(
          `/api/board/${encodeURIComponent(id)}`,
          { method: "GET" },
        )) as Record<string, unknown>;
        const name =
          patch.name ??
          (typeof existing.name === "string" ? existing.name : "");
        if (!name) throw new Error("Cannot update board: missing name.");
        const icon =
          patch.icon !== undefined
            ? patch.icon
            : typeof existing.icon === "string"
              ? existing.icon
              : "Layout";
        const slug =
          patch.slug ??
          (typeof existing.slug === "string" ? existing.slug : "");
        if (!slug) throw new Error("Cannot update board: missing slug.");
        const description =
          patch.description !== undefined
            ? patch.description
            : typeof existing.description === "string"
              ? existing.description
              : "";
        const isPublic =
          patch.isPublic !== undefined
            ? patch.isPublic
            : typeof existing.isPublic === "boolean"
              ? existing.isPublic
              : false;
        return client.json(`/api/board/${encodeURIComponent(id)}`, {
          method: "PUT",
          body: JSON.stringify({ name, icon, slug, description, isPublic }),
        });
      });
    },
  );

  server.registerTool(
    "list_tasks",
    {
      description: "List tasks for a board (optionally filtered/sorted).",
      inputSchema: z.object({
        boardId: nonEmptyString,
        status: optionalNonEmptyString,
        priority: prioritySchema.optional(),
        assigneeId: optionalNonEmptyString,
        page: z.number().int().positive().optional(),
        limit: z.number().int().positive().optional(),
        sortBy: z
          .enum([
            "createdAt",
            "priority",
            "dueDate",
            "position",
            "title",
            "number",
          ])
          .optional(),
        sortOrder: z.enum(["asc", "desc"]).optional(),
        dueBefore: optionalIsoDateTimeSchema,
        dueAfter: optionalIsoDateTimeSchema,
      }),
    },
    async (args) => {
      const { boardId, ...rest } = args;
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(rest)) {
        if (v !== undefined && v !== null) qs.set(k, String(v));
      }
      const q = qs.toString();
      return run(() =>
        client.json(
          `/api/task/tasks/${encodeURIComponent(boardId)}${q ? `?${q}` : ""}`,
          { method: "GET" },
        ),
      );
    },
  );

  server.registerTool(
    "get_task",
    {
      description: "Get a task by ID.",
      inputSchema: z.object({ taskId: nonEmptyString }),
    },
    async (args) =>
      run(async () => {
        await guardTask(args.taskId, { task: ["read"] });
        return client.json(`/api/task/${encodeURIComponent(args.taskId)}`, {
          method: "GET",
        });
      }),
  );

  server.registerTool(
    "create_task",
    {
      description: "Create a task in a board.",
      inputSchema: z.object({
        boardId: nonEmptyString,
        title: nonEmptyString,
        description: z.string(),
        priority: prioritySchema,
        status: nonEmptyString,
        startDate: optionalIsoDateTimeSchema,
        dueDate: optionalIsoDateTimeSchema,
        userId: optionalNonEmptyString,
      }),
    },
    async (args) => {
      const body: Record<string, string | undefined> = {
        title: args.title,
        description: args.description,
        priority: args.priority,
        status: args.status,
      };
      if (args.startDate !== undefined) body.startDate = args.startDate;
      if (args.dueDate !== undefined) body.dueDate = args.dueDate;
      if (args.userId !== undefined) body.userId = args.userId;
      return run(async () => {
        await guardBoard(args.boardId, { task: ["create"] });
        if (args.userId !== undefined) {
          await guardBoard(args.boardId, { task: ["assign"] });
        }
        return client.json(`/api/task/${encodeURIComponent(args.boardId)}`, {
          method: "POST",
          body: JSON.stringify(body),
        });
      });
    },
  );

  server.registerTool(
    "assign_task",
    {
      description:
        "Assign a task to a user (or unassign by omitting userId). Requires task:assign in the task's organization.",
      inputSchema: z.object({
        taskId: nonEmptyString,
        userId: nullableOptionalNonEmptyString,
      }),
    },
    async (args) =>
      run(async () => {
        await guardTask(args.taskId, { task: ["assign"] });
        return client.json(
          `/api/task/assignee/${encodeURIComponent(args.taskId)}`,
          {
            method: "PUT",
            body: JSON.stringify({
              userId: args.userId === undefined ? null : args.userId,
              teamId: null,
            }),
          },
        );
      }),
  );

  server.registerTool(
    "update_task",
    {
      description:
        "Update a task (fetches current task, merges fields, then full update).",
      inputSchema: z.object({
        taskId: nonEmptyString,
        title: optionalNonEmptyString,
        description: z.string().nullable().optional(),
        status: optionalNonEmptyString,
        priority: prioritySchema.optional(),
        boardId: optionalNonEmptyString,
        position: z.number().optional(),
        startDate: nullableOptionalIsoDateTimeSchema,
        dueDate: nullableOptionalIsoDateTimeSchema,
        userId: nullableOptionalNonEmptyString,
      }),
    },
    async (args) => {
      const { taskId, ...patch } = args;
      return run(async () => {
        await guardTask(taskId, { task: ["update"] });
        if (patch.userId !== undefined) {
          await guardTask(taskId, { task: ["assign"] });
        }
        const existing = (await client.json(
          `/api/task/${encodeURIComponent(taskId)}`,
          { method: "GET" },
        )) as Record<string, unknown>;
        const body = buildFullTaskUpdateBody(existing, patch);
        return client.json(`/api/task/${encodeURIComponent(taskId)}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      });
    },
  );

  server.registerTool(
    "move_task",
    {
      description: "Move a task to another board (and optional column status).",
      inputSchema: z.object({
        taskId: nonEmptyString,
        destinationBoardId: nonEmptyString,
        destinationStatus: optionalNonEmptyString,
      }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/task/move/${encodeURIComponent(args.taskId)}`, {
          method: "PUT",
          body: JSON.stringify({
            destinationBoardId: args.destinationBoardId,
            ...(args.destinationStatus !== undefined
              ? { destinationStatus: args.destinationStatus }
              : {}),
          }),
        }),
      ),
  );

  server.registerTool(
    "update_task_status",
    {
      description: "Update only the status (column) of a task.",
      inputSchema: z.object({ taskId: nonEmptyString, status: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/task/status/${encodeURIComponent(args.taskId)}`, {
          method: "PUT",
          body: JSON.stringify({ status: args.status }),
        }),
      ),
  );

  server.registerTool(
    "list_task_comments",
    {
      description: "List comments on a task.",
      inputSchema: z.object({ taskId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/comment/${encodeURIComponent(args.taskId)}`, {
          method: "GET",
        }),
      ),
  );

  server.registerTool(
    "create_task_comment",
    {
      description: "Add a comment to a task.",
      inputSchema: z.object({
        taskId: nonEmptyString,
        content: nonEmptyString,
      }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/comment/${encodeURIComponent(args.taskId)}`, {
          method: "POST",
          body: JSON.stringify({ content: args.content }),
        }),
      ),
  );

  server.registerTool(
    "update_task_comment",
    {
      description: "Update one of your comments on a task.",
      inputSchema: z.object({
        commentId: nonEmptyString,
        content: nonEmptyString,
      }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/comment/${encodeURIComponent(args.commentId)}`, {
          method: "PUT",
          body: JSON.stringify({ content: args.content }),
        }),
      ),
  );

  server.registerTool(
    "delete_task_comment",
    {
      description: "Delete one of your comments from a task.",
      inputSchema: z.object({ commentId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/comment/${encodeURIComponent(args.commentId)}`, {
          method: "DELETE",
        }),
      ),
  );

  server.registerTool(
    "list_organization_labels",
    {
      description: "List labels defined in a organization.",
      inputSchema: z.object({ organizationId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(
          `/api/label/organization/${encodeURIComponent(args.organizationId)}`,
          { method: "GET" },
        ),
      ),
  );

  server.registerTool(
    "create_label",
    {
      description:
        "Create a label in a organization (optionally attach to a task).",
      inputSchema: z.object({
        name: nonEmptyString,
        color: hexColorSchema,
        organizationId: nonEmptyString,
        taskId: optionalNonEmptyString,
      }),
    },
    async (args) =>
      run(() =>
        client.json("/api/label", {
          method: "POST",
          body: JSON.stringify({
            name: args.name,
            color: args.color,
            organizationId: args.organizationId,
            ...(args.taskId !== undefined ? { taskId: args.taskId } : {}),
          }),
        }),
      ),
  );

  server.registerTool(
    "attach_label_to_task",
    {
      description: "Attach an existing label to a task.",
      inputSchema: z.object({
        labelId: nonEmptyString,
        taskId: nonEmptyString,
      }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/label/${encodeURIComponent(args.labelId)}/task`, {
          method: "PUT",
          body: JSON.stringify({ taskId: args.taskId }),
        }),
      ),
  );

  server.registerTool(
    "detach_label_from_task",
    {
      description: "Detach a label from its current task.",
      inputSchema: z.object({ labelId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/label/${encodeURIComponent(args.labelId)}/task`, {
          method: "DELETE",
        }),
      ),
  );

  server.registerTool(
    "create_task_relation",
    {
      description:
        "Create a relation between two tasks. relationType: 'subtask' (sourceTaskId is the parent, targetTaskId the child), 'blocks' (sourceTaskId blocks targetTaskId), or 'related' (bidirectional).",
      inputSchema: z.object({
        sourceTaskId: nonEmptyString,
        targetTaskId: nonEmptyString,
        relationType: z.enum(["subtask", "blocks", "related"]),
      }),
    },
    async (args) =>
      run(() =>
        client.json("/api/task-relation", {
          method: "POST",
          body: JSON.stringify({
            sourceTaskId: args.sourceTaskId,
            targetTaskId: args.targetTaskId,
            relationType: args.relationType,
          }),
        }),
      ),
  );

  server.registerTool(
    "get_task_relations",
    {
      description:
        "List all relations (subtask/blocks/related) involving a task.",
      inputSchema: z.object({ taskId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/task-relation/${encodeURIComponent(args.taskId)}`, {
          method: "GET",
        }),
      ),
  );

  server.registerTool(
    "delete_task_relation",
    {
      description: "Delete a task relation by its relation ID.",
      inputSchema: z.object({ id: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/task-relation/${encodeURIComponent(args.id)}`, {
          method: "DELETE",
        }),
      ),
  );

  server.registerTool(
    "delete_label",
    {
      description:
        "Delete a label by ID. Only task-associated labels can be deleted; organization-level labels (taskId null) are rejected by the API.",
      inputSchema: z.object({ id: nonEmptyString }),
    },
    async (args) =>
      run(async () => {
        const label = (await client.json(
          `/api/label/${encodeURIComponent(args.id)}`,
          { method: "GET" },
        )) as { taskId?: string | null };
        if (!label?.taskId) {
          throw new Error(
            "Label is not associated with a task and cannot be deleted (organization-level labels are not deletable via this endpoint).",
          );
        }
        return client.json(`/api/label/${encodeURIComponent(args.id)}`, {
          method: "DELETE",
        });
      }),
  );

  /*
   * Tools below close gaps that made the surface above hard for an external
   * agent to use safely, rather than adding more of the same CRUD:
   *
   * - `status` on create/move/update_task is a free-form string, but valid
   *   values are the *board's* column slugs. Without list_board_columns an
   *   agent has to guess and gets a rejected write.
   * - The whole repo/issue/PR side of Kaneo was unreachable, so an agent could
   *   manage tasks but not see the code work they refer to.
   * - Finding anything required knowing its board first; there was no way in
   *   from a name or keyword. `search` already spans every entity server-side.
   * - Assignment took a raw userId with no way to resolve a person to one.
   */

  server.registerTool(
    "list_board_columns",
    {
      description:
        "List a board's statuses (every status is a board row, including Triage, Planned and Duplicate). The `slug` of a status is the exact value the `status` argument of create_task, update_task, update_task_status and move_task expects — call this before writing a status rather than guessing. Each row also returns `statusType` (triage, backlog, unstarted, started, completed, canceled, duplicate), `isFinal` (closes the ticket) and `showOnBoard` (Kanban lane vs Backlog page).",
      inputSchema: z.object({ boardId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/column/${encodeURIComponent(args.boardId)}`, {
          method: "GET",
        }),
      ),
  );

  server.registerTool(
    "search",
    {
      description:
        "Search across tasks, boards, comments, activities, repositories, GitHub issues and pull requests in one call. Use this to resolve a name or keyword to an ID before acting, instead of listing boards and scanning them. `organizationId` is required — get one from list_organizations first.",
      inputSchema: z.object({
        q: nonEmptyString,
        organizationId: nonEmptyString,
        type: z
          .enum([
            "all",
            "tasks",
            "boards",
            "organizations",
            "comments",
            "activities",
            "repositories",
            "issues",
            "pullRequests",
          ])
          .optional(),
        boardId: optionalNonEmptyString,
        limit: z.number().int().positive().max(100).optional(),
      }),
    },
    async (args) =>
      run(() => {
        const params = new URLSearchParams({
          q: args.q,
          organizationId: args.organizationId,
        });
        if (args.type) params.set("type", args.type);
        if (args.boardId) params.set("boardId", args.boardId);
        if (args.limit !== undefined) params.set("limit", String(args.limit));
        return client.json(`/api/search?${params.toString()}`, {
          method: "GET",
        });
      }),
  );

  server.registerTool(
    "list_organization_members",
    {
      description:
        "List members of an organization with their user IDs. Use this to resolve a person's name or email to the `userId` that create_task and update_task expect for assignment.",
      inputSchema: z.object({ organizationId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(
          `/api/auth/organization/list-members?organizationId=${encodeURIComponent(args.organizationId)}`,
          { method: "GET" },
        ),
      ),
  );

  server.registerTool(
    "list_repos",
    {
      description: "List repositories connected to an organization.",
      inputSchema: z.object({ organizationId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(
          `/api/repo?organizationId=${encodeURIComponent(args.organizationId)}`,
          { method: "GET" },
        ),
      ),
  );

  server.registerTool(
    "list_repo_pull_requests",
    {
      description:
        "List pull requests for a connected repository, optionally filtered by state.",
      inputSchema: z.object({
        repoId: nonEmptyString,
        state: z.enum(["open", "closed", "merged", "all"]).optional(),
      }),
    },
    async (args) =>
      run(() => {
        const params = new URLSearchParams();
        if (args.state) params.set("state", args.state);
        const query = params.size > 0 ? `?${params.toString()}` : "";
        return client.json(
          `/api/repo/${encodeURIComponent(args.repoId)}/pull-requests${query}`,
          { method: "GET" },
        );
      }),
  );

  server.registerTool(
    "list_repo_issues",
    {
      description:
        "List GitHub issues for a connected repository, optionally filtered by state.",
      inputSchema: z.object({
        repoId: nonEmptyString,
        state: z.enum(["open", "closed", "all"]).optional(),
      }),
    },
    async (args) =>
      run(() => {
        const params = new URLSearchParams();
        if (args.state) params.set("state", args.state);
        const query = params.size > 0 ? `?${params.toString()}` : "";
        return client.json(
          `/api/repo/${encodeURIComponent(args.repoId)}/issues${query}`,
          { method: "GET" },
        );
      }),
  );

  server.registerTool(
    "get_repo_pull_request_files",
    {
      description:
        "Get the changed files and patches for a pull request — the diff an agent needs to review code rather than only read metadata.",
      inputSchema: z.object({
        repoId: nonEmptyString,
        number: z.number().int().positive(),
      }),
    },
    async (args) =>
      run(() =>
        client.json(
          `/api/repo/${encodeURIComponent(args.repoId)}/pull-requests/${args.number}/files`,
          { method: "GET" },
        ),
      ),
  );

  /*
   * Tables and dashboards (data-table feature). Thin shims over
   * /api/data-table/* like every tool above; the REST routes remain the
   * authority for org membership, the tables/dashboards feature flags and
   * the per-table privilege lattice. The guards below only pre-check with
   * the same rules (#38 pattern) so an agent gets a readable tool error
   * instead of a wrapped HTTP status.
   */
  const dataTableBase = "/api/data-table/organization";
  const guardTable = (
    organizationId: string,
    tableId: string,
    required: "view" | "edit" | "manage",
  ) =>
    userId
      ? assertTablePermission(userId, organizationId, tableId, required)
      : Promise.resolve();
  const guardOrganizationWrite = (organizationId: string) =>
    userId
      ? assertMcpPermission(userId, organizationId, {
          organization: ["update"],
        })
      : Promise.resolve();

  server.registerTool(
    "list_tables",
    {
      description:
        "List data tables in an organization (id, name, slug, icon). Requires the tables feature to be enabled for the organization. Use a returned `id` with the other table tools; `slug` is for building web URLs.",
      inputSchema: z.object({ organizationId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(
          `${dataTableBase}/${encodeURIComponent(args.organizationId)}`,
          { method: "GET" },
        ),
      ),
  );

  server.registerTool(
    "get_table",
    {
      description:
        "Get a data table's schema: its fields (id, name, type, options, position) plus the first page of rows. Use the field ids every row value, filter and dashboard panel metric refers to.",
      inputSchema: z.object({
        organizationId: nonEmptyString,
        tableId: nonEmptyString,
      }),
    },
    async (args) =>
      run(async () => {
        await guardTable(args.organizationId, args.tableId, "view");
        return client.json(
          `${dataTableBase}/${encodeURIComponent(args.organizationId)}/${encodeURIComponent(args.tableId)}`,
          { method: "GET" },
        );
      }),
  );

  server.registerTool(
    "list_table_rows",
    {
      description:
        "List rows of a data table, paged (max 1000 per call). Optional `search` narrows by text across fields; `sortFieldId`/`sortDir` order the result; the response carries `total` so you can page with `offset`.",
      inputSchema: z.object({
        organizationId: nonEmptyString,
        tableId: nonEmptyString,
        search: z.string().max(1000).optional(),
        sortFieldId: optionalNonEmptyString,
        sortDir: z.enum(["asc", "desc"]).optional(),
        limit: z.number().int().min(1).max(1000).optional(),
        offset: z.number().int().min(0).optional(),
      }),
    },
    async (args) => {
      const { organizationId, tableId, sortFieldId, sortDir, ...rest } = args;
      const body: Record<string, unknown> = { ...rest };
      if (sortFieldId) {
        body.sort = [{ fieldId: sortFieldId, dir: sortDir ?? "asc" }];
      }
      return run(async () => {
        await guardTable(organizationId, tableId, "view");
        return client.json(
          `${dataTableBase}/${encodeURIComponent(organizationId)}/${encodeURIComponent(tableId)}/row-query`,
          { method: "POST", body: JSON.stringify(body) },
        );
      });
    },
  );

  server.registerTool(
    "create_table_row",
    {
      description:
        "Create a row in a data table. `values` maps fieldId to the field-typed value (get_table lists fields; select fields take a choice id, dates take ISO strings). Omitted fields stay empty.",
      inputSchema: z.object({
        organizationId: nonEmptyString,
        tableId: nonEmptyString,
        values: z.record(z.string(), z.unknown()),
      }),
    },
    async (args) =>
      run(async () => {
        await guardTable(args.organizationId, args.tableId, "edit");
        return client.json(
          `${dataTableBase}/${encodeURIComponent(args.organizationId)}/${encodeURIComponent(args.tableId)}/rows`,
          {
            method: "POST",
            body: JSON.stringify({ values: args.values }),
          },
        );
      }),
  );

  server.registerTool(
    "update_table_row",
    {
      description:
        "Update one row's cells. `values` maps fieldId to the new value; every provided field is written in order (one cell PUT per field, exactly like the web UI).",
      inputSchema: z.object({
        organizationId: nonEmptyString,
        tableId: nonEmptyString,
        rowId: nonEmptyString,
        values: z.record(z.string(), z.unknown()).describe("fieldId → value"),
      }),
    },
    async (args) =>
      run(async () => {
        await guardTable(args.organizationId, args.tableId, "edit");
        const cellsBase = `${dataTableBase}/${encodeURIComponent(args.organizationId)}/${encodeURIComponent(args.tableId)}/rows/${encodeURIComponent(args.rowId)}/cells`;
        let last: unknown = null;
        for (const [fieldId, value] of Object.entries(args.values)) {
          // Sequential on purpose: a row write is versioned and parallel
          // cell PUTs would race each other.
          last = await client.json(
            `${cellsBase}/${encodeURIComponent(fieldId)}`,
            { method: "PUT", body: JSON.stringify({ value }) },
          );
        }
        return last;
      }),
  );

  server.registerTool(
    "delete_table_row",
    {
      description: "Delete a row from a data table.",
      inputSchema: z.object({
        organizationId: nonEmptyString,
        tableId: nonEmptyString,
        rowId: nonEmptyString,
      }),
    },
    async (args) =>
      run(async () => {
        await guardTable(args.organizationId, args.tableId, "edit");
        return client.json(
          `${dataTableBase}/${encodeURIComponent(args.organizationId)}/${encodeURIComponent(args.tableId)}/rows/${encodeURIComponent(args.rowId)}`,
          { method: "DELETE" },
        );
      }),
  );

  server.registerTool(
    "create_table",
    {
      description:
        "Create an empty data table in an organization. Requires organization update permission (same as the web UI). Add fields with the web UI or get_table afterwards to read generated field ids.",
      inputSchema: z.object({
        organizationId: nonEmptyString,
        name: nonEmptyString,
        icon: z.string().optional(),
      }),
    },
    async (args) =>
      run(async () => {
        await guardOrganizationWrite(args.organizationId);
        return client.json(
          `${dataTableBase}/${encodeURIComponent(args.organizationId)}`,
          {
            method: "POST",
            body: JSON.stringify({
              name: args.name,
              ...(args.icon !== undefined ? { icon: args.icon } : {}),
            }),
          },
        );
      }),
  );

  server.registerTool(
    "list_dashboards",
    {
      description:
        "List dashboards in an organization (id, name, slug, panel count). Requires the dashboards feature to be enabled.",
      inputSchema: z.object({ organizationId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(
          `${dataTableBase}/${encodeURIComponent(args.organizationId)}/dashboards`,
          { method: "GET" },
        ),
      ),
  );

  server.registerTool(
    "get_dashboard",
    {
      description:
        "Get one dashboard including its full panel config (each panel: id, title, type stat|bar|line|area|pie|table, 24-col-grid span, and its metric/groupBy/filters query against a table).",
      inputSchema: z.object({
        organizationId: nonEmptyString,
        dashboardId: nonEmptyString,
      }),
    },
    async (args) =>
      run(() =>
        client.json(
          `${dataTableBase}/${encodeURIComponent(args.organizationId)}/dashboards/${encodeURIComponent(args.dashboardId)}`,
          { method: "GET" },
        ),
      ),
  );

  server.registerTool(
    "create_dashboard",
    {
      description:
        "Create an empty dashboard in an organization. Add panels afterwards with update_dashboard (or use generate_dashboard to fill one automatically). Requires organization update permission.",
      inputSchema: z.object({
        organizationId: nonEmptyString,
        name: nonEmptyString,
      }),
    },
    async (args) =>
      run(async () => {
        await guardOrganizationWrite(args.organizationId);
        return client.json(
          `${dataTableBase}/${encodeURIComponent(args.organizationId)}/dashboards`,
          {
            method: "POST",
            body: JSON.stringify({ name: args.name }),
          },
        );
      }),
  );

  server.registerTool(
    "update_dashboard",
    {
      description:
        "Update a dashboard's name and/or replace its panels. Each panel needs title, type (stat|bar|line|area|pie|table), span (6|8|9|12|15|16|24 of a 24-col grid) and a query: {tableId, metric:{agg: count|sum|avg|min|max, fieldId?}, groupBy?:{fieldId, bucket?: day|week|month}, filters?:[{fieldId, op, value}], limit?}. Omitted panel ids are generated. Panels must reference real table ids (validated server-side). Requires organization update permission.",
      inputSchema: z.object({
        organizationId: nonEmptyString,
        dashboardId: nonEmptyString,
        name: optionalNonEmptyString,
        panels: dashboardPanelsSchema.optional(),
      }),
    },
    async (args) =>
      run(async () => {
        await guardOrganizationWrite(args.organizationId);
        const body: Record<string, unknown> = {};
        if (args.name !== undefined) body.name = args.name;
        if (args.panels !== undefined) {
          body.panels = args.panels.map((panel) => ({
            ...panel,
            id: panel.id ?? randomUUID(),
          }));
        }
        return client.json(
          `${dataTableBase}/${encodeURIComponent(args.organizationId)}/dashboards/${encodeURIComponent(args.dashboardId)}`,
          { method: "PUT", body: JSON.stringify(body) },
        );
      }),
  );

  server.registerTool(
    "delete_dashboard",
    {
      description:
        "Delete a dashboard and its panel config. Requires organization update permission.",
      inputSchema: z.object({
        organizationId: nonEmptyString,
        dashboardId: nonEmptyString,
      }),
    },
    async (args) =>
      run(async () => {
        await guardOrganizationWrite(args.organizationId);
        return client.json(
          `${dataTableBase}/${encodeURIComponent(args.organizationId)}/dashboards/${encodeURIComponent(args.dashboardId)}`,
          { method: "DELETE" },
        );
      }),
  );

  server.registerTool(
    "generate_dashboard",
    {
      description:
        "Generate a dashboard from a data table using Kaneo's configured AI provider. Pass a tableId and a natural-language description of the wanted overview; returns the created dashboard with panels (metric/stat/grouped charts) whose queries reference the table's real field ids. Requires the AI feature enabled and organization update permission.",
      inputSchema: z.object({
        organizationId: nonEmptyString,
        tableId: nonEmptyString,
        description: nonEmptyString.describe(
          "What the dashboard should show, e.g. 'revenue by month and top customers'",
        ),
        name: optionalNonEmptyString.describe(
          "Optional dashboard name; defaults to the AI's suggestion",
        ),
      }),
    },
    async (args) =>
      run(async () => {
        await guardTable(args.organizationId, args.tableId, "view");
        await guardOrganizationWrite(args.organizationId);
        const generated = (await client.json(
          `/api/ai/organization/${encodeURIComponent(args.organizationId)}/generate-dashboard`,
          {
            method: "POST",
            body: JSON.stringify({
              tableId: args.tableId,
              description: args.description,
            }),
          },
        )) as { name?: string; panels: unknown[] };
        const created = (await client.json(
          `${dataTableBase}/${encodeURIComponent(args.organizationId)}/dashboards`,
          {
            method: "POST",
            body: JSON.stringify({
              name: args.name ?? generated.name ?? "Generated dashboard",
            }),
          },
        )) as { id: string };
        return client.json(
          `${dataTableBase}/${encodeURIComponent(args.organizationId)}/dashboards/${encodeURIComponent(created.id)}`,
          { method: "PUT", body: JSON.stringify({ panels: generated.panels }) },
        );
      }),
  );
}
