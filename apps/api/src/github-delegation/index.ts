import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver } from "hono-openapi";
import * as v from "valibot";
import { auth } from "../auth";
import db from "../database";
import {
  githubDelegationStateTable,
  githubUserGrantTable,
} from "../database/schema";

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const PROVIDER_ID = "github-delegation";
const STATE_TTL_MS = 10 * 60 * 1000;

const delegationStatusSchema = v.object({
  connected: v.boolean(),
  githubLogin: v.nullable(v.string()),
  scope: v.nullable(v.string()),
  accessTokenExpiresAt: v.nullable(v.string()),
  refreshTokenExpiresAt: v.nullable(v.string()),
});

function configuredClient(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GITHUB_DELEGATION_CLIENT_ID?.trim();
  const clientSecret = process.env.GITHUB_DELEGATION_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new HTTPException(503, {
      message: "GitHub user delegation is not configured",
    });
  }
  return { clientId, clientSecret };
}

function callbackUrl(): string {
  const apiUrl = (process.env.KANEO_API_URL || "http://localhost:1337").replace(/\/$/, "");
  return `${apiUrl}/api/github-delegation/callback`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function getExpiry(value: unknown): Date | null {
  return typeof value === "number" && Number.isFinite(value)
    ? new Date(Date.now() + value * 1000)
    : null;
}

function clientRedirect(result: "connected" | "denied" | "failed"): Response {
  const clientUrl = process.env.KANEO_CLIENT_URL || "http://localhost:5173";
  const url = new URL(clientUrl);
  url.searchParams.set("github-delegation", result);
  return Response.redirect(url.toString(), 303);
}

async function currentSession(request: Request) {
  const result = await auth.api.getSession({ headers: request.headers });
  if (!result?.user || !result.session) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }
  return result;
}

/** Refresh an expiring GitHub OAuth App user token when GitHub issued one. */
export async function refreshGitHubDelegationGrant(userId: string) {
  const [grant] = await db
    .select()
    .from(githubUserGrantTable)
    .where(
      and(
        eq(githubUserGrantTable.userId, userId),
        eq(githubUserGrantTable.providerId, PROVIDER_ID),
      ),
    )
    .limit(1);
  if (!grant?.refreshToken) {
    throw new HTTPException(409, {
      message: "This GitHub grant is not refreshable",
    });
  }

  const { clientId, clientSecret } = configuredClient();
  const response = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: grant.refreshToken,
    }),
  });
  const tokens = (await response.json()) as Record<string, unknown>;
  if (!response.ok || typeof tokens.access_token !== "string") {
    throw new HTTPException(502, { message: "GitHub token refresh failed" });
  }
  const [updated] = await db
    .update(githubUserGrantTable)
    .set({
      accessToken: tokens.access_token,
      refreshToken:
        typeof tokens.refresh_token === "string"
          ? tokens.refresh_token
          : grant.refreshToken,
      accessTokenExpiresAt: getExpiry(tokens.expires_in),
      refreshTokenExpiresAt: getExpiry(tokens.refresh_token_expires_in),
      scope: typeof tokens.scope === "string" ? tokens.scope : grant.scope,
      updatedAt: new Date(),
    })
    .where(eq(githubUserGrantTable.id, grant.id))
    .returning();
  return updated;
}

export async function handleGitHubDelegationCallback(c: Context) {
  const providerError = c.req.query("error");
  const state = c.req.query("state");
  const code = c.req.query("code");
  if (providerError || !state || !code) return clientRedirect("denied");

  let session: Awaited<ReturnType<typeof currentSession>>;
  try {
    session = await currentSession(c.req.raw);
  } catch {
    return clientRedirect("failed");
  }

  const [pending] = await db
    .delete(githubDelegationStateTable)
    .where(
      and(
        eq(githubDelegationStateTable.stateHash, sha256(state)),
        eq(githubDelegationStateTable.userId, session.user.id),
        eq(githubDelegationStateTable.sessionId, session.session.id),
        gt(githubDelegationStateTable.expiresAt, new Date()),
      ),
    )
    .returning();
  if (!pending) return clientRedirect("failed");

  try {
    const { clientId, clientSecret } = configuredClient();
    const tokenResponse = await fetch(GITHUB_TOKEN_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: callbackUrl(),
      }),
    });
    const tokens = (await tokenResponse.json()) as Record<string, unknown>;
    if (!tokenResponse.ok || typeof tokens.access_token !== "string") {
      throw new Error("GitHub token exchange failed");
    }

    const identityResponse = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${tokens.access_token}`,
        "User-Agent": "Kaneo",
      },
    });
    const identity = (await identityResponse.json()) as Record<string, unknown>;
    if (!identityResponse.ok || typeof identity.id !== "number" || typeof identity.login !== "string") {
      throw new Error("GitHub identity lookup failed");
    }

    await db
      .insert(githubUserGrantTable)
      .values({
        userId: session.user.id,
        providerId: PROVIDER_ID,
        githubUserId: String(identity.id),
        githubLogin: identity.login,
        accessToken: tokens.access_token,
        refreshToken: typeof tokens.refresh_token === "string" ? tokens.refresh_token : null,
        accessTokenExpiresAt: getExpiry(tokens.expires_in),
        refreshTokenExpiresAt: getExpiry(tokens.refresh_token_expires_in),
        scope: typeof tokens.scope === "string" ? tokens.scope : null,
      })
      .onConflictDoUpdate({
        target: [githubUserGrantTable.userId, githubUserGrantTable.providerId],
        set: {
          githubUserId: String(identity.id), githubLogin: identity.login,
          accessToken: tokens.access_token,
          refreshToken: typeof tokens.refresh_token === "string" ? tokens.refresh_token : null,
          accessTokenExpiresAt: getExpiry(tokens.expires_in),
          refreshTokenExpiresAt: getExpiry(tokens.refresh_token_expires_in),
          scope: typeof tokens.scope === "string" ? tokens.scope : null,
          updatedAt: new Date(),
        },
      });
    return clientRedirect("connected");
  } catch (error) {
    console.error("GitHub delegation callback failed", error);
    return clientRedirect("failed");
  }
}

const githubDelegation = new Hono<{ Variables: { userId: string; session: { id: string } | null } }>()
  .get(
    "/initiate",
    describeRoute({ operationId: "initiateGitHubDelegation", tags: ["GitHub"], description: "Begin GitHub user-delegation authorization (repo write and user identity).", responses: { 302: { description: "Redirect to GitHub" }, 503: { description: "GitHub delegation is not configured" } } }),
    async (c) => {
      const { clientId } = configuredClient();
      const userId = c.get("userId");
      const sessionId = c.get("session")?.id;
      if (!userId || !sessionId) throw new HTTPException(401, { message: "A browser session is required" });
      const state = randomBytes(32).toString("base64url");
      const now = new Date();
      await db.delete(githubDelegationStateTable).where(eq(githubDelegationStateTable.userId, userId));
      await db.insert(githubDelegationStateTable).values({ userId, sessionId, stateHash: sha256(state), expiresAt: new Date(now.getTime() + STATE_TTL_MS) });
      const url = new URL(GITHUB_AUTHORIZE_URL);
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("redirect_uri", callbackUrl());
      url.searchParams.set("scope", "repo read:user user:email");
      url.searchParams.set("state", state);
      return c.redirect(url.toString(), 302);
    },
  )
  .get("/status", describeRoute({ operationId: "getGitHubDelegationStatus", tags: ["GitHub"], description: "Get GitHub user-delegation connection status without exposing tokens.", responses: { 200: { description: "Delegation status", content: { "application/json": { schema: resolver(delegationStatusSchema) } } } } }), async (c) => {
    const [grant] = await db.select().from(githubUserGrantTable).where(and(eq(githubUserGrantTable.userId, c.get("userId")), eq(githubUserGrantTable.providerId, PROVIDER_ID))).limit(1);
    return c.json({ connected: Boolean(grant), githubLogin: grant?.githubLogin ?? null, scope: grant?.scope ?? null, accessTokenExpiresAt: grant?.accessTokenExpiresAt?.toISOString() ?? null, refreshTokenExpiresAt: grant?.refreshTokenExpiresAt?.toISOString() ?? null });
  })
  .post("/refresh", describeRoute({ operationId: "refreshGitHubDelegation", tags: ["GitHub"], description: "Refresh an expiring GitHub user-delegation token when GitHub supplied a refresh token.", responses: { 204: { description: "Delegation refreshed" }, 409: { description: "Grant is not refreshable" } } }), async (c) => {
    await refreshGitHubDelegationGrant(c.get("userId"));
    return c.body(null, 204);
  })
  .delete("/disconnect", describeRoute({ operationId: "disconnectGitHubDelegation", tags: ["GitHub"], description: "Disconnect GitHub user delegation and delete stored user tokens.", responses: { 204: { description: "Delegation removed" } } }), async (c) => {
    await db.delete(githubUserGrantTable).where(and(eq(githubUserGrantTable.userId, c.get("userId")), eq(githubUserGrantTable.providerId, PROVIDER_ID)));
    return c.body(null, 204);
  });

export default githubDelegation;
