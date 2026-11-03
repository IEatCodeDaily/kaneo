import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import {
  importJWK,
  type JWK,
  type JWTPayload,
  type JWTVerifyGetKey,
  jwtVerify,
} from "jose";
import db from "../database";
import { accountTable, taskTable, userTable } from "../database/schema";
import { resolveTicketIdentity } from "../identity/resolve-ticket-identity";
import { getResourcePrivilege, privilegeAllows } from "../resource-access";
import { TEAMS_SSO_PROVIDER } from "./teams-sso";

/**
 * Teams link unfurling (bot-based message extension, composeExtension/queryLink).
 *
 * Trust chain: Bot Framework signs every invoke (JWT, iss api.botframework.com,
 * aud = our bot app id). We verify it, require the invoke's tenant to be ours,
 * then resolve the PASTER by Entra object id through the account row that Teams
 * SSO wrote (never by name/email). A card is returned only when that Kaneo user
 * can view the task's board; it carries no description or comments.
 *
 * The card is returned synchronously in the invoke response, so the bot never
 * calls Bot Framework back and needs no client secret.
 */
export type TeamsUnfurlConfig = {
  botAppId: string;
  tenantId: string;
  clientUrl: string;
};

export function teamsUnfurlConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): TeamsUnfurlConfig | null {
  const botAppId = env.TEAMS_BOT_APP_ID?.trim();
  const tenantId = env.TEAMS_SSO_TENANT_ID?.trim();
  const clientUrl = env.KANEO_CLIENT_URL?.trim().replace(/\/+$/, "");
  if (!botAppId || !tenantId || !clientUrl) return null;
  return { botAppId, tenantId, clientUrl };
}

const BOT_FRAMEWORK_ISSUER = "https://api.botframework.com";
const BOT_FRAMEWORK_JWKS = "https://login.botframework.com/v1/.well-known/keys";
const TEAMS_CHANNEL = "msteams";

type EndorsedJwk = JWK & { kid?: string; endorsements?: string[] };

/**
 * Bot Framework key resolver that only yields keys endorsed for Teams.
 * A token signed by a key not endorsed for "msteams" (Web Chat, Direct Line…)
 * fails verification, as the Bot Framework auth spec requires.
 */
export function teamsEndorsedKeys(
  fetchKeys: () => Promise<EndorsedJwk[]> = fetchBotFrameworkKeys,
): JWTVerifyGetKey {
  return async (header) => {
    const jwk = (await fetchKeys()).find((k) => k.kid === header.kid);
    if (!jwk?.endorsements?.includes(TEAMS_CHANNEL)) {
      throw new Error("signing key not endorsed for Teams");
    }
    return importJWK({ ...jwk, alg: "RS256" }, "RS256");
  };
}

// ponytail: in-process cache, 12h TTL (spec: refresh at least every 24h).
let keyCache: { at: number; keys: EndorsedJwk[] } | null = null;
async function fetchBotFrameworkKeys(): Promise<EndorsedJwk[]> {
  if (keyCache && Date.now() - keyCache.at < 12 * 3600_000)
    return keyCache.keys;
  const res = await fetch(BOT_FRAMEWORK_JWKS, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`jwks ${res.status}`);
  const { keys } = (await res.json()) as { keys: EndorsedJwk[] };
  keyCache = { at: Date.now(), keys };
  return keys;
}

export type TaskRef = { taskId: string } | { org: string; key: string };

/**
 * Task reference from a Kaneo URL on our own origin, else null. Accepts the
 * long form /board/<id>/task/<taskId> and the short form
 * /dashboard/<org>/tickets/<KEY-123> (what the UI's "copy link" produces).
 */
export function taskRefFromUrl(raw: string, clientUrl: string): TaskRef | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.origin !== new URL(clientUrl).origin) return null;
  const short = url.pathname.match(
    /^\/dashboard\/([A-Za-z0-9_-]{1,64})\/tickets\/([A-Za-z0-9][A-Za-z0-9_-]{0,63}-\d{1,9})\/?$/,
  );
  if (short?.[1] && short[2]) return { org: short[1], key: short[2] };
  const taskId = taskIdFromUrl(raw, clientUrl);
  return taskId ? { taskId } : null;
}

/** Task id from a long-form Kaneo task URL on our own origin, else null. */
export function taskIdFromUrl(raw: string, clientUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.origin !== new URL(clientUrl).origin) return null;
  const m = url.pathname.match(/\/task\/([A-Za-z0-9_-]{8,64})\/?$/);
  return m?.[1] ?? null;
}

type Activity = {
  type?: string;
  channelId?: string;
  name?: string;
  serviceUrl?: string;
  from?: { aadObjectId?: string };
  conversation?: { tenantId?: string };
  channelData?: { tenant?: { id?: string } };
  value?: { url?: string };
};

export type CardTask = {
  key: string;
  title: string;
  status: string;
  priority: string | null;
  assignee: string | null;
  board: string;
  url: string;
};

/** Adaptive Card 1.3 (Teams link-unfurl limit). Fields only, no body text. */
export function unfurlResponse(t: CardTask) {
  const card = {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.3",
    body: [
      {
        type: "TextBlock",
        text: `${t.key} · ${t.title}`,
        weight: "Bolder",
        size: "Medium",
        wrap: true,
      },
      {
        type: "FactSet",
        facts: [
          { title: "Status", value: t.status },
          { title: "Priority", value: t.priority ?? "none" },
          { title: "Assignee", value: t.assignee ?? "Unassigned" },
          { title: "Board", value: t.board },
        ],
      },
    ],
    actions: [{ type: "Action.OpenUrl", title: "Open in Kaneo", url: t.url }],
  };
  const attachment = {
    contentType: "application/vnd.microsoft.card.adaptive",
    content: card,
    preview: {
      contentType: "application/vnd.microsoft.card.thumbnail",
      content: {
        title: `${t.key} · ${t.title}`,
        text: `${t.status} · ${t.board}`,
      },
    },
  };
  return {
    composeExtension: {
      type: "result",
      attachmentLayout: "list",
      attachments: [attachment],
    },
  };
}

const NO_CARD = {
  composeExtension: {
    type: "result",
    attachmentLayout: "list",
    attachments: [],
  },
};

export async function loadCardTask(
  ref: TaskRef,
  aadObjectId: string,
  clientUrl: string,
): Promise<CardTask | null> {
  const [link] = await db
    .select({ userId: accountTable.userId, banned: userTable.banned })
    .from(accountTable)
    .innerJoin(userTable, eq(userTable.id, accountTable.userId))
    .where(
      and(
        eq(accountTable.providerId, TEAMS_SSO_PROVIDER),
        eq(accountTable.accountId, aadObjectId),
      ),
    )
    .limit(1);
  // Unknown paster (never used the Teams tab) or banned user: no card.
  if (!link || link.banned) return null;
  let taskId: string;
  if ("taskId" in ref) {
    taskId = ref.taskId;
  } else {
    const identity = await resolveTicketIdentity(ref.org, ref.key);
    if (!identity) return null;
    taskId = identity.ticketId;
  }
  const task = await db.query.taskTable.findFirst({
    where: eq(taskTable.id, taskId),
    with: { board: true, assignee: true },
  });
  if (!task) return null;
  const privilege = await getResourcePrivilege({
    organizationId: task.board.organizationId,
    resourceType: "board",
    resourceId: task.boardId,
    userId: link.userId,
  });
  if (!privilegeAllows(privilege, "view")) return null;
  return {
    key: `${task.board.slug.toUpperCase()}-${task.number}`,
    title: task.title,
    status: task.status,
    priority: task.priority,
    assignee: task.assignee?.name ?? null,
    board: task.board.name,
    url: `${clientUrl}/dashboard/organization/${task.board.organizationId}/board/${task.boardId}/task/${task.id}`,
  };
}

/**
 * POST /api/teams/messages. Returns 401 for anything not signed by Bot
 * Framework for our bot; otherwise always 200 with a card or an empty result
 * (no difference between "missing" and "forbidden", so ids can't be probed).
 */
export function teamsMessagesHandler(
  config: TeamsUnfurlConfig,
  keys: JWTVerifyGetKey = teamsEndorsedKeys(),
  load: typeof loadCardTask = loadCardTask,
) {
  return async (c: Context) => {
    const auth = c.req.header("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    let claims: JWTPayload & { serviceurl?: string };
    try {
      ({ payload: claims } = await jwtVerify(token, keys, {
        algorithms: ["RS256"],
        issuer: BOT_FRAMEWORK_ISSUER,
        audience: config.botAppId,
        clockTolerance: 300,
        requiredClaims: ["exp", "serviceurl"],
      }));
    } catch (err) {
      // Reason + non-secret claim names only; never log the token itself.
      let peek: Record<string, unknown> = {};
      try {
        const p = JSON.parse(
          Buffer.from(token.split(".")[1] ?? "", "base64url").toString(),
        );
        const h = JSON.parse(
          Buffer.from(token.split(".")[0] ?? "", "base64url").toString(),
        );
        peek = {
          iss: p.iss,
          aud: p.aud,
          hasExp: "exp" in p,
          hasServiceUrl: "serviceurl" in p,
          alg: h.alg,
          kid: h.kid,
        };
      } catch {}
      console.warn(
        "teams-unfurl: token rejected:",
        (err as Error)?.message,
        peek,
      );
      return c.json({ error: "unauthorized" }, 401);
    }
    const activity = (await c.req.json().catch(() => ({}))) as Activity;
    // The token is bound to the channel endpoint that sent this activity,
    // and only the Teams channel may ask for cards.
    if (
      claims.serviceurl !== activity.serviceUrl ||
      activity.channelId !== "msteams"
    ) {
      console.warn("teams-unfurl: activity rejected:", {
        channelId: activity.channelId,
        serviceUrlMatches: claims.serviceurl === activity.serviceUrl,
      });
      return c.json({ error: "unauthorized" }, 401);
    }
    if (
      activity.type === "invoke" &&
      activity.name === "composeExtension/query"
    ) {
      // ponytail: search command exists only so Teams registers the extension;
      // returns no results. Implement search when someone asks for it.
      return c.json(NO_CARD, 200);
    }
    if (
      activity.type !== "invoke" ||
      activity.name !== "composeExtension/queryLink"
    ) {
      return c.json({}, 200);
    }
    const tenant =
      activity.channelData?.tenant?.id ?? activity.conversation?.tenantId;
    const aadObjectId = activity.from?.aadObjectId;
    const ref = taskRefFromUrl(activity.value?.url ?? "", config.clientUrl);
    if (tenant !== config.tenantId || !aadObjectId || !ref) {
      return c.json(NO_CARD, 200);
    }
    const task = await load(ref, aadObjectId, config.clientUrl);
    return c.json(task ? unfurlResponse(task) : NO_CARD, 200);
  };
}
