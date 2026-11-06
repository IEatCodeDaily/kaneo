import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import {
  createRemoteJWKSet,
  type JWTPayload,
  type JWTVerifyGetKey,
  jwtVerify,
} from "jose";
import * as z from "zod";

/**
 * Teams tab single sign-on. Teams issues an Entra ID token for OUR app
 * registration (audience) only to the Teams app whose manifest declares it.
 * We verify it and sign in the EXISTING Kaneo user; never create users here.
 *
 * Identity: the user is bound by Entra object id (`oid`, immutable). The first
 * Teams sign-in links `oid` to the Kaneo user with the same, already VERIFIED
 * email; after that the email is no longer consulted.
 */
export const TEAMS_SSO_PROVIDER = "teams-sso";

/** Microsoft first-party Teams clients; the only callers we accept (azp). */
export const TEAMS_CLIENT_IDS = [
  "1fec8e78-bce4-4aaf-ab1b-5451cc387264", // Teams desktop + mobile
  "5e3ce6c0-2b1f-4285-8d4b-75ee78787346", // Teams web
];

export type TeamsSsoConfig = {
  tenantId: string;
  clientId: string;
  /** Lower-cased email domains allowed to sign in this way. */
  allowedDomains: string[];
};

export type TeamsIdentity = { oid: string; email: string };

export function teamsSsoConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): TeamsSsoConfig | null {
  const tenantId = env.TEAMS_SSO_TENANT_ID?.trim();
  const clientId = env.TEAMS_SSO_CLIENT_ID?.trim();
  const domains = env.TEAMS_SSO_ALLOWED_DOMAINS?.split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  if (!tenantId || !clientId || !domains?.length) return null;
  return { tenantId, clientId, allowedDomains: domains };
}

/** Pure claim checks on an already signature-verified token. */
export function identityFromTeamsClaims(
  claims: JWTPayload & Record<string, unknown>,
  config: TeamsSsoConfig,
): TeamsIdentity {
  if (claims.tid !== config.tenantId) throw new Error("wrong tenant");
  if (!TEAMS_CLIENT_IDS.includes(String(claims.azp))) {
    throw new Error("token not requested by Microsoft Teams");
  }
  const scopes = String(claims.scp ?? "").split(" ");
  if (!scopes.includes("access_as_user")) throw new Error("missing scope");
  const oid = String(claims.oid ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(oid)) throw new Error("missing oid");
  const email = String(claims.preferred_username ?? "")
    .trim()
    .toLowerCase();
  const domain = email.split("@")[1];
  if (!domain || !config.allowedDomains.includes(domain)) {
    throw new Error("email domain not allowed");
  }
  return { oid, email };
}

export function teamsSso(
  config: TeamsSsoConfig,
  jwks: JWTVerifyGetKey = createRemoteJWKSet(
    new URL(
      `https://login.microsoftonline.com/${config.tenantId}/discovery/v2.0/keys`,
    ),
  ),
): BetterAuthPlugin {
  return {
    id: TEAMS_SSO_PROVIDER,
    endpoints: {
      teamsSsoSignIn: createAuthEndpoint(
        "/teams-sso/sign-in",
        { method: "POST", body: z.object({ token: z.string().min(1) }) },
        async (ctx) => {
          let identity: TeamsIdentity;
          try {
            const { payload } = await jwtVerify(ctx.body.token, jwks, {
              algorithms: ["RS256"],
              issuer: `https://login.microsoftonline.com/${config.tenantId}/v2.0`,
              audience: [
                config.clientId,
                `api://task.noovoleum.site/${config.clientId}`,
              ],
            });
            identity = identityFromTeamsClaims(payload, config);
          } catch {
            throw new APIError("UNAUTHORIZED", {
              message: "Invalid Teams token",
            });
          }
          const adapter = ctx.context.internalAdapter;
          let userId = (
            await adapter.findAccountByProviderId(
              identity.oid,
              TEAMS_SSO_PROVIDER,
            )
          )?.userId;
          if (!userId) {
            // First Teams sign-in: link only to an account whose email the
            // user has already proven (OIDC/OTP/invite), never a bare claim.
            const found = await adapter.findUserByEmail(identity.email);
            if (!found?.user?.emailVerified) {
              throw new APIError("FORBIDDEN", { message: "no_kaneo_account" });
            }
            await adapter.linkAccount({
              userId: found.user.id,
              providerId: TEAMS_SSO_PROVIDER,
              accountId: identity.oid,
            });
            userId = found.user.id;
          }
          const user = await adapter.findUserById(userId);
          if (!user) {
            throw new APIError("FORBIDDEN", { message: "no_kaneo_account" });
          }
          const session = await adapter.createSession(user.id);
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ ok: true });
        },
      ),
    },
  };
}
