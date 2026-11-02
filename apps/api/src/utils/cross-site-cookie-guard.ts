import type { MiddlewareHandler } from "hono";

/**
 * With ALLOW_EMBEDDING the session cookie is SameSite=None (Teams tab), so the
 * browser attaches it to cross-site requests. This guard restores what Lax gave
 * us, at the server:
 * - unsafe methods (POST/PUT/PATCH/DELETE) from another site are refused,
 *   with or without a cookie (also blocks login-CSRF into an attacker account);
 * - cookie-bearing cross-site requests are refused, except top-level GET
 *   navigations (links into the app);
 * - OAuth callback paths are exempt (IdPs may form_post back; better-auth's
 *   own state/PKCE check protects them).
 * Fetch Metadata (Sec-Fetch-Site) is the primary signal; Origin is the
 * fallback for clients that do not send it. Server-to-server callers (API keys,
 * MCP, webhooks) send neither and pass.
 */
export type GuardRequest = {
  method: string;
  path: string;
  cookie?: string;
  origin?: string;
  secFetchSite?: string;
  secFetchMode?: string;
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const EXEMPT_PATHS = ["/api/auth/callback/", "/api/auth/oauth2/callback/"];

export function isBlockedCrossSiteRequest(
  req: GuardRequest,
  allowedOrigins: string[],
): boolean {
  if (EXEMPT_PATHS.some((p) => req.path.startsWith(p))) return false;
  // Our own web app (also when served from a sibling subdomain).
  if (req.origin !== undefined && allowedOrigins.includes(req.origin)) {
    return false;
  }
  const unsafe = !SAFE_METHODS.has(req.method.toUpperCase());

  const site = req.secFetchSite?.toLowerCase();
  if (site) {
    if (site === "same-origin" || site === "none") return false;
    // same-site or cross-site from here on
    if (unsafe) return true;
    if (!req.cookie) return false;
    return req.secFetchMode?.toLowerCase() !== "navigate";
  }

  // No Fetch Metadata: fall back to Origin.
  if (req.origin === undefined) return false;
  return unsafe || Boolean(req.cookie);
}

export function crossSiteCookieGuard(trustedUrls: string[]): MiddlewareHandler {
  // Compare origins, not raw config strings ("https://x/" must match "https://x").
  const allowedOrigins = trustedUrls.flatMap((url) => {
    try {
      return [new URL(url).origin];
    } catch {
      return [];
    }
  });
  return async (c, next) => {
    const blocked = isBlockedCrossSiteRequest(
      {
        method: c.req.method,
        path: c.req.path,
        cookie: c.req.header("cookie"),
        origin: c.req.header("origin"),
        secFetchSite: c.req.header("sec-fetch-site"),
        secFetchMode: c.req.header("sec-fetch-mode"),
      },
      allowedOrigins,
    );
    if (blocked) return c.text("Forbidden", 403);
    await next();
  };
}
