import { createHash, randomBytes } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../database";

/*
 * Agents are first-class members: a human user and an agent user are treated
 * identically, and access is decided by the member's ROLE via
 * `resource-access.ts` — not by what kind of principal is asking.
 *
 * This used to be a hardcoded allowlist that capped agents at
 * board/task read+create+update, label read and organization read. That
 * silently denied an agent things its own role permits (deleting a task,
 * managing labels, anything team-scoped) even when it was an organization
 * owner. The vocabulary below is therefore descriptive, not restrictive: it
 * lists the resources and actions that exist so a typo is still rejected, and
 * every action a role can perform is available to an agent holding that role.
 */
export const RESOURCE_ACTIONS = ["read", "create", "update", "delete"] as const;
export const KNOWN_RESOURCES = [
  "board",
  "task",
  "label",
  "organization",
  "team",
  "milestone",
  "comment",
] as const;

type AgentMetadata = {
  type: "agent";
  organizationId: string;
  createdBy: string;
  agentUserId: string;
};

function metadata(row: { metadata: string | null }): AgentMetadata | null {
  try {
    const value = JSON.parse(row.metadata ?? "null") as Partial<AgentMetadata>;
    return value.type === "agent" && typeof value.organizationId === "string"
      ? (value as AgentMetadata)
      : null;
  } catch {
    return null;
  }
}

async function requireAdmin(userId: string, organizationId: string) {
  const [member] = await db
    .select({ role: schema.organizationMemberTable.role })
    .from(schema.organizationMemberTable)
    .where(
      and(
        eq(schema.organizationMemberTable.userId, userId),
        eq(schema.organizationMemberTable.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!member || !["owner", "admin"].includes(member.role)) {
    throw new HTTPException(403, {
      message: "Organization admin access required",
    });
  }
}

export function validatePermissions(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HTTPException(400, {
      message: "Explicit permissions are required",
    });
  }
  const result: Record<string, string[]> = {};
  for (const [resource, actions] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (
      !(KNOWN_RESOURCES as readonly string[]).includes(resource) ||
      !Array.isArray(actions) ||
      actions.length === 0 ||
      actions.some(
        (action) =>
          typeof action !== "string" ||
          !(RESOURCE_ACTIONS as readonly string[]).includes(action),
      )
    ) {
      throw new HTTPException(400, {
        message: `Invalid agent permission: ${resource}`,
      });
    }
    result[resource] = [...new Set(actions as string[])];
  }
  if (Object.keys(result).length === 0)
    throw new HTTPException(400, {
      message: "At least one permission is required",
    });
  return result;
}

/*
 * The agent (a user with role "agent" + an organization membership) and its
 * token (an `apikey` row) are separate: the agent keeps its identity, role and
 * history while its token is reissued or revoked. Tokens never expire; an
 * admin rotates or revokes them explicitly.
 */
function agentKeyValues(
  agentUserId: string,
  organizationId: string,
  createdBy: string,
  name: string,
  permissions: Record<string, string[]>,
) {
  const secret = `kaneo_agent_${randomBytes(32).toString("base64url")}`;
  const now = new Date();
  return {
    secret,
    values: {
      id: createId(),
      name,
      start: secret.slice(0, 16),
      referenceId: agentUserId,
      key: createHash("sha256").update(secret).digest("base64url"),
      enabled: true,
      expiresAt: null,
      createdAt: now,
      updatedAt: now,
      permissions: JSON.stringify(permissions),
      metadata: JSON.stringify({
        type: "agent",
        organizationId,
        createdBy,
        agentUserId,
      } satisfies AgentMetadata),
    },
  };
}

/** The agent user and the one organization it belongs to, or 404. */
async function findAgent(agentUserId: string) {
  const [row] = await db
    .select({
      id: schema.userTable.id,
      name: schema.userTable.name,
      organizationId: schema.organizationMemberTable.organizationId,
    })
    .from(schema.userTable)
    .innerJoin(
      schema.organizationMemberTable,
      eq(schema.organizationMemberTable.userId, schema.userTable.id),
    )
    .where(
      and(
        eq(schema.userTable.id, agentUserId),
        eq(schema.userTable.role, "agent"),
      ),
    )
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "Agent not found" });
  return row;
}

const agent = new Hono<{ Variables: { userId: string } }>();

agent.get("/", async (c) => {
  const organizationId = c.req.query("organizationId");
  if (!organizationId)
    throw new HTTPException(400, { message: "organizationId is required" });
  await requireAdmin(c.get("userId"), organizationId);
  const agents = await db
    .select({
      id: schema.userTable.id,
      name: schema.userTable.name,
      createdAt: schema.userTable.createdAt,
    })
    .from(schema.userTable)
    .innerJoin(
      schema.organizationMemberTable,
      eq(schema.organizationMemberTable.userId, schema.userTable.id),
    )
    .where(
      and(
        eq(schema.userTable.role, "agent"),
        eq(schema.organizationMemberTable.organizationId, organizationId),
      ),
    )
    .orderBy(desc(schema.userTable.createdAt));
  const keys = agents.length
    ? await db
        .select()
        .from(schema.apikeyTable)
        .where(
          inArray(
            schema.apikeyTable.referenceId,
            agents.map((a) => a.id),
          ),
        )
        .orderBy(desc(schema.apikeyTable.createdAt))
    : [];
  return c.json(
    agents.map((a) => {
      const key = keys.find(
        (k) => k.referenceId === a.id && metadata(k) && k.enabled,
      );
      return {
        id: a.id,
        name: a.name,
        createdAt: a.createdAt,
        type: "agent" as const,
        token: key
          ? {
              id: key.id,
              start: key.start,
              createdAt: key.createdAt,
            }
          : null,
      };
    }),
  );
});

agent.post("/", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const organizationId =
    typeof body.organizationId === "string" ? body.organizationId : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const userId = c.get("userId");
  if (!organizationId || name.length < 3) {
    throw new HTTPException(400, {
      message: "Name (3+ characters) and organizationId are required",
    });
  }
  await requireAdmin(userId, organizationId);
  const permissions = validatePermissions(body.permissions);
  const agentUserId = createId();
  const { secret, values } = agentKeyValues(
    agentUserId,
    organizationId,
    userId,
    name,
    permissions,
  );
  await db.transaction(async (tx) => {
    await tx.insert(schema.userTable).values({
      id: agentUserId,
      name,
      email: `agent-${agentUserId}@agents.invalid`,
      emailVerified: false,
      role: "agent",
    });
    await tx.insert(schema.organizationMemberTable).values({
      id: createId(),
      organizationId,
      userId: agentUserId,
      role: "member",
      joinedAt: values.createdAt,
    });
    await tx.insert(schema.apikeyTable).values(values);
  });
  return c.json(
    { id: agentUserId, name, key: secret, start: values.start, type: "agent" },
    201,
  );
});

/** Issue a new token; any previous token for this agent stops working. */
agent.post("/:id/token", async (c) => {
  const found = await findAgent(c.req.param("id"));
  const userId = c.get("userId");
  await requireAdmin(userId, found.organizationId);
  const { secret, values } = agentKeyValues(
    found.id,
    found.organizationId,
    userId,
    found.name,
    // Kept for API-key record compatibility; agent access follows its role.
    { board: ["read"] },
  );
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.apikeyTable)
      .where(eq(schema.apikeyTable.referenceId, found.id));
    await tx.insert(schema.apikeyTable).values(values);
  });
  return c.json({ id: found.id, key: secret, start: values.start }, 201);
});

/** Remove the agent entirely: its tokens, then the user (membership cascades). */
agent.delete("/:id", async (c) => {
  const found = await findAgent(c.req.param("id"));
  await requireAdmin(c.get("userId"), found.organizationId);
  // Deleted explicitly: older databases lack the apikey -> user cascade.
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.apikeyTable)
      .where(eq(schema.apikeyTable.referenceId, found.id));
    await tx.delete(schema.userTable).where(eq(schema.userTable.id, found.id));
  });
  return c.json({ success: true });
});

export default agent;
