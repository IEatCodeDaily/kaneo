import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
  crossSiteCookieGuard,
  isBlockedCrossSiteRequest,
} from "../../apps/api/src/utils/cross-site-cookie-guard";

const allowed = ["https://task.example.com"];
const evil = "https://evil.example";
const blocked = (r: Parameters<typeof isBlockedCrossSiteRequest>[0]) =>
  isBlockedCrossSiteRequest(r, allowed);

describe("isBlockedCrossSiteRequest (Fetch Metadata)", () => {
  it("blocks a cross-site POST even without a cookie (login CSRF)", () => {
    expect(
      blocked({
        method: "POST",
        path: "/api/auth/teams-sso/sign-in",
        secFetchSite: "cross-site",
        origin: evil,
      }),
    ).toBe(true);
  });

  it("blocks cookie-bearing cross-site subresource GETs (img/script/ws)", () => {
    for (const mode of ["no-cors", "cors", "websocket"]) {
      expect(
        blocked({
          method: "GET",
          path: "/api/task/x",
          cookie: "s=1",
          secFetchSite: "cross-site",
          secFetchMode: mode,
        }),
      ).toBe(true);
    }
  });

  it("allows top-level cross-site navigations (links into the app)", () => {
    expect(
      blocked({
        method: "GET",
        path: "/api/asset/1",
        cookie: "s=1",
        secFetchSite: "cross-site",
        secFetchMode: "navigate",
      }),
    ).toBe(false);
  });

  it("allows our own web app on a sibling subdomain (same-site + trusted Origin)", () => {
    expect(
      isBlockedCrossSiteRequest(
        {
          method: "POST",
          path: "/api/task/x",
          cookie: "s=1",
          secFetchSite: "same-site",
          origin: "https://app.example.com",
        },
        ["https://app.example.com"],
      ),
    ).toBe(false);
  });

  it("allows same-origin and user-initiated requests", () => {
    for (const site of ["same-origin", "none"]) {
      expect(
        blocked({
          method: "POST",
          path: "/api/task/x",
          cookie: "s=1",
          secFetchSite: site,
        }),
      ).toBe(false);
    }
  });

  it("exempts OAuth callbacks (IdP form_post)", () => {
    expect(
      blocked({
        method: "POST",
        path: "/api/auth/oauth2/callback/custom",
        cookie: "s=1",
        secFetchSite: "cross-site",
        origin: "null",
      }),
    ).toBe(false);
  });
});

describe("isBlockedCrossSiteRequest (Origin fallback, no Fetch Metadata)", () => {
  it("blocks foreign and opaque origins on unsafe or cookie-bearing requests", () => {
    expect(blocked({ method: "POST", path: "/x", origin: evil })).toBe(true);
    expect(
      blocked({ method: "GET", path: "/x", origin: "null", cookie: "s=1" }),
    ).toBe(true);
  });

  it("allows our origin and header-less server-to-server callers", () => {
    expect(
      blocked({
        method: "POST",
        path: "/x",
        origin: allowed[0],
        cookie: "s=1",
      }),
    ).toBe(false);
    expect(blocked({ method: "POST", path: "/api/mcp" })).toBe(false);
  });
});

describe("crossSiteCookieGuard", () => {
  const app = new Hono();
  app.use("*", crossSiteCookieGuard(["https://task.example.com/"]));
  app.all("*", (c) => c.text("ok"));

  it("returns 403 for a cross-site form post", async () => {
    const res = await app.request("/api/task/x", {
      method: "POST",
      headers: { "sec-fetch-site": "cross-site", origin: evil },
    });
    expect(res.status).toBe(403);
  });

  it("matches a configured URL with a trailing slash against the bare Origin", async () => {
    const res = await app.request("/api/task/x", {
      method: "POST",
      headers: { cookie: "s=1", origin: "https://task.example.com" },
    });
    expect(res.status).toBe(200);
  });
});
