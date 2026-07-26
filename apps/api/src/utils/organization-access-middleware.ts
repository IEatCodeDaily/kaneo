import { and, eq } from "drizzle-orm";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../database";
import { validateOrganizationAccess } from "./validate-organization-access";

type OrganizationIdSource =
  | { type: "query"; key: string }
  | { type: "body"; key: string }
  | { type: "param"; key: string }
  | {
      type: "lookup";
      resource:
        | "board"
        | "task"
        | "label"
        | "timeEntry"
        | "activity"
        | "comment"
        | "column"
        | "workflowRule";
      idKey: string;
    };

type OrganizationAccessMiddlewareConfig = {
  sources: OrganizationIdSource[];
};

async function readJsonObjectBody(
  c: Context,
): Promise<Record<string, unknown>> {
  const raw = (await c.req.json().catch(() => ({}))) || {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {};
  }
  return raw as Record<string, unknown>;
}

export function organizationAccessMiddleware(
  config: OrganizationAccessMiddlewareConfig,
) {
  return async (c: Context, next: Next) => {
    const userId = c.get("userId");

    if (!userId) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    let organizationId: string | null = null;

    for (const source of config.sources) {
      if (source.type === "query") {
        organizationId = c.req.query(source.key) || null;
      } else if (source.type === "body") {
        const body = await readJsonObjectBody(c);
        organizationId =
          typeof body[source.key] === "string" ? body[source.key] : null;
      } else if (source.type === "param") {
        organizationId = c.req.param(source.key) || null;
      } else if (source.type === "lookup") {
        const body = await readJsonObjectBody(c);
        const idFromBody =
          typeof body[source.idKey] === "string" ? body[source.idKey] : null;
        const id =
          c.req.param(source.idKey) || c.req.query(source.idKey) || idFromBody;
        if (id) {
          organizationId = await lookupOrganizationId(source.resource, id);
        }
      }

      if (organizationId) {
        break;
      }
    }

    if (!organizationId) {
      throw new HTTPException(400, {
        message: "Organization ID could not be determined",
      });
    }

    const apiKey = c.get("apiKey");
    const apiKeyId = apiKey?.id;

    await validateOrganizationAccess(userId, organizationId, apiKeyId);

    c.set("organizationId", organizationId);

    return next();
  };
}

async function lookupOrganizationId(
  resource:
    | "board"
    | "task"
    | "label"
    | "timeEntry"
    | "activity"
    | "comment"
    | "column"
    | "workflowRule",
  id: string,
): Promise<string | null> {
  try {
    switch (resource) {
      case "board": {
        const [board] = await db
          .select({ organizationId: schema.boardTable.organizationId })
          .from(schema.boardTable)
          .where(eq(schema.boardTable.id, id))
          .limit(1);
        return board?.organizationId || null;
      }

      case "task": {
        const [task] = await db
          .select({
            organizationId: schema.boardTable.organizationId,
          })
          .from(schema.taskTable)
          .innerJoin(
            schema.boardTable,
            eq(schema.taskTable.boardId, schema.boardTable.id),
          )
          .where(eq(schema.taskTable.id, id))
          .limit(1);
        return task?.organizationId || null;
      }

      case "label": {
        const [label] = await db
          .select({ organizationId: schema.labelTable.organizationId })
          .from(schema.labelTable)
          .where(eq(schema.labelTable.id, id))
          .limit(1);
        return label?.organizationId || null;
      }

      case "timeEntry": {
        const [timeEntry] = await db
          .select({
            organizationId: schema.boardTable.organizationId,
          })
          .from(schema.timeEntryTable)
          .innerJoin(
            schema.taskTable,
            eq(schema.timeEntryTable.taskId, schema.taskTable.id),
          )
          .innerJoin(
            schema.boardTable,
            eq(schema.taskTable.boardId, schema.boardTable.id),
          )
          .where(eq(schema.timeEntryTable.id, id))
          .limit(1);
        return timeEntry?.organizationId || null;
      }

      case "activity": {
        const [activity] = await db
          .select({
            organizationId: schema.boardTable.organizationId,
          })
          .from(schema.activityTable)
          .innerJoin(
            schema.taskTable,
            eq(schema.activityTable.taskId, schema.taskTable.id),
          )
          .innerJoin(
            schema.boardTable,
            eq(schema.taskTable.boardId, schema.boardTable.id),
          )
          .where(eq(schema.activityTable.id, id))
          .limit(1);
        return activity?.organizationId || null;
      }

      case "comment": {
        const [comment] = await db
          .select({
            organizationId: schema.boardTable.organizationId,
          })
          .from(schema.activityTable)
          .innerJoin(
            schema.taskTable,
            eq(schema.activityTable.taskId, schema.taskTable.id),
          )
          .innerJoin(
            schema.boardTable,
            eq(schema.taskTable.boardId, schema.boardTable.id),
          )
          .where(
            and(
              eq(schema.activityTable.id, id),
              eq(schema.activityTable.type, "comment"),
            ),
          )
          .limit(1);
        return comment?.organizationId || null;
      }

      case "column": {
        const [column] = await db
          .select({
            organizationId: schema.boardTable.organizationId,
          })
          .from(schema.columnTable)
          .innerJoin(
            schema.boardTable,
            eq(schema.columnTable.boardId, schema.boardTable.id),
          )
          .where(eq(schema.columnTable.id, id))
          .limit(1);
        return column?.organizationId || null;
      }

      case "workflowRule": {
        const [workflowRule] = await db
          .select({
            organizationId: schema.boardTable.organizationId,
          })
          .from(schema.workflowRuleTable)
          .innerJoin(
            schema.boardTable,
            eq(schema.workflowRuleTable.boardId, schema.boardTable.id),
          )
          .where(eq(schema.workflowRuleTable.id, id))
          .limit(1);
        return workflowRule?.organizationId || null;
      }

      default:
        return null;
    }
  } catch (error) {
    console.error(`Error looking up organizationId for ${resource}:`, error);
    return null;
  }
}

export const organizationAccess = {
  fromQuery: (key = "organizationId") =>
    organizationAccessMiddleware({ sources: [{ type: "query", key }] }),

  fromBody: (key = "organizationId") =>
    organizationAccessMiddleware({ sources: [{ type: "body", key }] }),

  fromParam: (key = "organizationId") =>
    organizationAccessMiddleware({ sources: [{ type: "param", key }] }),

  fromBoard: (idKey = "id") =>
    organizationAccessMiddleware({
      sources: [{ type: "lookup", resource: "board", idKey }],
    }),

  fromTask: (idKey = "id") =>
    organizationAccessMiddleware({
      sources: [
        { type: "lookup", resource: "task", idKey },
        { type: "query", key: "organizationId" },
      ],
    }),

  fromTaskId: (idKey = "taskId") =>
    organizationAccessMiddleware({
      sources: [
        { type: "lookup", resource: "task", idKey },
        { type: "query", key: "organizationId" },
      ],
    }),

  fromLabel: (idKey = "id") =>
    organizationAccessMiddleware({
      sources: [
        { type: "lookup", resource: "label", idKey },
        { type: "query", key: "organizationId" },
      ],
    }),

  fromTimeEntry: (idKey = "id") =>
    organizationAccessMiddleware({
      sources: [
        { type: "lookup", resource: "timeEntry", idKey },
        { type: "query", key: "organizationId" },
      ],
    }),

  fromActivity: (idKey = "id") =>
    organizationAccessMiddleware({
      sources: [
        { type: "lookup", resource: "activity", idKey },
        { type: "query", key: "organizationId" },
      ],
    }),

  fromComment: (idKey = "id") =>
    organizationAccessMiddleware({
      sources: [
        { type: "lookup", resource: "comment", idKey },
        { type: "query", key: "organizationId" },
      ],
    }),

  fromColumn: (idKey = "id") =>
    organizationAccessMiddleware({
      sources: [
        { type: "lookup", resource: "column", idKey },
        { type: "query", key: "organizationId" },
      ],
    }),

  fromWorkflowRule: (idKey = "id") =>
    organizationAccessMiddleware({
      sources: [
        { type: "lookup", resource: "workflowRule", idKey },
        { type: "query", key: "organizationId" },
      ],
    }),
};
